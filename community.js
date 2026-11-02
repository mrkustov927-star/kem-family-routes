(function () {
  "use strict";

  const config = window.KEM_SUPABASE_CONFIG || {};
  const sdk = window.supabase;
  const listeners = new Set();
  let client = null;
  let user = null;
  let profile = null;
  let schemaReady = false;
  let realtimeChannel = null;
  let passwordRecovery = false;

  function emit(event, payload) {
    listeners.forEach(listener => {
      try { listener(event, payload); } catch (error) { console.error(error); }
    });
  }

  function normalizeError(error, fallback) {
    if (!error) return new Error(fallback);
    const message = error.message || fallback;
    const code = String(error.code || "");
    if (/Invalid login credentials/i.test(message)) return new Error("Неверная почта или пароль");
    if (/Email not confirmed/i.test(message)) return new Error("Сначала подтвердите почту по ссылке из письма");
    if (code === "over_email_send_rate_limit" || /email rate limit exceeded/i.test(message)) {
      return new Error("Лимит писем временно исчерпан. Подождите около часа с момента последнего письма и попробуйте снова");
    }
    if (code === "over_request_rate_limit" || /for security purposes.*request.*after|rate limit.*seconds/i.test(message)) {
      return new Error("Письмо уже запрошено. Повторить отправку можно через минуту");
    }
    if (/relation .* does not exist|schema cache|could not find the table|PGRST205/i.test(message)) {
      schemaReady = false;
      return new Error("Общая база ещё не подготовлена: нужно выполнить установочный SQL");
    }
    return new Error(message);
  }

  async function loadProfile() {
    profile = null;
    if (!client || !user) return null;
    const { data, error } = await client.from("profiles").select("id, display_name, role").eq("id", user.id).maybeSingle();
    if (error) throw normalizeError(error, "Не удалось загрузить профиль");
    profile = data || { id: user.id, display_name: user.email?.split("@")[0] || "Участник", role: "participant" };
    schemaReady = true;
    return profile;
  }

  async function refreshSession() {
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw normalizeError(error, "Не удалось проверить вход");
    user = data.session?.user || null;
    if (user) {
      try { await loadProfile(); } catch (error) { emit("error", error); }
    } else {
      profile = null;
    }
    emit("auth", current());
    return current();
  }

  async function init() {
    if (!sdk?.createClient || !config.url || !config.publishableKey) {
      emit("unavailable", { reason: "config" });
      return current();
    }
    client = sdk.createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    client.auth.onAuthStateChange((event, session) => {
      window.setTimeout(async () => {
        user = session?.user || null;
        if (event === "PASSWORD_RECOVERY") passwordRecovery = true;
        if (user) {
          try { await loadProfile(); } catch (error) { emit("error", error); }
        } else {
          profile = null;
        }
        if (event === "PASSWORD_RECOVERY") emit("password-recovery", current());
        emit("auth", current());
      }, 0);
    });
    return refreshSession();
  }

  function current() {
    return {
      available: Boolean(client),
      user,
      profile,
      authenticated: Boolean(user),
      passwordRecovery,
      schemaReady
    };
  }

  function on(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  async function signIn(email, password) {
    if (!client) throw new Error("Подключение к общей базе недоступно");
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw normalizeError(error, "Не удалось войти");
    await refreshSession();
  }

  async function sendMagicLink(email) {
    if (!client) throw new Error("Подключение к общей базе недоступно");
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: false }
    });
    if (error) throw normalizeError(error, "Не удалось отправить ссылку");
  }

  async function requestPasswordReset(email) {
    if (!client) throw new Error("Подключение к общей базе недоступно");
    const basePath = window.location.pathname.replace(/index\.html$/i, "");
    const redirectUrl = new URL(basePath, window.location.origin);
    redirectUrl.searchParams.set("password-recovery", "1");
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl.toString()
    });
    if (error) throw normalizeError(error, "Не удалось отправить письмо для восстановления");
  }

  async function updatePassword(password) {
    if (!client || !user) throw new Error("Ссылка восстановления недействительна или уже истекла. Запросите новое письмо");
    const { error } = await client.auth.updateUser({ password });
    if (error) throw normalizeError(error, "Не удалось изменить пароль");
    passwordRecovery = false;
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("password-recovery");
    cleanUrl.hash = "";
    window.history.replaceState({}, document.title, `${cleanUrl.pathname}${cleanUrl.search}`);
    emit("auth", current());
  }

  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw normalizeError(error, "Не удалось выйти");
    passwordRecovery = false;
  }

  async function updateDisplayName(displayName) {
    if (!client || !user) throw new Error("Сначала войдите");
    const cleanName = String(displayName || "").trim();
    if (!cleanName) throw new Error("Введите имя участника");
    let { data, error } = await client
      .from("profiles")
      .update({ display_name: cleanName })
      .eq("id", user.id)
      .select("id")
      .maybeSingle();
    if (!error && !data) {
      const inserted = await client.from("profiles").insert({ id: user.id, display_name: cleanName }).select("id").single();
      data = inserted.data;
      error = inserted.error;
    }
    if (error) throw normalizeError(error, "Не удалось сохранить имя");
    const { error: metadataError } = await client.auth.updateUser({ data: { display_name: cleanName } });
    if (metadataError) console.warn("Profile metadata was not updated", metadataError);
    await loadProfile();
    emit("auth", current());
  }

  async function fetchWorkspace() {
    if (!client) return { points: [], photos: [], waypoints: [] };
    const [pointsResult, photosResult, waypointResult] = await Promise.all([
      client.from("points").select("*").order("route_order", { ascending: true, nullsFirst: false }),
      client.from("photos").select("*").neq("status", "archived").order("created_at", { ascending: false }),
      client.from("route_waypoints").select("*").eq("route_id", "main").order("position")
    ]);
    const error = pointsResult.error || photosResult.error || waypointResult.error;
    if (error) throw normalizeError(error, "Не удалось загрузить общую карту");
    schemaReady = true;
    const photos = (photosResult.data || []).map(photo => {
      const publicUrl = client.storage.from("point-photos").getPublicUrl(photo.storage_path).data.publicUrl;
      return { ...photo, publicUrl };
    });
    return { points: pointsResult.data || [], photos, waypoints: waypointResult.data || [] };
  }

  async function seedPoints(records) {
    if (!client || !user || !records.length) return false;
    const { data: existingPoints, error: lookupError } = await client.from("points").select("id");
    if (lookupError) throw normalizeError(lookupError, "Не удалось проверить исходные точки");
    const existingIds = new Set((existingPoints || []).map(point => point.id));
    const payload = records
      .filter(record => !existingIds.has(record.id))
      .map(record => ({ ...record, created_by: user.id, updated_by: user.id }));
    if (!payload.length) return false;
    const { error } = await client.from("points").insert(payload);
    if (error) throw normalizeError(error, "Не удалось перенести исходные точки");
    return true;
  }

  async function savePoint(record) {
    if (!client || !user) throw new Error("Для общей правки нужно войти");
    const { data: existingPoint, error: lookupError } = await client
      .from("points")
      .select("id, content, updated_at")
      .eq("id", record.id)
      .maybeSingle();
    if (lookupError) throw normalizeError(lookupError, "Не удалось проверить точку");

    let result;
    if (existingPoint) {
      const {
        id,
        created_by: _createdBy,
        created_at: _createdAt,
        updated_at: _updatedAt,
        ...changes
      } = record;
      // The ordinary point editor does not edit this section. Keep the latest
      // saved value even if another participant opened the point form earlier.
      if (changes.content && Object.prototype.hasOwnProperty.call(existingPoint.content || {}, "visualEvidence")) {
        changes.content = { ...changes.content, visualEvidence: existingPoint.content.visualEvidence };
      }
      result = await client
        .from("points")
        .update({ ...changes, updated_by: user.id })
        .eq("id", id)
        .eq("updated_at", existingPoint.updated_at)
        .select()
        .maybeSingle();
    } else {
      result = await client
        .from("points")
        .insert({ ...record, created_by: user.id, updated_by: user.id })
        .select()
        .single();
    }
    const { data, error } = result;
    if (error) throw normalizeError(error, "Не удалось сохранить точку");
    if (!data) throw new Error("Карточка изменилась во время сохранения. Проверьте её и попробуйте снова.");
    return data;
  }

  function canonicalJson(value) {
    if (Array.isArray(value)) return value.map(canonicalJson);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalJson(value[key])]));
    }
    return value;
  }

  async function saveVisualEvidence(pointId, evidence, baseline) {
    if (!client || !user) throw new Error("Для общей правки нужно войти");
    const { data: latest, error: lookupError } = await client.from("points")
      .select("id, content, updated_at, status").eq("id", pointId).maybeSingle();
    if (lookupError) throw normalizeError(lookupError, "Не удалось проверить карточку");
    if (!latest || latest.status === "archived") throw new Error("Карточка не найдена. Сначала сохраните точку в общей карте.");
    const content = latest.content || {};
    const hasSaved = Object.prototype.hasOwnProperty.call(content, "visualEvidence");
    const unchanged = hasSaved === baseline.hasValue && (!hasSaved ||
      JSON.stringify(canonicalJson(content.visualEvidence)) === JSON.stringify(canonicalJson(baseline.value)));
    if (!unchanged) throw new Error("Другой участник уже изменил этот раздел. Скопируйте свои изменения и откройте раздел заново.");
    const { data, error } = await client.from("points")
      .update({ content: { ...content, visualEvidence: evidence }, updated_by: user.id })
      .eq("id", pointId).eq("updated_at", latest.updated_at).select("id, updated_at").maybeSingle();
    if (error) throw normalizeError(error, "Не удалось сохранить раздел");
    if (!data) throw new Error("Карточка изменилась во время сохранения. Ваши изменения остались в форме — попробуйте ещё раз.");
    return data;
  }

  async function archivePoint(pointId) {
    if (!client || !user) throw new Error("Для удаления точки нужно войти");
    if (profile?.role !== "admin") throw new Error("Удалять точки может только администратор");
    const { error } = await client.from("points")
      .update({ status: "archived", updated_by: user.id })
      .eq("id", pointId).select("id").single();
    if (error) throw normalizeError(error, "Не удалось удалить точку");
    const { error: photosError } = await client.from("photos")
      .update({ status: "archived", updated_by: user.id }).eq("point_id", pointId);
    if (photosError) console.warn("Point photos were not archived", photosError);
  }

  async function deletePhoto(photoId) {
    if (!client || !user) throw new Error("Для удаления фотографии нужно войти");
    const { data: photo, error: lookupError } = await client.from("photos")
      .select("id, storage_path, created_by").eq("id", photoId).single();
    if (lookupError) throw normalizeError(lookupError, "Фотография не найдена");
    const allowed = photo.created_by === user.id || ["moderator", "admin"].includes(profile?.role);
    if (!allowed) throw new Error("Удалить фотографию может её автор, редактор или администратор");
    const { error } = await client.from("photos").delete().eq("id", photoId);
    if (error) throw normalizeError(error, "Не удалось удалить фотографию");
    if (photo.storage_path) {
      const { error: storageError } = await client.storage.from("point-photos").remove([photo.storage_path]);
      if (storageError) console.warn("Deleted photo file could not be removed", storageError);
    }
  }

  async function uploadPhoto({ pointId, file, title, caption, shotDate, author, source, rightsStatus }) {
    if (!client || !user) throw new Error("Для загрузки фотографии нужно войти");
    const extension = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "webp";
    const photoId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const path = `${user.id}/${photoId}.${extension}`;
    const { error: uploadError } = await client.storage.from("point-photos").upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false
    });
    if (uploadError) throw normalizeError(uploadError, "Не удалось загрузить файл");
    const { data, error } = await client.from("photos").insert({
      id: photoId,
      point_id: pointId,
      title,
      caption,
      shot_date: shotDate,
      author,
      source,
      rights_status: rightsStatus,
      storage_path: path,
      status: "draft",
      created_by: user.id,
      updated_by: user.id
    }).select().single();
    if (error) {
      await client.storage.from("point-photos").remove([path]);
      throw normalizeError(error, "Не удалось записать фотографию");
    }
    return { ...data, publicUrl: client.storage.from("point-photos").getPublicUrl(path).data.publicUrl };
  }

  async function uploadPointCover({ pointId, file }) {
    if (!client || !user) throw new Error("Для загрузки обложки нужно войти");
    const extension = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "webp";
    const coverId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const safePointId = String(pointId || "point").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) || "point";
    const path = `${user.id}/covers/${safePointId}-${coverId}.${extension}`;
    const { error } = await client.storage.from("point-photos").upload(path, file, {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false
    });
    if (error) throw normalizeError(error, "Не удалось загрузить обложку");
    return {
      storagePath: path,
      publicUrl: client.storage.from("point-photos").getPublicUrl(path).data.publicUrl
    };
  }

  async function uploadEvidenceImage({ pointId, file }) {
    if (!client || !user) throw new Error("Для загрузки фотографии нужно войти");
    const types = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    if (!types[file.type]) throw new Error("Выберите изображение JPG, PNG или WebP");
    if (file.size > 10 * 1024 * 1024) throw new Error("Размер изображения не должен превышать 10 МБ");
    const imageId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const safePointId = String(pointId || "point").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) || "point";
    const path = `${user.id}/evidence/${safePointId}-${imageId}.${types[file.type]}`;
    const { error } = await client.storage.from("point-photos").upload(path, file, {
      cacheControl: "31536000", contentType: file.type, upsert: false
    });
    if (error) throw normalizeError(error, "Не удалось загрузить изображение");
    return { storagePath: path, publicUrl: client.storage.from("point-photos").getPublicUrl(path).data.publicUrl };
  }

  async function saveRouteWaypoints(waypoints) {
    if (!client || !user) throw new Error("Для редактирования маршрута нужно войти");
    const { error } = await client.rpc("replace_main_route_waypoints", { p_waypoints: waypoints });
    if (error) throw normalizeError(error, "Не удалось сохранить маршрут");
  }

  function subscribeToWorkspace() {
    if (!client || realtimeChannel) return;
    realtimeChannel = client.channel("kem-shared-map")
      .on("postgres_changes", { event: "*", schema: "public", table: "points" }, payload => emit("workspace", payload))
      .on("postgres_changes", { event: "*", schema: "public", table: "photos" }, payload => emit("workspace", payload))
      .on("postgres_changes", { event: "*", schema: "public", table: "route_waypoints" }, payload => emit("workspace", payload))
      .subscribe();
  }

  window.KemCommunity = {
    init,
    current,
    on,
    signIn,
    sendMagicLink,
    requestPasswordReset,
    updatePassword,
    signOut,
    updateDisplayName,
    fetchWorkspace,
    seedPoints,
    savePoint,
    saveVisualEvidence,
    archivePoint,
    deletePhoto,
    uploadPhoto,
    uploadPointCover,
    uploadEvidenceImage,
    saveRouteWaypoints,
    subscribeToWorkspace
  };
})();
