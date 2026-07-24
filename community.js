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
    const { error } = await client.from("profiles").upsert({ id: user.id, display_name: displayName, role: profile?.role || "participant" }, { onConflict: "id" });
    if (error) throw normalizeError(error, "Не удалось сохранить имя");
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
      .select("id")
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
      result = await client
        .from("points")
        .update({ ...changes, updated_by: user.id })
        .eq("id", id)
        .select()
        .single();
    } else {
      result = await client
        .from("points")
        .insert({ ...record, created_by: user.id, updated_by: user.id })
        .select()
        .single();
    }
    const { data, error } = result;
    if (error) throw normalizeError(error, "Не удалось сохранить точку");
    return data;
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
    uploadPhoto,
    saveRouteWaypoints,
    subscribeToWorkspace
  };
})();
