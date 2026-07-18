(function () {
  "use strict";

  const route = window.KEM_ROUTE;
  const photos = window.KEM_PHOTOS || [];
  const routeGeometry = window.KEM_ROUTE_GEOMETRY || null;
  const community = window.KemCommunity || null;
  const guidedPoints = [...route.points].sort((a, b) => a.number - b.number);
  const STORAGE_PROGRESS = "kem-route-progress-v1";
  const STORAGE_EDITS = "kem-route-edits-v1";
  const STORAGE_ROUTE_ISSUES = "kem-route-issues-v1";
  const STORAGE_PHOTO_DRAFTS = "kem-route-photo-drafts-v1";
  const YANDEX_MAPS_API_KEY = "0eee433d-7b26-4439-94d2-6ee11f533686";
  const ROUTE_ISSUE_TYPES = {
    closed: "Проход закрыт",
    crossing: "Опасный переход",
    sidewalk: "Нет тротуара",
    geometry: "Линия идёт не по дороге",
    stop: "Нет безопасного места для группы",
    other: "Другое"
  };
  const state = {
    filter: "all",
    planFilter: "all",
    currentPointIndex: 0,
    completed: new Set(readStorage(STORAGE_PROGRESS, [])),
    edits: readStorage(STORAGE_EDITS, []),
    routeIssues: readStorage(STORAGE_ROUTE_ISSUES, []),
    photoDrafts: readStorage(STORAGE_PHOTO_DRAFTS, []),
    markers: new Map(),
    mapProvider: "yandex",
    map: null,
    routeLayer: null,
    photoLayer: null,
    routeIssueLayer: null,
    coordinateDraftLayer: null,
    coordinateMode: false,
    relocatingDraftId: null,
    routeReviewMode: false,
    coordinateMarker: null,
    userMarker: null,
    accuracyCircle: null,
    routeCoordinates: [],
    routeEditMode: false,
    routeDraft: [],
    photosVisible: false,
    coordinatePreview: null,
    userLocation: null,
    userAccuracy: 0,
    yandexMap: null,
    yandexClasses: null,
    yandexObjects: [],
    yandexReady: false,
    yandexStatus: "idle",
    sharedPointRecords: [],
    sharedPhotos: [],
    sharedWaypoints: [],
    community: { available: false, authenticated: false, user: null, profile: null, schemaReady: false },
    workspaceRefreshTimer: null
  };

  const els = {
    map: document.querySelector("#map"),
    yandexMap: document.querySelector("#yandexMap"),
    mapPanel: document.querySelector(".map-panel"),
    pointsList: document.querySelector("#pointsList"),
    pointsPanel: document.querySelector("#pointsPanel"),
    chapterFilter: document.querySelector("#chapterFilter"),
    pointDialog: document.querySelector("#pointDialog"),
    pointDialogContent: document.querySelector("#pointDialogContent"),
    editDialog: document.querySelector("#editDialog"),
    editForm: document.querySelector("#editForm"),
    guidePanel: document.querySelector("#guidePanel"),
    guideContent: document.querySelector("#guideContent"),
    guideStep: document.querySelector("#guideStep"),
    progressText: document.querySelector("#progressText"),
    progressBar: document.querySelector("#progressBar"),
    planFilters: document.querySelector("#planFilters"),
    planGrid: document.querySelector("#planGrid"),
    readyCount: document.querySelector("#readyCount"),
    readinessBar: document.querySelector("#readinessBar"),
    photoStrip: document.querySelector("#photoStrip"),
    photoDialog: document.querySelector("#photoDialog"),
    photoDialogContent: document.querySelector("#photoDialogContent"),
    photoUploadDialog: document.querySelector("#photoUploadDialog"),
    photoUploadForm: document.querySelector("#photoUploadForm"),
    photoPoint: document.querySelector("#photoPoint"),
    photoFile: document.querySelector("#photoFile"),
    photoUploadPreview: document.querySelector("#photoUploadPreview"),
    savePhotoButton: document.querySelector("#savePhotoButton"),
    coordinateDialog: document.querySelector("#coordinateDialog"),
    coordinateForm: document.querySelector("#coordinateForm"),
    coordinateNewPointLabel: document.querySelector("#coordinateNewPointLabel"),
    coordinateNewPointName: document.querySelector("#coordinateNewPointName"),
    draftPointDialog: document.querySelector("#draftPointDialog"),
    draftPointForm: document.querySelector("#draftPointForm"),
    draftPointEditId: document.querySelector("#draftPointEditId"),
    draftPointName: document.querySelector("#draftPointName"),
    draftPointNote: document.querySelector("#draftPointNote"),
    draftPointAuthor: document.querySelector("#draftPointAuthor"),
    draftPointLat: document.querySelector("#draftPointLat"),
    draftPointLng: document.querySelector("#draftPointLng"),
    routeIssueDialog: document.querySelector("#routeIssueDialog"),
    routeIssueForm: document.querySelector("#routeIssueForm"),
    routeIssueCount: document.querySelector("#routeIssueCount"),
    routeDistance: document.querySelector("#routeDistance"),
    routeWalkingTime: document.querySelector("#routeWalkingTime"),
    syncStatus: document.querySelector("#syncStatus"),
    accountButton: document.querySelector("#accountButton"),
    authDialog: document.querySelector("#authDialog"),
    authForm: document.querySelector("#authForm"),
    authSignedOut: document.querySelector("#authSignedOut"),
    authSignedIn: document.querySelector("#authSignedIn"),
    sharedPointDialog: document.querySelector("#sharedPointDialog"),
    sharedPointForm: document.querySelector("#sharedPointForm"),
    sharedPointSaveButton: document.querySelector("#sharedPointSaveButton"),
    routeEditor: document.querySelector("#routeEditor"),
    routeEditorCount: document.querySelector("#routeEditorCount"),
    toast: document.querySelector("#toast")
  };

  function readStorage(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      return Array.isArray(parsed) ? parsed : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function saveProgress() {
    localStorage.setItem(STORAGE_PROGRESS, JSON.stringify([...state.completed]));
    updateProgress();
  }

  function updateProgress() {
    const total = guidedPoints.length;
    const done = state.completed.size;
    els.progressText.textContent = `${done} из ${total} точек`;
    els.progressBar.style.width = `${(done / total) * 100}%`;
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 2600);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[character]);
  }

  function allPhotos() {
    const items = [...photos, ...state.sharedPhotos, ...state.photoDrafts];
    return [...new Map(items.map(photo => [photo.id, photo])).values()];
  }

  function photoPointDetails(pointId) {
    const guided = guidedPoints.find(point => point.id === pointId);
    if (guided) return { id: guided.id, title: guided.title, number: guided.number, coordinates: guided.coordinates };
    const planned = route.plannedPoints.find(point => point.id === pointId);
    const shared = state.sharedPointRecords.find(point => point.id === pointId);
    const draft = state.edits.find(edit => edit.field === "new-point" && edit.pointId === pointId);
    if (draft) return { id: draft.pointId, title: draft.pointName, number: "+", coordinates: draft.coordinates };
    if (shared) return {
      id: shared.id,
      title: shared.title,
      number: shared.route_order || "+",
      coordinates: Number.isFinite(shared.latitude) && Number.isFinite(shared.longitude) ? [shared.latitude, shared.longitude] : null
    };
    if (planned) return { id: planned.id, title: planned.title, number: planned.number, coordinates: null };
    return null;
  }

  function setSyncStatus(status, label, detail = "") {
    els.syncStatus.dataset.state = status;
    els.syncStatus.querySelector("span").textContent = label;
    els.syncStatus.dataset.message = detail || label;
    els.syncStatus.title = detail ? `${label}: ${detail}` : label;
  }

  function userIsAuthenticated() {
    return Boolean(state.community?.authenticated);
  }

  function requireParticipant(message = "Для общей правки войдите как участник") {
    if (userIsAuthenticated()) return true;
    showToast(message);
    renderAuthState();
    els.authDialog.showModal();
    return false;
  }

  function pointSeedRecords() {
    return route.plannedPoints.map(planned => {
      const detail = guidedPoints.find(point => point.id === planned.id);
      return {
        id: planned.id,
        route_order: planned.number,
        chapter: planned.chapter,
        title: detail?.title || planned.title,
        short_title: detail?.shortTitle || planned.title,
        latitude: detail?.coordinates?.[0] ?? null,
        longitude: detail?.coordinates?.[1] ?? null,
        coordinate_status: detail?.coordinateStatus || "needs-check",
        status: detail ? "published" : "research",
        content: detail ? {
          duration: detail.duration,
          coordinateNote: detail.coordinateNote,
          image: detail.image,
          imageAlt: detail.imageAlt,
          intro: detail.intro,
          facts: detail.facts,
          show: detail.show,
          guideText: detail.guideText,
          familyQuestion: detail.familyQuestion,
          safety: detail.safety,
          sources: detail.sources
        } : {}
      };
    });
  }

  function sharedPointToDisplay(record) {
    const existing = guidedPoints.find(point => point.id === record.id);
    const content = record.content || {};
    const hasCoordinates = Number.isFinite(record.latitude) && Number.isFinite(record.longitude);
    return {
      id: record.id,
      number: record.route_order ?? existing?.number ?? "+",
      chapter: record.chapter || existing?.chapter || "railway",
      title: record.title || existing?.title || "Новая точка",
      shortTitle: record.short_title || existing?.shortTitle || record.title,
      coordinates: hasCoordinates ? [record.latitude, record.longitude] : existing?.coordinates || null,
      coordinateStatus: record.coordinate_status || existing?.coordinateStatus || "needs-check",
      coordinateNote: content.coordinateNote || existing?.coordinateNote || "Координату и место остановки нужно проверить.",
      duration: content.duration || existing?.duration || "время уточняется",
      image: content.image || existing?.image || "./assets/icon.svg",
      imageAlt: content.imageAlt || existing?.imageAlt || "Точка экскурсионного маршрута",
      intro: content.intro || existing?.intro || "Материал по этой точке собирается участниками проекта.",
      facts: Array.isArray(content.facts) ? content.facts : existing?.facts || [],
      show: content.show || existing?.show || "Уточните место показа на местности.",
      guideText: content.guideText || existing?.guideText || "Добавьте проверенный рассказ экскурсовода.",
      familyQuestion: content.familyQuestion || existing?.familyQuestion || "Что в этом месте кажется вам самым важным?",
      safety: content.safety || existing?.safety || "Выберите безопасное место остановки группы.",
      sources: Array.isArray(content.sources) ? content.sources : existing?.sources || [],
      sharedStatus: record.status,
      createdBy: record.created_by,
      isShared: true
    };
  }

  function applySharedWorkspace(workspace) {
    state.sharedPointRecords = workspace.points || [];
    state.sharedPhotos = (workspace.photos || []).map(photo => ({
      id: photo.id,
      pointId: photo.point_id,
      pointNumber: photoPointDetails(photo.point_id)?.number || "+",
      title: photo.title,
      src: photo.publicUrl,
      alt: photo.title,
      date: photo.shot_date || "Дата уточняется",
      caption: photo.caption,
      author: photo.author || "Автор уточняется",
      source: photo.source || "Материал участника",
      rightsStatus: photo.rights_status || "Ожидает редакторской проверки",
      status: photo.status,
      isDraft: photo.status !== "published",
      isShared: true
    }));

    state.sharedPointRecords.forEach(record => {
      const display = sharedPointToDisplay(record);
      const planned = route.plannedPoints.find(point => point.id === record.id);
      const plannedData = {
        number: display.number,
        id: display.id,
        title: display.title,
        chapter: display.chapter,
        status: record.status === "published" ? "ready" : "research"
      };
      if (planned) Object.assign(planned, plannedData);
      else route.plannedPoints.push(plannedData);
      const guided = guidedPoints.find(point => point.id === record.id);
      if (guided) Object.assign(guided, display);
      else if (display.coordinates && (record.status === "published" || display.intro !== "Материал по этой точке собирается участниками проекта.")) guidedPoints.push(display);
    });
    route.plannedPoints.sort((a, b) => Number(a.number || 9999) - Number(b.number || 9999));
    guidedPoints.sort((a, b) => Number(a.number || 9999) - Number(b.number || 9999));

    state.sharedWaypoints = (workspace.waypoints || []).map(waypoint => [waypoint.latitude, waypoint.longitude]);
    if (state.sharedWaypoints.length >= 2) state.routeCoordinates = state.sharedWaypoints.map(coordinate => [...coordinate]);
    updateRouteSummary();
    refreshWorkspaceViews();
  }

  function savePhotoDrafts() {
    try {
      localStorage.setItem(STORAGE_PHOTO_DRAFTS, JSON.stringify(state.photoDrafts));
      return true;
    } catch (_) {
      return false;
    }
  }

  function activeRouteLine() {
    if (state.routeEditMode) return state.routeDraft;
    return state.routeCoordinates;
  }

  function routeLengthMeters(coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) return 0;
    return coordinates.slice(1).reduce((total, coordinate, index) => total + distanceMeters(coordinates[index], coordinate), 0);
  }

  function updateRouteSummary() {
    const line = activeRouteLine();
    const distance = routeLengthMeters(line);
    if (!distance) {
      els.routeDistance.textContent = "маршрут";
      els.routeWalkingTime.textContent = "добавьте минимум 2 узла";
      return;
    }
    const distanceKm = distance / 1000;
    const minutes = Math.max(1, Math.round(distance / 80));
    els.routeDistance.textContent = `${distanceKm.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} км`;
    els.routeWalkingTime.textContent = `≈ ${minutes} мин пешком`;
  }

  function refreshWorkspaceViews() {
    renderFilters();
    renderPoints();
    renderPlanFilters();
    renderPlan();
    renderPhotos();
    photoPointOptions();
    renderCoordinatePointOptions();
    updateProgress();
    redrawLeafletRoute();
    renderPhotoLayer();
    renderYandexObjects();
  }

  function initMap() {
    const routeLine = routeGeometry?.coordinates?.length
      ? routeGeometry.coordinates
      : guidedPoints.map(point => point.coordinates);
    state.routeCoordinates = routeLine;

    updateRouteSummary();

    initLeafletMap();
    setMapProvider("yandex");
    initYandexMap().catch(error => {
      console.error("Yandex Maps failed to initialize", error);
      state.yandexStatus = "failed";
      setMapProvider("osm");
      showToast("Яндекс Карта недоступна — включена резервная карта");
    });
  }

  function loadYandexApi() {
    if (window.ymaps3) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timer = window.setTimeout(() => reject(new Error("Yandex Maps loading timeout")), 8000);
      script.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(YANDEX_MAPS_API_KEY)}&lang=ru_RU`;
      script.async = true;
      script.onload = () => {
        window.clearTimeout(timer);
        resolve();
      };
      script.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("Yandex Maps script failed to load"));
      };
      document.head.appendChild(script);
    });
  }

  async function initYandexMap() {
    state.yandexStatus = "loading";
    els.mapPanel.classList.add("is-map-loading");
    await loadYandexApi();
    if (!window.ymaps3?.ready) throw new Error("Yandex Maps API is unavailable");
    await Promise.race([
      window.ymaps3.ready,
      new Promise((_, reject) => window.setTimeout(() => reject(new Error("Yandex Maps readiness timeout")), 8000))
    ]);
    const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer, YMapFeature, YMapMarker, YMapListener } = window.ymaps3;
    state.yandexClasses = { YMapFeature, YMapMarker };
    state.yandexMap = new YMap(els.yandexMap, {
      location: { center: [34.594, 64.953], zoom: 14 },
      showScaleInCopyrights: true
    }, [
      new YMapDefaultSchemeLayer({}),
      new YMapDefaultFeaturesLayer({})
    ]);
    state.yandexMap.addChild(new YMapListener({
      onClick: (_object, event) => {
        const latlng = { lat: event.coordinates[1], lng: event.coordinates[0] };
        if (state.routeEditMode) addRouteNode(latlng);
        else if (state.routeReviewMode) captureRouteIssue(latlng);
        else if (state.coordinateMode) captureCoordinate(latlng);
      }
    }));
    state.yandexReady = true;
    state.yandexStatus = "ready";
    renderYandexObjects();
    els.mapPanel.classList.remove("is-map-loading");
    if (state.mapProvider === "yandex") fitYandexRoute();
  }

  function initLeafletMap() {
    if (!window.L) {
      els.map.innerHTML = '<div style="padding:32px">Карта не загрузилась. Проверьте подключение к интернету.</div>';
      return;
    }

    state.map = L.map("map", {
      zoomControl: true,
      scrollWheelZoom: true,
      touchZoom: true,
      doubleClickZoom: true,
      dragging: true,
      keyboard: true,
      zoomSnap: .5,
      zoomDelta: .5,
      wheelPxPerZoomLevel: 100
    }).setView([64.953, 34.594], 14);
    const tileOptions = {
      maxZoom: 20,
      keepBuffer: 6,
      updateWhenIdle: false,
      updateWhenZooming: true,
      crossOrigin: true
    };
    const cartoAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
    const osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
    const streetMap = L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      ...tileOptions,
      subdomains: "abcd",
      attribution: cartoAttribution
    }).addTo(state.map);
    const quietMap = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      ...tileOptions,
      subdomains: "abcd",
      attribution: cartoAttribution
    });
    const osmMap = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      ...tileOptions,
      maxZoom: 19,
      subdomains: "abc",
      attribution: osmAttribution
    });

    [streetMap, quietMap, osmMap].forEach(layer => {
      layer.on("loading", () => state.mapProvider === "osm" && els.mapPanel.classList.add("is-map-loading"));
      layer.on("load", () => state.mapProvider === "osm" && els.mapPanel.classList.remove("is-map-loading"));
      layer.on("tileerror", event => {
        const tile = event.tile;
        if (!tile || tile.dataset.retryAttempted === "true") return;
        const source = event.url || tile.currentSrc || tile.src;
        if (!source) return;
        tile.dataset.retryAttempted = "true";
        window.setTimeout(() => {
          const separator = source.includes("?") ? "&" : "?";
          tile.src = `${source}${separator}retry=1`;
        }, 350);
      });
    });

    state.routeLayer = L.layerGroup().addTo(state.map);
    redrawLeafletRoute();

    state.photoLayer = L.layerGroup();
    renderPhotoLayer();

    state.routeIssueLayer = L.layerGroup().addTo(state.map);
    renderRouteIssues();
    state.coordinateDraftLayer = L.layerGroup().addTo(state.map);
    renderCoordinateDrafts();

    const routeLine = state.routeCoordinates;
    if (routeLine.length) state.map.fitBounds(L.latLngBounds(routeLine), { padding: [45, 45] });

    L.control.layers(
      { "Современная карта": streetMap, "Спокойная схема": quietMap, "OpenStreetMap": osmMap },
      { "Маршрут экскурсии": state.routeLayer, "Фотографии точек": state.photoLayer, "Новые точки и координаты": state.coordinateDraftLayer, "Полевые замечания": state.routeIssueLayer },
      { position: "bottomright", collapsed: true }
    ).addTo(state.map);
    state.map.on("overlayadd overlayremove", event => {
      if (event.layer !== state.photoLayer) return;
      const visible = state.map.hasLayer(state.photoLayer);
      state.photosVisible = visible;
      document.querySelector("#photosButton").classList.toggle("is-active", visible);
      document.querySelector("#photosButton").setAttribute("aria-pressed", String(visible));
      renderYandexObjects();
    });
    state.map.on("click", event => {
      if (state.routeEditMode) addRouteNode(event.latlng);
      else if (state.routeReviewMode) captureRouteIssue(event.latlng);
      else if (state.coordinateMode) captureCoordinate(event.latlng);
    });
  }

  function redrawLeafletRoute() {
    if (!state.routeLayer || !window.L) return;
    state.routeLayer.clearLayers();
    state.markers.clear();
    const routeLine = activeRouteLine();
    if (routeLine.length >= 2) {
      L.polyline(routeLine, { color: "#fff", weight: 9, opacity: .92, lineJoin: "round", lineCap: "round", interactive: false }).addTo(state.routeLayer);
      L.polyline(routeLine, { color: state.routeEditMode ? "#102a43" : "#e21f26", weight: 5, opacity: .94, lineJoin: "round", lineCap: "round", interactive: false }).addTo(state.routeLayer);
    }

    guidedPoints.filter(point => Array.isArray(point.coordinates)).forEach(point => {
      const needsCheck = point.coordinateStatus === "needs-check";
      const marker = L.marker(point.coordinates, {
        icon: L.divIcon({
          className: "",
          html: `<div class="map-marker ${needsCheck ? "map-marker--check" : ""}"><span>${escapeHtml(point.number)}</span></div>`,
          iconSize: [38, 38],
          iconAnchor: [18, 38],
          popupAnchor: [0, -38]
        })
      }).addTo(state.routeLayer);
      marker.bindPopup(`<strong>${escapeHtml(point.shortTitle)}</strong><br><small>${needsCheck ? "Координату проверить" : "Координата проверена"}</small><br><button class="popup-button" onclick="window.openKemPoint('${point.id}')">Открыть подсказку →</button>`);
      marker.on("click", () => highlightPoint(point.id));
      state.markers.set(point.id, marker);
    });

    state.sharedPointRecords.forEach(record => {
      if (guidedPoints.some(point => point.id === record.id) || !Number.isFinite(record.latitude) || !Number.isFinite(record.longitude)) return;
      const marker = L.marker([record.latitude, record.longitude], {
        icon: L.divIcon({ className: "", html: '<div class="coordinate-draft-marker coordinate-draft-marker--new"><span>＋</span></div>', iconSize: [34, 34], iconAnchor: [17, 34] })
      }).addTo(state.routeLayer);
      marker.bindPopup(`<strong>${escapeHtml(record.title)}</strong><br><small>Общая точка проекта</small><br><button class="popup-button" onclick="window.openKemSharedPoint('${record.id}')">Редактировать →</button>`);
    });

    if (state.routeEditMode) {
      state.routeDraft.forEach((coordinate, index) => {
        L.marker(coordinate, {
          icon: L.divIcon({ className: "", html: `<div class="route-node-marker">${index + 1}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
          interactive: false
        }).addTo(state.routeLayer);
      });
    }
  }

  function renderPhotoLayer() {
    if (!state.photoLayer || !window.L) return;
    state.photoLayer.clearLayers();
    allPhotos().forEach(photo => {
      const point = photoPointDetails(photo.pointId);
      if (!point?.coordinates) return;
      const marker = L.marker(point.coordinates, {
        icon: L.divIcon({
          className: "",
          html: `<div class="photo-map-marker${photo.isDraft ? " photo-map-marker--draft" : ""}" style="background-image:url('${photo.src}')"><span>${escapeHtml(photo.pointNumber)}</span></div>`,
          iconSize: [54, 54],
          iconAnchor: [27, 27],
          popupAnchor: [0, -29]
        })
      });
      marker.bindPopup(`<strong>${escapeHtml(photo.title)}</strong><br><small>${escapeHtml(photo.date || "Дата уточняется")}${photo.isDraft ? " · черновик" : ""}</small><br><button class="popup-button" onclick="window.openKemPhoto('${photo.id}')">Открыть фотографию →</button>`);
      marker.addTo(state.photoLayer);
    });
  }

  function toYandexCoordinates(coordinates) {
    return [coordinates[1], coordinates[0]];
  }

  function clearYandexObjects() {
    if (!state.yandexMap) return;
    state.yandexObjects.forEach(object => state.yandexMap.removeChild(object));
    state.yandexObjects = [];
  }

  function addYandexObject(object) {
    state.yandexMap.addChild(object);
    state.yandexObjects.push(object);
  }

  function addYandexMarker(coordinates, html, label, onClick, centered = false) {
    const host = document.createElement("button");
    host.type = "button";
    host.className = `yandex-marker-host${centered ? " yandex-marker-host--center" : ""}`;
    host.setAttribute("aria-label", label);
    host.title = label;
    host.innerHTML = html;
    host.addEventListener("click", event => {
      event.stopPropagation();
      onClick?.();
    });
    addYandexObject(new state.yandexClasses.YMapMarker({ coordinates: toYandexCoordinates(coordinates) }, host));
  }

  function renderYandexObjects() {
    if (!state.yandexReady || !state.yandexMap || !state.yandexClasses) return;
    clearYandexObjects();
    const routeLine = activeRouteLine().map(toYandexCoordinates);
    if (routeLine.length >= 2) {
      addYandexObject(new state.yandexClasses.YMapFeature({
        id: "kem-route-outline",
        geometry: { type: "LineString", coordinates: routeLine },
        style: { stroke: [{ color: "#ffffff", width: 9, opacity: .92 }] }
      }));
      addYandexObject(new state.yandexClasses.YMapFeature({
        id: "kem-route-line",
        geometry: { type: "LineString", coordinates: routeLine },
        style: { stroke: [{ color: state.routeEditMode ? "#102a43" : "#e21f26", width: 5, opacity: .94 }] }
      }));
    }

    guidedPoints.forEach(point => {
      if (!Array.isArray(point.coordinates)) return;
      const needsCheck = point.coordinateStatus === "needs-check";
      addYandexMarker(
        point.coordinates,
        `<div class="map-marker ${needsCheck ? "map-marker--check" : ""}"><span>${point.number}</span></div>`,
        `${point.number}. ${point.shortTitle}`,
        () => openPoint(point.id)
      );
    });

    state.sharedPointRecords.forEach(record => {
      if (guidedPoints.some(point => point.id === record.id) || !Number.isFinite(record.latitude) || !Number.isFinite(record.longitude)) return;
      addYandexMarker(
        [record.latitude, record.longitude],
        '<div class="coordinate-draft-marker coordinate-draft-marker--new"><span>＋</span></div>',
        record.title,
        () => openSharedPointEditor(record.id)
      );
    });

    if (state.routeEditMode) {
      state.routeDraft.forEach((coordinate, index) => addYandexMarker(
        coordinate,
        `<div class="route-node-marker">${index + 1}</div>`,
        `Узел маршрута ${index + 1}`,
        null,
        true
      ));
    }

    if (state.photosVisible) {
      allPhotos().forEach(photo => {
        const point = photoPointDetails(photo.pointId);
        if (!point?.coordinates) return;
        addYandexMarker(
          point.coordinates,
          `<div class="photo-map-marker${photo.isDraft ? " photo-map-marker--draft" : ""}" style="background-image:url('${photo.src}')"><span>${escapeHtml(photo.pointNumber)}</span></div>`,
          `Фотография: ${photo.title}`,
          () => openPhoto(photo.id),
          true
        );
      });
    }

    state.routeIssues.forEach(issue => {
      if (!Array.isArray(issue.coordinates) || issue.coordinates.length !== 2) return;
      const typeLabel = ROUTE_ISSUE_TYPES[issue.type] || ROUTE_ISSUE_TYPES.other;
      addYandexMarker(
        issue.coordinates,
        '<div class="route-issue-marker"><span>!</span></div>',
        `${typeLabel}: ${issue.detail || "без комментария"}`,
        () => {
          if (window.confirm(`${typeLabel}\n${issue.detail || "Без комментария"}\n\nУдалить замечание?`)) deleteRouteIssue(issue.id);
        }
      );
    });

    state.edits.filter(edit => ["coordinate", "new-point"].includes(edit.field) && Array.isArray(edit.coordinates)).forEach(edit => {
      const isNewPoint = edit.field === "new-point";
      addYandexMarker(
        edit.coordinates,
        `<div class="coordinate-draft-marker ${isNewPoint ? "coordinate-draft-marker--new" : ""}"><span>${isNewPoint ? "+" : "✓"}</span></div>`,
        `${edit.pointName}: ${isNewPoint ? "новая точка" : "уточнение координаты"}`,
        () => {
          if (isNewPoint) openDraftPoint(edit.id);
          else if (window.confirm(`Удалить уточнение «${edit.pointName}»?`)) deleteCoordinateDraft(edit.id);
        }
      );
    });

    if (state.coordinatePreview) {
      addYandexMarker(state.coordinatePreview, '<div class="coordinate-marker">＋</div>', "Выбранная координата", null, true);
    }
    if (state.userLocation) {
      addYandexMarker(state.userLocation, '<div class="user-marker"></div>', "Вы находитесь здесь", null, true);
    }
  }

  function fitYandexRoute() {
    const line = activeRouteLine();
    if (!state.yandexReady || !state.yandexMap || !line.length) return;
    const longitudes = line.map(coordinates => coordinates[1]);
    const latitudes = line.map(coordinates => coordinates[0]);
    state.yandexMap.update({
      location: {
        bounds: [
          [Math.min(...longitudes), Math.min(...latitudes)],
          [Math.max(...longitudes), Math.max(...latitudes)]
        ],
        duration: 500
      }
    });
  }

  function setMapProvider(provider) {
    let requested = provider === "osm" ? "osm" : "yandex";
    if (requested === "yandex" && state.yandexStatus === "failed") {
      requested = "osm";
      showToast("Яндекс Карта пока недоступна. Обновите страницу после активации ключа.");
    }
    state.mapProvider = requested;
    els.yandexMap.hidden = requested !== "yandex";
    els.map.hidden = requested !== "osm";
    document.querySelectorAll("[data-map-provider]").forEach(button => {
      const active = button.dataset.mapProvider === requested;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    if (requested === "yandex") {
      if (!state.yandexReady) els.mapPanel.classList.add("is-map-loading");
      else {
        els.mapPanel.classList.remove("is-map-loading");
        window.setTimeout(fitYandexRoute, 0);
      }
      return;
    }

    els.mapPanel.classList.remove("is-map-loading");
    if (state.map && state.photoLayer) {
      if (state.photosVisible && !state.map.hasLayer(state.photoLayer)) state.photoLayer.addTo(state.map);
      if (!state.photosVisible && state.map.hasLayer(state.photoLayer)) state.map.removeLayer(state.photoLayer);
    }
    window.setTimeout(() => {
      if (!state.map) return;
      state.map.invalidateSize();
      fitWholeRoute();
    }, 0);
  }

  function fitWholeRoute() {
    if (state.mapProvider === "yandex") {
      fitYandexRoute();
      return;
    }
    if (!state.map) return;
    const routeLine = activeRouteLine().length ? activeRouteLine() : guidedPoints.map(point => point.coordinates).filter(Boolean);
    if (routeLine.length) state.map.fitBounds(L.latLngBounds(routeLine), { padding: [55, 55] });
  }

  async function toggleMapFullscreen() {
    const panel = els.mapPanel;
    if (!document.fullscreenElement) {
      if (!panel.requestFullscreen) {
        showToast("Полноэкранный режим не поддерживается этим браузером");
        return;
      }
      await panel.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }

  function renderFilters() {
    const items = [{ id: "all", title: "Все" }, ...route.chapters];
    els.chapterFilter.innerHTML = items.map(item => `<button class="filter-chip ${item.id === state.filter ? "is-active" : ""}" type="button" data-filter="${item.id}">${item.title}</button>`).join("");
  }

  function renderPlanFilters() {
    const items = [{ id: "all", title: "Все главы" }, ...route.chapters];
    els.planFilters.innerHTML = items.map(item => `<button class="filter-chip ${item.id === state.planFilter ? "is-active" : ""}" type="button" data-plan-filter="${item.id}">${item.title}</button>`).join("");
  }

  function renderPlan() {
    const ready = route.plannedPoints.filter(point => point.status === "ready").length;
    els.readyCount.textContent = ready;
    els.readinessBar.style.width = `${(ready / route.plannedPoints.length) * 100}%`;
    const visible = state.planFilter === "all" ? route.plannedPoints : route.plannedPoints.filter(point => point.chapter === state.planFilter);
    els.planGrid.innerHTML = visible.map(point => {
      const isReady = point.status === "ready";
      const photo = allPhotos().find(item => item.pointId === point.id);
      const action = isReady ? `<button class="plan-action" type="button" data-open-plan="${point.id}">Открыть карточку →</button>` : "";
      const editAction = `<button class="plan-action" type="button" data-edit-point="${point.id}">${userIsAuthenticated() ? "✎ Редактировать" : "Добавить материал →"}</button>`;
      const photoAction = photo ? `<button class="plan-action" type="button" data-photo-id="${photo.id}">▣ Есть фото</button>` : "";
      const addPhotoAction = `<button class="plan-action" type="button" data-add-photo-point="${point.id}">＋ Фото</button>`;
      return `<li class="plan-item ${isReady ? "plan-item--ready" : ""}"><span class="plan-item__number">${point.number}</span><div><h3>${escapeHtml(point.title)}</h3><div class="plan-item__meta"><span class="plan-status">${isReady ? "✓ карточка готова" : "○ исследуем"}</span>${photoAction}${addPhotoAction}${action}${editAction}</div></div></li>`;
    }).join("");
  }

  function renderPhotos() {
    els.photoStrip.innerHTML = allPhotos().map(photo => `<button class="photo-card${photo.isDraft ? " photo-card--draft" : ""}" type="button" data-photo-id="${photo.id}"><img src="${photo.src}" alt="" loading="lazy"><span class="photo-card__copy"><span>${photo.isDraft ? "Черновик" : `Точка ${escapeHtml(photo.pointNumber)}`}</span><strong>${escapeHtml(photo.title)}</strong><small>${escapeHtml(photo.date || "Дата уточняется")}</small></span></button>`).join("");
  }

  function openPhoto(photoId) {
    const photo = allPhotos().find(item => item.id === photoId);
    if (!photo) return;
    const draftAction = photo.isShared && photo.isDraft
      ? "<p class=\"muted\">Общий фоточерновик ожидает редакторской проверки.</p>"
      : photo.isDraft
        ? `<p><button class="text-button text-button--danger" type="button" data-delete-photo-draft="${photo.id}">Удалить этот черновик</button></p>`
        : `<p><button class="text-button" type="button" data-edit-point="${photo.pointId}">Уточнить подпись или автора →</button></p>`;
    els.photoDialogContent.innerHTML = `<img class="photo-viewer__image" src="${photo.src}" alt="${escapeHtml(photo.alt || photo.title)}"><div class="photo-viewer__copy"><p class="eyebrow">${photo.isDraft ? "Черновик участника" : `Фото · точка ${escapeHtml(photo.pointNumber)}`}</p><h2>${escapeHtml(photo.title)}</h2><p>${escapeHtml(photo.caption)}</p><div class="photo-meta"><div><strong>Дата</strong><span>${escapeHtml(photo.date || "Не указана")}</span></div><div><strong>Автор</strong><span>${escapeHtml(photo.author)}</span></div><div><strong>Источник</strong><span>${escapeHtml(photo.source || "Личный материал")}</span></div><div><strong>Статус прав</strong><span>${escapeHtml(photo.rightsStatus)}</span></div></div>${draftAction}</div>`;
    els.photoDialog.showModal();
  }

  function photoPointOptions(selectedPointId = "") {
    const plannedOptions = route.plannedPoints.map(point => ({ id: point.id, title: `${point.number}. ${point.title}` }));
    const draftOptions = state.edits
      .filter(edit => edit.field === "new-point")
      .map(edit => ({ id: edit.pointId, title: `＋ ${edit.pointName} — новая точка` }));
    els.photoPoint.innerHTML = `<option value="">Выберите точку</option>${[...plannedOptions, ...draftOptions].map(option => `<option value="${escapeHtml(option.id)}"${option.id === selectedPointId ? " selected" : ""}>${escapeHtml(option.title)}</option>`).join("")}`;
  }

  function renderCoordinatePointOptions(selectedPointId = "") {
    const select = document.querySelector("#coordinatePoint");
    const previous = selectedPointId || select.value;
    select.innerHTML = `<option value="">Выберите точку</option><option value="__new__">＋ Добавить новую точку</option>${route.plannedPoints.map(point => `<option value="${escapeHtml(point.id)}">${escapeHtml(point.number)}. ${escapeHtml(point.title)}${point.status === "ready" ? " — есть материал" : ""}</option>`).join("")}`;
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
  }

  function openPhotoUpload(pointId = "") {
    if (els.pointDialog.open) els.pointDialog.close();
    if (els.photoDialog.open) els.photoDialog.close();
    if (els.draftPointDialog.open) els.draftPointDialog.close();
    els.photoUploadForm.reset();
    els.photoUploadPreview.hidden = true;
    els.photoUploadPreview.querySelector("img").removeAttribute("src");
    photoPointOptions(pointId);
    els.savePhotoButton.textContent = userIsAuthenticated() ? "Добавить в общую карту" : "Сохранить черновик";
    els.photoUploadDialog.querySelector(".muted").textContent = userIsAuthenticated()
      ? "Снимок будет уменьшен для телефона и загружен в общую карту как черновик для редакторской проверки."
      : "Снимок будет уменьшен для телефона и сохранён как черновик только на этом устройстве. Затем выгрузите материалы редактору.";
    els.photoUploadDialog.showModal();
  }

  function previewSelectedPhoto() {
    const file = els.photoFile.files?.[0];
    if (!file) {
      els.photoUploadPreview.hidden = true;
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    const image = els.photoUploadPreview.querySelector("img");
    image.onload = () => URL.revokeObjectURL(previewUrl);
    image.src = previewUrl;
    els.photoUploadPreview.hidden = false;
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Не удалось прочитать изображение"));
      };
      image.src = url;
    });
  }

  async function optimizePhoto(file) {
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error("Выберите фотографию JPG, PNG или WebP");
    if (file.size > 15 * 1024 * 1024) throw new Error("Файл больше 15 МБ — выберите фотографию меньшего размера");
    const image = await loadImage(file);
    const maxSide = 1400;
    const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", .76);
    if (dataUrl.length > 1_200_000) throw new Error("После обработки снимок всё ещё слишком большой. Обрежьте его и попробуйте снова");
    return dataUrl;
  }

  function deletePhotoDraft(photoId) {
    state.photoDrafts = state.photoDrafts.filter(photo => photo.id !== photoId);
    savePhotoDrafts();
    renderPhotos();
    renderPhotoLayer();
    renderPlan();
    renderYandexObjects();
    if (els.photoDialog.open) els.photoDialog.close();
    showToast("Черновик фотографии удалён");
  }

  function setCoordinateMode(enabled) {
    if (enabled && state.routeEditMode) setRouteEditMode(false);
    if (enabled && state.routeReviewMode) setRouteReviewMode(false);
    if (!enabled) state.relocatingDraftId = null;
    state.coordinateMode = enabled;
    els.mapPanel.classList.toggle("is-coordinate-mode", enabled);
    const button = document.querySelector("#coordinateModeButton");
    button.classList.toggle("is-active", enabled);
    button.setAttribute("aria-pressed", String(enabled));
    if (enabled) showToast("Нажмите на карте в месте остановки группы");
  }

  function setRouteReviewMode(enabled) {
    if (enabled && state.routeEditMode) setRouteEditMode(false);
    if (enabled && state.coordinateMode) setCoordinateMode(false);
    state.routeReviewMode = enabled;
    els.mapPanel.classList.toggle("is-route-review-mode", enabled);
    const button = document.querySelector("#routeReviewButton");
    button.classList.toggle("is-active", enabled);
    button.setAttribute("aria-pressed", String(enabled));
    if (enabled) showToast("Нажмите на проблемное место красной линии");
  }

  function updateRouteEditor() {
    const count = state.routeDraft.length;
    els.routeEditorCount.textContent = `${count} ${count === 1 ? "узел" : count > 1 && count < 5 ? "узла" : "узлов"}`;
    document.querySelector("#routeUndoButton").disabled = count === 0;
    document.querySelector("#routeSaveButton").disabled = count < 2;
    updateRouteSummary();
    redrawLeafletRoute();
    renderYandexObjects();
  }

  function setRouteEditMode(enabled) {
    if (enabled && !requireParticipant("Для общего маршрута войдите как участник")) return;
    if (enabled) {
      if (state.coordinateMode) setCoordinateMode(false);
      if (state.routeReviewMode) setRouteReviewMode(false);
      state.routeDraft = state.sharedWaypoints.length >= 2 ? state.sharedWaypoints.map(coordinate => [...coordinate]) : [];
      showToast(state.routeDraft.length ? "Общий маршрут открыт для редактирования" : "Поставьте первый узел, затем ведите линию по улицам");
    }
    state.routeEditMode = enabled;
    if (!enabled) state.routeDraft = [];
    els.routeEditor.hidden = !enabled;
    els.mapPanel.classList.toggle("is-route-edit-mode", enabled);
    const button = document.querySelector("#routeEditButton");
    button.classList.toggle("is-active", enabled);
    button.setAttribute("aria-pressed", String(enabled));
    updateRouteEditor();
  }

  function addRouteNode(latlng) {
    if (!state.routeEditMode) return;
    const coordinate = [Number(latlng.lat), Number(latlng.lng)];
    const previous = state.routeDraft.at(-1);
    if (previous && distanceMeters(previous, coordinate) < 4) {
      showToast("Эта точка слишком близко к предыдущей");
      return;
    }
    state.routeDraft.push(coordinate);
    updateRouteEditor();
  }

  function nearestPointId(coordinate) {
    const candidates = state.sharedPointRecords
      .filter(point => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
      .map(point => ({ id: point.id, distance: distanceMeters(coordinate, [point.latitude, point.longitude]) }))
      .sort((a, b) => a.distance - b.distance);
    return candidates[0]?.distance <= 30 ? candidates[0].id : "";
  }

  async function saveSharedRoute() {
    if (!requireParticipant() || state.routeDraft.length < 2) return;
    const button = document.querySelector("#routeSaveButton");
    button.disabled = true;
    button.textContent = "Сохраняем…";
    try {
      const waypoints = state.routeDraft.map((coordinate, index) => ({
        lat: coordinate[0],
        lng: coordinate[1],
        pointId: nearestPointId(coordinate),
        kind: index === 0 || index === state.routeDraft.length - 1 ? "stop" : "via"
      }));
      await community.saveRouteWaypoints(waypoints);
      state.sharedWaypoints = state.routeDraft.map(coordinate => [...coordinate]);
      state.routeCoordinates = state.sharedWaypoints.map(coordinate => [...coordinate]);
      setRouteEditMode(false);
      refreshWorkspaceViews();
      showToast("Общий маршрут сохранён для всех участников");
    } catch (error) {
      showToast(error.message || "Не удалось сохранить маршрут");
    } finally {
      button.textContent = "Сохранить для всех";
      button.disabled = false;
    }
  }

  function captureRouteIssue(latlng) {
    setRouteReviewMode(false);
    document.querySelector("#routeIssueLat").value = latlng.lat.toFixed(6);
    document.querySelector("#routeIssueLng").value = latlng.lng.toFixed(6);
    els.routeIssueDialog.showModal();
  }

  function saveRouteIssues() {
    localStorage.setItem(STORAGE_ROUTE_ISSUES, JSON.stringify(state.routeIssues));
    renderRouteIssues();
  }

  function renderRouteIssues() {
    els.routeIssueCount.textContent = `замечаний: ${state.routeIssues.length}`;
    if (state.routeIssueLayer && window.L) {
      state.routeIssueLayer.clearLayers();
      state.routeIssues.forEach(issue => {
        if (!Array.isArray(issue.coordinates) || issue.coordinates.length !== 2) return;
        const typeLabel = ROUTE_ISSUE_TYPES[issue.type] || ROUTE_ISSUE_TYPES.other;
        const marker = L.marker(issue.coordinates, {
          icon: L.divIcon({
            className: "",
            html: '<div class="route-issue-marker"><span>!</span></div>',
            iconSize: [34, 34],
            iconAnchor: [17, 34],
            popupAnchor: [0, -32]
          })
        }).addTo(state.routeIssueLayer);
        marker.bindPopup(`<strong>${escapeHtml(typeLabel)}</strong><br><small>${escapeHtml(issue.detail || "Без комментария")}</small><br><button class="popup-button" onclick="window.deleteKemRouteIssue('${issue.id}')">Удалить замечание</button>`);
      });
    }
    renderYandexObjects();
  }

  function deleteRouteIssue(issueId) {
    state.routeIssues = state.routeIssues.filter(issue => issue.id !== issueId);
    saveRouteIssues();
    showToast("Замечание удалено");
  }

  function renderCoordinateDrafts() {
    if (state.coordinateDraftLayer && window.L) {
      state.coordinateDraftLayer.clearLayers();
      state.edits.filter(edit => ["coordinate", "new-point"].includes(edit.field) && Array.isArray(edit.coordinates)).forEach(edit => {
        const isNewPoint = edit.field === "new-point";
        const marker = L.marker(edit.coordinates, {
          icon: L.divIcon({
            className: "",
            html: `<div class="coordinate-draft-marker ${isNewPoint ? "coordinate-draft-marker--new" : ""}"><span>${isNewPoint ? "+" : "✓"}</span></div>`,
            iconSize: [34, 34],
            iconAnchor: [17, 34],
            popupAnchor: [0, -32]
          })
        }).addTo(state.coordinateDraftLayer);
        const action = isNewPoint
          ? `<button class="popup-button" onclick="window.openKemDraftPoint('${edit.id}')">Открыть черновик →</button>`
          : `<button class="popup-button" onclick="window.deleteKemCoordinateDraft('${edit.id}')">Удалить уточнение</button>`;
        marker.bindPopup(`<strong>${escapeHtml(edit.pointName)}</strong><br><small>${isNewPoint ? "Новая экскурсионная точка" : "Уточнение координаты"}</small>${edit.source ? `<br><small>${escapeHtml(edit.source)}</small>` : ""}<br>${action}`);
      });
    }
    renderYandexObjects();
  }

  function deleteCoordinateDraft(editId) {
    const draft = state.edits.find(edit => edit.id === editId);
    state.edits = state.edits.filter(edit => edit.id !== editId && !(draft?.field === "new-point" && edit.pointId === draft.pointId));
    if (draft?.field === "new-point") {
      state.photoDrafts = state.photoDrafts.filter(photo => photo.pointId !== draft.pointId);
      savePhotoDrafts();
      renderPhotos();
      renderPhotoLayer();
      renderPlan();
    }
    localStorage.setItem(STORAGE_EDITS, JSON.stringify(state.edits));
    renderCoordinateDrafts();
    if (els.draftPointDialog.open) els.draftPointDialog.close();
    showToast("Черновик точки удалён");
  }

  function openDraftPoint(editId) {
    const draft = state.edits.find(edit => edit.id === editId && edit.field === "new-point");
    if (!draft) return;
    els.draftPointForm.reset();
    els.draftPointEditId.value = draft.id;
    els.draftPointName.value = draft.pointName || "";
    els.draftPointNote.value = draft.source || "";
    els.draftPointAuthor.value = draft.author || "";
    els.draftPointLat.value = Number(draft.coordinates?.[0]).toFixed(6);
    els.draftPointLng.value = Number(draft.coordinates?.[1]).toFixed(6);
    els.draftPointDialog.showModal();
  }

  function startDraftRelocation(editId) {
    const draft = state.edits.find(edit => edit.id === editId && edit.field === "new-point");
    if (!draft) return;
    els.draftPointDialog.close();
    state.relocatingDraftId = draft.id;
    setCoordinateMode(true);
    showToast(`Нажмите новое место для точки «${draft.pointName}»`);
  }

  function updateCoordinatePointMode() {
    const isNewPoint = document.querySelector("#coordinatePoint").value === "__new__";
    els.coordinateNewPointLabel.hidden = !isNewPoint;
    els.coordinateNewPointName.required = isNewPoint;
    if (isNewPoint) els.coordinateNewPointName.focus();
    else els.coordinateNewPointName.value = "";
  }

  function captureCoordinate(latlng) {
    const relocatingDraftId = state.relocatingDraftId;
    setCoordinateMode(false);
    if (relocatingDraftId) {
      const draft = state.edits.find(edit => edit.id === relocatingDraftId && edit.field === "new-point");
      if (!draft) return;
      draft.coordinates = [latlng.lat, latlng.lng];
      draft.text = `${draft.pointName}: ${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
      draft.updatedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_EDITS, JSON.stringify(state.edits));
      renderCoordinateDrafts();
      renderPhotoLayer();
      showToast(`Точка «${draft.pointName}» перемещена`);
      return;
    }
    state.coordinatePreview = [latlng.lat, latlng.lng];
    if (state.coordinateMarker) state.coordinateMarker.remove();
    if (state.map && window.L) {
      state.coordinateMarker = L.marker(latlng, {
        icon: L.divIcon({ className: "", html: '<div class="coordinate-marker">＋</div>', iconSize: [30, 30], iconAnchor: [15, 15] })
      }).addTo(state.map);
    }
    renderYandexObjects();
    document.querySelector("#coordinateLat").value = latlng.lat.toFixed(6);
    document.querySelector("#coordinateLng").value = latlng.lng.toFixed(6);
    els.coordinateDialog.showModal();
  }

  function showUserLocation(event) {
    state.userLocation = [event.latlng.lat, event.latlng.lng];
    state.userAccuracy = event.accuracy || 0;
    if (state.map && window.L) {
      if (state.userMarker) state.userMarker.remove();
      if (state.accuracyCircle) state.accuracyCircle.remove();
      state.userMarker = L.marker(event.latlng, {
        icon: L.divIcon({ className: "", html: '<div class="user-marker"></div>', iconSize: [24, 24], iconAnchor: [12, 12] })
      }).addTo(state.map).bindPopup("Вы находитесь здесь");
      state.accuracyCircle = L.circle(event.latlng, { radius: event.accuracy, color: "#1769aa", weight: 1, fillOpacity: .08 }).addTo(state.map);
    }
    renderYandexObjects();
    if (state.mapProvider === "yandex" && state.yandexReady) {
      state.yandexMap.update({ location: { center: toYandexCoordinates(state.userLocation), zoom: 16, duration: 450 } });
    } else if (state.map) {
      state.map.setView(event.latlng, 16);
      state.userMarker?.openPopup();
    }
    const nearest = guidedPoints.map(point => ({ point, distance: distanceMeters(state.userLocation, point.coordinates) })).sort((a, b) => a.distance - b.distance)[0];
    const distanceText = nearest.distance < 1000 ? `${Math.round(nearest.distance)} м` : `${(nearest.distance / 1000).toFixed(1)} км`;
    showToast(`Ближайшая готовая точка — «${nearest.point.shortTitle}», ${distanceText}`);
  }

  function distanceMeters(from, to) {
    const radians = degrees => degrees * Math.PI / 180;
    const earthRadius = 6371000;
    const lat1 = radians(from[0]);
    const lat2 = radians(to[0]);
    const deltaLat = radians(to[0] - from[0]);
    const deltaLng = radians(to[1] - from[1]);
    const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
    return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function renderPoints() {
    const visible = state.filter === "all" ? guidedPoints : guidedPoints.filter(point => point.chapter === state.filter);
    els.pointsList.innerHTML = visible.map(point => {
      const chapter = route.chapters.find(item => item.id === point.chapter);
      const done = state.completed.has(point.id) ? " · пройдено" : "";
      return `<li><button class="point-card" type="button" data-point-id="${escapeHtml(point.id)}" data-status="${escapeHtml(point.coordinateStatus)}"><span class="point-card__number">${escapeHtml(point.number)}</span><strong>${escapeHtml(point.shortTitle)}</strong><small>${escapeHtml(chapter?.title || "Маршрут")} · ${escapeHtml(point.duration)}${done}</small></button></li>`;
    }).join("");
  }

  function highlightPoint(pointId) {
    document.querySelectorAll(".point-card").forEach(card => card.classList.toggle("is-active", card.dataset.pointId === pointId));
  }

  function statusBadge(point) {
    const check = point.coordinateStatus === "needs-check";
    return `<span class="status-badge ${check ? "status-badge--check" : ""}">${check ? "● Нужна полевая проверка" : "● Координата проверена"}</span>`;
  }

  function sourceList(point) {
    if (!point.sources?.length) return "<li>Источники ещё добавляются участниками проекта.</li>";
    return point.sources.map(source => safeExternalUrl(source.url)
      ? `<li><a href="${escapeHtml(safeExternalUrl(source.url))}" target="_blank" rel="noreferrer">${escapeHtml(source.title)}</a></li>`
      : `<li>${escapeHtml(source.title)}</li>`).join("");
  }

  function safeExternalUrl(value) {
    try {
      const url = new URL(String(value || ""), window.location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  function openPoint(pointId) {
    const point = guidedPoints.find(item => item.id === pointId);
    if (!point) return;
    state.currentPointIndex = guidedPoints.indexOf(point);
    highlightPoint(pointId);
    if (state.mapProvider === "yandex" && state.yandexReady) {
      state.yandexMap.update({ location: { center: toYandexCoordinates(point.coordinates), zoom: 16, duration: 650 } });
    } else if (state.map) {
      state.map.flyTo(point.coordinates, 16, { duration: .65 });
    }

    els.pointDialogContent.innerHTML = `
      ${statusBadge(point)}
      <h2>${escapeHtml(point.title)}</h2>
      <p class="lead">${escapeHtml(point.intro)}</p>
      <div class="dialog-visual"><img src="${escapeHtml(point.image)}" alt="${escapeHtml(point.imageAlt)}"></div>
      <h3>Короткие факты</h3>
      <ul class="fact-list">${point.facts.map(fact => `<li>${escapeHtml(fact)}</li>`).join("")}</ul>
      <h3>Что показать</h3><p>${escapeHtml(point.show)}</p>
      <h3>Вопрос семье</h3><p>${escapeHtml(point.familyQuestion)}</p>
      <h3>Важно</h3><p>${escapeHtml(point.safety)}</p>
      <details><summary>Координата и источники</summary><p class="muted">${escapeHtml(point.coordinateNote)}</p><ul class="source-list">${sourceList(point)}</ul></details>
      <div class="dialog-actions">
        <button class="button button--ghost" type="button" data-add-photo-point="${point.id}">Добавить фото</button>
        <button class="button button--ghost" type="button" data-edit-point="${point.id}">${userIsAuthenticated() ? "Редактировать точку" : "Предложить правку"}</button>
        <button class="button button--primary" type="button" data-complete-point="${point.id}">${state.completed.has(point.id) ? "Отметить непройденной" : "Точка пройдена"}</button>
      </div>`;
    els.pointDialog.showModal();
  }

  function renderAuthState() {
    const auth = state.community || {};
    const authenticated = Boolean(auth.authenticated);
    els.authSignedOut.hidden = authenticated;
    els.authSignedIn.hidden = !authenticated;
    els.accountButton.classList.toggle("is-authenticated", authenticated);
    if (!authenticated) {
      els.accountButton.textContent = "Войти";
      return;
    }
    const profileName = auth.profile?.display_name || auth.user?.email?.split("@")[0] || "Участник";
    const roles = { participant: "участник", moderator: "редактор", admin: "администратор" };
    els.accountButton.textContent = profileName.split(/\s+/)[0].slice(0, 18);
    document.querySelector("#profileName").textContent = profileName;
    document.querySelector("#profileEmail").textContent = auth.user?.email || "";
    document.querySelector("#profileRole").textContent = roles[auth.profile?.role] || "участник";
    document.querySelector("#profileAvatar").textContent = profileName.trim().charAt(0).toUpperCase() || "У";
    document.querySelector("#profileDisplayName").value = profileName;
  }

  function formatSources(sources) {
    return (sources || []).map(source => `${source.title || "Источник"} | ${source.url || ""}`).join("\n");
  }

  function parseSources(value) {
    return String(value || "").split(/\n+/).map(line => line.trim()).filter(Boolean).map(line => {
      const separator = line.indexOf("|");
      if (separator < 0) return { title: line, url: "" };
      return { title: line.slice(0, separator).trim() || "Источник", url: line.slice(separator + 1).trim() };
    });
  }

  function pointRecordForEditor(pointId) {
    const shared = state.sharedPointRecords.find(point => point.id === pointId);
    if (shared) return shared;
    const planned = route.plannedPoints.find(point => point.id === pointId);
    const guided = guidedPoints.find(point => point.id === pointId);
    if (!planned && !guided) return null;
    return {
      id: pointId,
      route_order: planned?.number ?? guided?.number ?? null,
      chapter: planned?.chapter || guided?.chapter || "railway",
      title: guided?.title || planned?.title || "Новая точка",
      short_title: guided?.shortTitle || planned?.title || "",
      latitude: guided?.coordinates?.[0] ?? null,
      longitude: guided?.coordinates?.[1] ?? null,
      coordinate_status: guided?.coordinateStatus || "needs-check",
      status: guided ? "published" : "research",
      content: guided ? {
        duration: guided.duration,
        coordinateNote: guided.coordinateNote,
        image: guided.image,
        imageAlt: guided.imageAlt,
        intro: guided.intro,
        facts: guided.facts,
        show: guided.show,
        guideText: guided.guideText,
        familyQuestion: guided.familyQuestion,
        safety: guided.safety,
        sources: guided.sources
      } : {}
    };
  }

  function openSharedPointEditor(pointId) {
    if (!requireParticipant()) return;
    const point = pointRecordForEditor(pointId);
    if (!point) return;
    const content = point.content || {};
    [els.pointDialog, els.photoDialog, els.draftPointDialog].forEach(dialog => dialog?.open && dialog.close());
    els.sharedPointForm.reset();
    document.querySelector("#sharedPointId").value = point.id;
    document.querySelector("#sharedPointOrder").value = point.route_order ?? "";
    document.querySelector("#sharedPointChapter").value = point.chapter || "railway";
    document.querySelector("#sharedPointTitle").value = point.title || "";
    document.querySelector("#sharedPointShortTitle").value = point.short_title || "";
    document.querySelector("#sharedPointStatus").value = point.status || "research";
    document.querySelector("#sharedPointCoordinateStatus").value = point.coordinate_status || "needs-check";
    document.querySelector("#sharedPointDuration").value = content.duration || "";
    document.querySelector("#sharedPointLat").value = Number.isFinite(point.latitude) ? point.latitude : "";
    document.querySelector("#sharedPointLng").value = Number.isFinite(point.longitude) ? point.longitude : "";
    document.querySelector("#sharedPointCoordinateNote").value = content.coordinateNote || "";
    document.querySelector("#sharedPointIntro").value = content.intro || "";
    document.querySelector("#sharedPointFacts").value = (content.facts || []).join("\n");
    document.querySelector("#sharedPointShow").value = content.show || "";
    document.querySelector("#sharedPointGuideText").value = content.guideText || "";
    document.querySelector("#sharedPointFamilyQuestion").value = content.familyQuestion || "";
    document.querySelector("#sharedPointSafety").value = content.safety || "";
    document.querySelector("#sharedPointSources").value = formatSources(content.sources);
    els.sharedPointDialog.showModal();
  }

  function openEdit(pointId) {
    if (userIsAuthenticated()) {
      openSharedPointEditor(pointId);
      return;
    }
    const draft = state.edits.find(edit => edit.field === "new-point" && edit.pointId === pointId);
    const point = guidedPoints.find(item => item.id === pointId)
      || route.plannedPoints.find(item => item.id === pointId)
      || (draft ? { id: draft.pointId, title: draft.pointName } : null);
    if (!point) return;
    if (els.pointDialog.open) els.pointDialog.close();
    if (els.photoDialog.open) els.photoDialog.close();
    if (els.draftPointDialog.open) els.draftPointDialog.close();
    els.editForm.reset();
    document.querySelector("#editPointId").value = point.id;
    document.querySelector("#editPointName").value = point.title;
    els.editDialog.showModal();
  }

  function enterGuide(pointIndex = 0) {
    state.currentPointIndex = Math.min(Math.max(pointIndex, 0), guidedPoints.length - 1);
    document.querySelector(".map-panel").hidden = true;
    els.pointsPanel.hidden = true;
    els.guidePanel.hidden = false;
    document.querySelectorAll(".segmented__button").forEach(button => button.classList.toggle("is-active", button.dataset.view === "guide"));
    renderGuide();
    document.querySelector(".workspace").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function exitGuide() {
    document.querySelector(".map-panel").hidden = false;
    els.pointsPanel.hidden = false;
    els.guidePanel.hidden = true;
    document.querySelectorAll(".segmented__button").forEach(button => button.classList.toggle("is-active", button.dataset.view === "map"));
    window.setTimeout(() => {
      if (state.mapProvider === "osm") state.map?.invalidateSize();
      else fitYandexRoute();
    }, 0);
  }

  function renderGuide() {
    const point = guidedPoints[state.currentPointIndex];
    els.guideStep.textContent = `Точка ${state.currentPointIndex + 1} из ${guidedPoints.length}`;
    els.guideContent.innerHTML = `<div class="guide-layout">
      <div class="guide-visual"><img src="${escapeHtml(point.image)}" alt="${escapeHtml(point.imageAlt)}"></div>
      <div class="guide-copy">
        ${statusBadge(point)}
        <h2>${escapeHtml(point.title)}</h2>
        <p class="lead">${escapeHtml(point.intro)}</p>
        <div class="guide-blocks">
          <section class="guide-block"><h3>Что показать</h3><p>${escapeHtml(point.show)}</p></section>
          <section class="guide-block"><h3>Как рассказать</h3><p>${escapeHtml(point.guideText)}</p></section>
          <section class="guide-block"><h3>Спросить семью</h3><p>${escapeHtml(point.familyQuestion)}</p></section>
          <section class="guide-block"><h3>Безопасность</h3><p>${escapeHtml(point.safety)}</p></section>
        </div>
        <p><button class="text-button" type="button" data-edit-point="${point.id}">Есть уточнение? Предложить правку →</button></p>
      </div>
    </div>`;
    document.querySelector("#previousPointButton").disabled = state.currentPointIndex === 0;
    document.querySelector("#nextPointButton").textContent = state.currentPointIndex === guidedPoints.length - 1 ? "Завершить маршрут" : "Следующая точка";
  }

  function completePoint(pointId) {
    if (state.completed.has(pointId)) state.completed.delete(pointId); else state.completed.add(pointId);
    saveProgress();
    renderPoints();
    els.pointDialog.close();
    showToast(state.completed.has(pointId) ? "Точка отмечена пройденной" : "Отметка снята");
  }

  function exportEdits() {
    if (!state.edits.length && !state.routeIssues.length && !state.photoDrafts.length) {
      showToast("Сохранённых предложений пока нет");
      return;
    }
    const payload = {
      project: route.title,
      exportedAt: new Date().toISOString(),
      routeGeometryVersion: routeGeometry?.version || null,
      proposals: state.edits,
      routeIssues: state.routeIssues,
      photoDrafts: state.photoDrafts
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kem-route-edits-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function refreshCommunityWorkspace({ seed = false, quiet = false } = {}) {
    if (!community || !state.community.available) return;
    if (!quiet) setSyncStatus("loading", "Синхронизация");
    try {
      if (seed && userIsAuthenticated()) await community.seedPoints(pointSeedRecords());
      const workspace = await community.fetchWorkspace();
      state.community = community.current();
      applySharedWorkspace(workspace);
      setSyncStatus("online", userIsAuthenticated() ? "Общая карта" : "Онлайн");
    } catch (error) {
      setSyncStatus("error", "Нужна настройка", error.message || "Общая карта пока недоступна");
      console.error("Community workspace refresh failed", error);
      if (!quiet || userIsAuthenticated()) showToast(error.message || "Общая карта пока недоступна");
    }
  }

  function scheduleWorkspaceRefresh() {
    window.clearTimeout(state.workspaceRefreshTimer);
    state.workspaceRefreshTimer = window.setTimeout(() => refreshCommunityWorkspace({ quiet: true }), 450);
  }

  async function initializeCommunity() {
    if (!community) {
      setSyncStatus("local", "Локально");
      return;
    }
    community.on((event, payload) => {
      if (event === "auth") {
        state.community = payload;
        renderAuthState();
        renderPlan();
        refreshCommunityWorkspace({ seed: payload.authenticated, quiet: true });
      } else if (event === "workspace") {
        scheduleWorkspaceRefresh();
      } else if (event === "error") {
        setSyncStatus("error", "Ошибка связи", payload.message || "Ошибка общей карты");
        if (userIsAuthenticated()) showToast(payload.message || "Ошибка общей карты");
      }
    });
    try {
      setSyncStatus("loading", "Подключение");
      state.community = await community.init();
      renderAuthState();
      if (!state.community.available) {
        setSyncStatus("local", "Локально");
        return;
      }
      await refreshCommunityWorkspace({ seed: state.community.authenticated, quiet: true });
      community.subscribeToWorkspace();
    } catch (error) {
      setSyncStatus("error", "Нужна настройка", error.message || "Не удалось подключиться к общей карте");
      console.error("Community workspace failed to initialize", error);
    }
  }

  window.openKemPoint = openPoint;
  window.openKemPhoto = openPhoto;
  window.openKemSharedPoint = openSharedPointEditor;
  window.openKemDraftPoint = openDraftPoint;
  window.deleteKemRouteIssue = deleteRouteIssue;
  window.deleteKemCoordinateDraft = deleteCoordinateDraft;
  window.deleteKemPhotoDraft = deletePhotoDraft;

  document.addEventListener("click", event => {
    const pointCard = event.target.closest("[data-point-id]");
    const editButton = event.target.closest("[data-edit-point]");
    const completeButton = event.target.closest("[data-complete-point]");
    const closeButton = event.target.closest("[data-close-dialog]");
    const filterButton = event.target.closest("[data-filter]");
    const planFilterButton = event.target.closest("[data-plan-filter]");
    const openPlanButton = event.target.closest("[data-open-plan]");
    const photoButton = event.target.closest("[data-photo-id]");
    const addPhotoButton = event.target.closest("[data-add-photo-point]");
    const deletePhotoButton = event.target.closest("[data-delete-photo-draft]");
    const mapProviderButton = event.target.closest("[data-map-provider]");

    if (pointCard) {
      openPoint(pointCard.dataset.pointId);
      els.pointsPanel.classList.remove("is-open");
    }
    if (editButton) openEdit(editButton.dataset.editPoint);
    if (completeButton) completePoint(completeButton.dataset.completePoint);
    if (closeButton) document.querySelector(`#${closeButton.dataset.closeDialog}`).close();
    if (filterButton) {
      state.filter = filterButton.dataset.filter;
      renderFilters();
      renderPoints();
    }
    if (planFilterButton) {
      state.planFilter = planFilterButton.dataset.planFilter;
      renderPlanFilters();
      renderPlan();
    }
    if (openPlanButton) {
      openPoint(openPlanButton.dataset.openPlan);
      document.querySelector(".workspace").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (photoButton) openPhoto(photoButton.dataset.photoId);
    if (addPhotoButton) openPhotoUpload(addPhotoButton.dataset.addPhotoPoint);
    if (deletePhotoButton && window.confirm("Удалить этот черновик фотографии?")) deletePhotoDraft(deletePhotoButton.dataset.deletePhotoDraft);
    if (mapProviderButton) setMapProvider(mapProviderButton.dataset.mapProvider);
  });

  document.querySelector("#startTourButton").addEventListener("click", () => enterGuide(0));
  document.querySelector("#showListButton").addEventListener("click", () => {
    document.querySelector(".workspace").scrollIntoView({ behavior: "smooth" });
    els.pointsPanel.classList.add("is-open");
  });
  document.querySelector("#mapListToggle").addEventListener("click", () => els.pointsPanel.classList.add("is-open"));
  document.querySelector("#closeListButton").addEventListener("click", () => els.pointsPanel.classList.remove("is-open"));
  document.querySelector("#exitGuideButton").addEventListener("click", exitGuide);
  document.querySelector("#previousPointButton").addEventListener("click", () => { state.currentPointIndex -= 1; renderGuide(); });
  document.querySelector("#nextPointButton").addEventListener("click", () => {
    const current = guidedPoints[state.currentPointIndex];
    state.completed.add(current.id);
    saveProgress();
    renderPoints();
    if (state.currentPointIndex < guidedPoints.length - 1) {
      state.currentPointIndex += 1;
      renderGuide();
      window.scrollTo({ top: document.querySelector(".workspace").offsetTop, behavior: "smooth" });
    } else {
      exitGuide();
      showToast("Тестовый маршрут завершён — спасибо!");
    }
  });
  document.querySelectorAll(".segmented__button").forEach(button => button.addEventListener("click", () => button.dataset.view === "guide" ? enterGuide(state.currentPointIndex) : exitGuide()));
  document.querySelector("#aboutButton").addEventListener("click", () => document.querySelector("#aboutDialog").showModal());
  els.accountButton.addEventListener("click", () => {
    renderAuthState();
    els.authDialog.showModal();
  });
  els.syncStatus.addEventListener("click", () => {
    showToast(els.syncStatus.dataset.message || "Состояние общей карты");
  });
  els.authForm.addEventListener("submit", async event => {
    event.preventDefault();
    const email = document.querySelector("#authEmail").value.trim();
    const password = document.querySelector("#authPassword").value;
    if (!email || !password) {
      showToast("Введите почту и пароль или запросите ссылку на вход");
      return;
    }
    const button = document.querySelector("#signInButton");
    button.disabled = true;
    button.textContent = "Входим…";
    try {
      await community.signIn(email, password);
      state.community = community.current();
      renderAuthState();
      els.authDialog.close();
      showToast("Вход выполнен. Открыта общая редакционная карта");
    } catch (error) {
      showToast(error.message || "Не удалось войти");
    } finally {
      button.disabled = false;
      button.textContent = "Войти";
    }
  });
  document.querySelector("#magicLinkButton").addEventListener("click", async () => {
    const email = document.querySelector("#authEmail").value.trim();
    if (!email) {
      showToast("Сначала укажите электронную почту");
      return;
    }
    try {
      await community.sendMagicLink(email);
      showToast("Ссылка для входа отправлена на почту");
    } catch (error) {
      showToast(error.message || "Не удалось отправить ссылку");
    }
  });
  document.querySelector("#signOutButton").addEventListener("click", async () => {
    try {
      await community.signOut();
      state.community = community.current();
      renderAuthState();
      els.authDialog.close();
      showToast("Вы вышли. Карта открыта в режиме просмотра");
    } catch (error) {
      showToast(error.message || "Не удалось выйти");
    }
  });
  document.querySelector("#saveProfileButton").addEventListener("click", async () => {
    const name = document.querySelector("#profileDisplayName").value.trim();
    if (!name) return showToast("Введите имя участника");
    try {
      await community.updateDisplayName(name);
      state.community = community.current();
      renderAuthState();
      showToast("Имя сохранено");
    } catch (error) {
      showToast(error.message || "Не удалось сохранить имя");
    }
  });
  document.querySelector("#addPhotoButton").addEventListener("click", () => openPhotoUpload());
  els.photoFile.addEventListener("change", previewSelectedPhoto);
  document.querySelector("#photosButton").addEventListener("click", () => {
    state.photosVisible = !state.photosVisible;
    if (state.map && state.photoLayer) {
      if (state.photosVisible) state.photoLayer.addTo(state.map); else state.map.removeLayer(state.photoLayer);
    }
    renderYandexObjects();
    const button = document.querySelector("#photosButton");
    button.classList.toggle("is-active", state.photosVisible);
    button.setAttribute("aria-pressed", String(state.photosVisible));
    showToast(state.photosVisible ? "Фотографии показаны на карте" : "Фотографии скрыты");
  });
  document.querySelector("#coordinateModeButton").addEventListener("click", () => setCoordinateMode(!state.coordinateMode));
  document.querySelector("#routeEditButton").addEventListener("click", () => setRouteEditMode(!state.routeEditMode));
  document.querySelector("#routeUndoButton").addEventListener("click", () => {
    state.routeDraft.pop();
    updateRouteEditor();
  });
  document.querySelector("#routeResetButton").addEventListener("click", () => {
    if (!state.routeDraft.length || window.confirm("Удалить все поставленные узлы текущего черновика?")) {
      state.routeDraft = [];
      updateRouteEditor();
    }
  });
  document.querySelector("#routeSaveButton").addEventListener("click", saveSharedRoute);
  document.querySelector("#routeCancelButton").addEventListener("click", () => setRouteEditMode(false));
  document.querySelector("#routeReviewButton").addEventListener("click", () => setRouteReviewMode(!state.routeReviewMode));
  document.querySelector("#locateButton").addEventListener("click", () => {
    showToast("Определяем местоположение…");
    if (!navigator.geolocation) {
      showToast("Этот браузер не поддерживает геолокацию");
      return;
    }
    navigator.geolocation.getCurrentPosition(position => {
      showUserLocation({
        latlng: { lat: position.coords.latitude, lng: position.coords.longitude },
        accuracy: position.coords.accuracy
      });
    }, () => showToast("Не удалось определить местоположение. Проверьте разрешение геолокации."), {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 30000
    });
  });
  document.querySelector("#fitRouteButton").addEventListener("click", fitWholeRoute);
  document.querySelector("#fullscreenMapButton").addEventListener("click", () => toggleMapFullscreen().catch(() => showToast("Не удалось открыть карту на весь экран")));
  document.addEventListener("fullscreenchange", () => {
    const fullscreen = document.fullscreenElement === els.mapPanel;
    document.querySelector("#fullscreenMapButton").classList.toggle("is-active", fullscreen);
    document.querySelector("#fullscreenMapButton").textContent = fullscreen ? "× Закрыть" : "⛶ На весь экран";
    window.setTimeout(() => {
      if (state.mapProvider === "osm") state.map?.invalidateSize();
      else fitYandexRoute();
    }, 80);
  });
  document.querySelector("#exportButton").addEventListener("click", exportEdits);
  document.querySelector("#resetProgressButton").addEventListener("click", () => {
    state.completed.clear();
    saveProgress();
    renderPoints();
    showToast("Прогресс маршрута сброшен");
  });

  els.draftPointForm.addEventListener("submit", event => {
    event.preventDefault();
    const formData = new FormData(els.draftPointForm);
    const draft = state.edits.find(edit => edit.id === formData.get("editId") && edit.field === "new-point");
    if (!draft) return;
    const pointName = String(formData.get("pointName") || "").trim();
    if (!pointName) {
      showToast("Введите название точки");
      return;
    }
    draft.pointName = pointName;
    draft.source = String(formData.get("note") || "").trim();
    draft.author = String(formData.get("author") || "").trim();
    draft.text = `${pointName}: ${draft.coordinates[0].toFixed(6)}, ${draft.coordinates[1].toFixed(6)}`;
    draft.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_EDITS, JSON.stringify(state.edits));
    renderCoordinateDrafts();
    renderPhotoLayer();
    renderPhotos();
    els.draftPointDialog.close();
    showToast("Изменения черновика сохранены");
  });

  document.querySelector("#draftPointMaterialButton").addEventListener("click", () => {
    const draft = state.edits.find(edit => edit.id === els.draftPointEditId.value && edit.field === "new-point");
    if (draft) openEdit(draft.pointId);
  });
  document.querySelector("#draftPointPhotoButton").addEventListener("click", () => {
    const draft = state.edits.find(edit => edit.id === els.draftPointEditId.value && edit.field === "new-point");
    if (draft) openPhotoUpload(draft.pointId);
  });
  document.querySelector("#draftPointRelocateButton").addEventListener("click", () => startDraftRelocation(els.draftPointEditId.value));
  document.querySelector("#draftPointDeleteButton").addEventListener("click", () => {
    const draft = state.edits.find(edit => edit.id === els.draftPointEditId.value && edit.field === "new-point");
    if (!draft) return;
    const relatedPhotos = state.photoDrafts.filter(photo => photo.pointId === draft.pointId).length;
    const warning = relatedPhotos ? ` Вместе с точкой будут удалены связанные фоточерновики: ${relatedPhotos}.` : "";
    if (window.confirm(`Удалить черновик «${draft.pointName}»?${warning}`)) deleteCoordinateDraft(draft.id);
  });

  els.photoUploadForm.addEventListener("submit", async event => {
    event.preventDefault();
    const formData = new FormData(els.photoUploadForm);
    const file = els.photoFile.files?.[0];
    const point = photoPointDetails(formData.get("pointId"));
    if (!file || !point) {
      showToast("Выберите точку и фотографию");
      return;
    }
    els.savePhotoButton.disabled = true;
    els.savePhotoButton.textContent = "Обрабатываем…";
    try {
      const src = await optimizePhoto(file);
      const draft = {
        id: crypto.randomUUID ? `draft-photo-${crypto.randomUUID()}` : `draft-photo-${Date.now()}`,
        pointId: point.id,
        pointNumber: point.number,
        title: String(formData.get("title") || "").trim(),
        src,
        alt: String(formData.get("title") || "").trim(),
        date: String(formData.get("date") || "Дата уточняется").trim(),
        caption: String(formData.get("caption") || "").trim(),
        author: String(formData.get("author") || "").trim(),
        source: String(formData.get("source") || "Личный материал участника").trim(),
        rightsStatus: "Участник подтвердил авторство или разрешение; требуется проверка редактора",
        originalFileName: file.name,
        createdAt: new Date().toISOString(),
        status: "field-draft",
        isDraft: true
      };
      if (userIsAuthenticated()) {
        const response = await fetch(src);
        const blob = await response.blob();
        const optimizedFile = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
        await community.uploadPhoto({
          pointId: point.id,
          file: optimizedFile,
          title: draft.title,
          caption: draft.caption,
          shotDate: draft.date,
          author: draft.author,
          source: draft.source,
          rightsStatus: draft.rightsStatus
        });
        await refreshCommunityWorkspace({ quiet: true });
      } else {
        state.photoDrafts.push(draft);
        if (!savePhotoDrafts()) {
          state.photoDrafts.pop();
          throw new Error("На устройстве не хватает места. Сначала выгрузите и удалите старые черновики");
        }
      }
      renderPhotos();
      renderPhotoLayer();
      renderPlan();
      renderYandexObjects();
      els.photoUploadDialog.close();
      els.photoUploadForm.reset();
      els.photoUploadPreview.hidden = true;
      document.querySelector("#photoStories").scrollIntoView({ behavior: "smooth", block: "start" });
      showToast(userIsAuthenticated() ? "Фотография добавлена в общую карту как черновик" : "Фотография сохранена как черновик участника");
    } catch (error) {
      showToast(error.message || "Не удалось сохранить фотографию");
    } finally {
      els.savePhotoButton.disabled = false;
      els.savePhotoButton.textContent = userIsAuthenticated() ? "Добавить в общую карту" : "Сохранить черновик";
    }
  });

  els.sharedPointForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!requireParticipant()) return;
    const formData = new FormData(els.sharedPointForm);
    const existing = state.sharedPointRecords.find(point => point.id === formData.get("id")) || pointRecordForEditor(formData.get("id"));
    const latitudeText = String(formData.get("lat") || "").trim().replace(",", ".");
    const longitudeText = String(formData.get("lng") || "").trim().replace(",", ".");
    if (Boolean(latitudeText) !== Boolean(longitudeText)) {
      showToast("Укажите и широту, и долготу — либо оставьте оба поля пустыми");
      return;
    }
    const latitude = latitudeText ? Number(latitudeText) : null;
    const longitude = longitudeText ? Number(longitudeText) : null;
    if ((latitudeText && !Number.isFinite(latitude)) || (longitudeText && !Number.isFinite(longitude))) {
      showToast("Проверьте формат координат");
      return;
    }
    const content = existing?.content || {};
    const record = {
      id: String(formData.get("id")),
      route_order: Number(formData.get("routeOrder")) || null,
      chapter: String(formData.get("chapter") || "railway"),
      title: String(formData.get("title") || "").trim(),
      short_title: String(formData.get("shortTitle") || "").trim(),
      latitude,
      longitude,
      coordinate_status: String(formData.get("coordinateStatus") || "needs-check"),
      status: String(formData.get("status") || "research"),
      created_by: existing?.created_by || undefined,
      content: {
        ...content,
        duration: String(formData.get("duration") || "").trim(),
        coordinateNote: String(formData.get("coordinateNote") || "").trim(),
        intro: String(formData.get("intro") || "").trim(),
        facts: String(formData.get("facts") || "").split(/\n+/).map(item => item.trim()).filter(Boolean),
        show: String(formData.get("show") || "").trim(),
        guideText: String(formData.get("guideText") || "").trim(),
        familyQuestion: String(formData.get("familyQuestion") || "").trim(),
        safety: String(formData.get("safety") || "").trim(),
        sources: parseSources(formData.get("sources"))
      }
    };
    els.sharedPointSaveButton.disabled = true;
    els.sharedPointSaveButton.textContent = "Сохраняем…";
    try {
      await community.savePoint(record);
      await refreshCommunityWorkspace({ quiet: true });
      els.sharedPointDialog.close();
      showToast("Точка сохранена в общей карте");
    } catch (error) {
      showToast(error.message || "Не удалось сохранить точку");
    } finally {
      els.sharedPointSaveButton.disabled = false;
      els.sharedPointSaveButton.textContent = "Сохранить для всех";
    }
  });

  els.editForm.addEventListener("submit", event => {
    event.preventDefault();
    const formData = new FormData(els.editForm);
    state.edits.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `edit-${Date.now()}`,
      pointId: formData.get("pointId"),
      pointName: formData.get("pointName"),
      field: formData.get("field"),
      text: formData.get("text"),
      source: formData.get("source"),
      author: formData.get("author"),
      createdAt: new Date().toISOString(),
      status: "draft"
    });
    localStorage.setItem(STORAGE_EDITS, JSON.stringify(state.edits));
    els.editDialog.close();
    showToast("Предложение сохранено на этом устройстве");
  });

  els.coordinateForm.addEventListener("submit", async event => {
    event.preventDefault();
    const formData = new FormData(els.coordinateForm);
    const isNewPoint = formData.get("pointId") === "__new__";
    const planned = isNewPoint ? null : route.plannedPoints.find(point => point.id === formData.get("pointId"));
    const proposalId = crypto.randomUUID ? crypto.randomUUID() : `coordinate-${Date.now()}`;
    const pointName = isNewPoint ? String(formData.get("newPointName") || "").trim() : (planned ? planned.title : formData.get("pointId"));
    if (isNewPoint && !pointName) {
      showToast("Введите название новой точки");
      els.coordinateNewPointName.focus();
      return;
    }
    if (userIsAuthenticated()) {
      const submitButton = els.coordinateForm.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      submitButton.textContent = "Сохраняем…";
      try {
        const pointId = isNewPoint
          ? `point-${Date.now()}-${pointName.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40) || "new"}`
          : String(formData.get("pointId"));
        const existing = isNewPoint ? null : pointRecordForEditor(pointId);
        const maxOrder = route.plannedPoints.reduce((maximum, point) => Math.max(maximum, Number(point.number) || 0), 0);
        const note = String(formData.get("note") || "").trim();
        await community.savePoint({
          id: pointId,
          route_order: existing?.route_order || maxOrder + 1,
          chapter: existing?.chapter || "railway",
          title: pointName,
          short_title: existing?.short_title || pointName,
          latitude: Number(formData.get("lat")),
          longitude: Number(formData.get("lng")),
          coordinate_status: "needs-check",
          status: existing?.status || "draft",
          created_by: existing?.created_by || undefined,
          content: {
            ...(existing?.content || {}),
            coordinateNote: note || existing?.content?.coordinateNote || "Новая координата участника; требуется полевая проверка."
          }
        });
        state.coordinatePreview = null;
        if (state.coordinateMarker) {
          state.coordinateMarker.remove();
          state.coordinateMarker = null;
        }
        await refreshCommunityWorkspace({ quiet: true });
        els.coordinateDialog.close();
        els.coordinateForm.reset();
        updateCoordinatePointMode();
        showToast(isNewPoint ? "Новая точка добавлена в общую карту" : "Координата обновлена для всех участников");
      } catch (error) {
        showToast(error.message || "Не удалось сохранить координату");
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Сохранить координату";
      }
      return;
    }
    state.edits.push({
      id: proposalId,
      pointId: isNewPoint ? `new-${proposalId}` : formData.get("pointId"),
      pointName,
      field: isNewPoint ? "new-point" : "coordinate",
      text: isNewPoint ? `${pointName}: ${formData.get("lat")}, ${formData.get("lng")}` : `${formData.get("lat")}, ${formData.get("lng")}`,
      coordinates: [Number(formData.get("lat")), Number(formData.get("lng"))],
      source: formData.get("note"),
      author: formData.get("author"),
      createdAt: new Date().toISOString(),
      status: "field-draft"
    });
    localStorage.setItem(STORAGE_EDITS, JSON.stringify(state.edits));
    if (state.coordinateMarker) {
      state.coordinateMarker.remove();
      state.coordinateMarker = null;
    }
    state.coordinatePreview = null;
    renderCoordinateDrafts();
    els.coordinateDialog.close();
    els.coordinateForm.reset();
    updateCoordinatePointMode();
    showToast(isNewPoint ? "Новая точка сохранена как черновик" : "Координата сохранена как редакционный черновик");
  });

  els.coordinateDialog.addEventListener("close", () => {
    if (state.coordinateMarker) {
      state.coordinateMarker.remove();
      state.coordinateMarker = null;
    }
    state.coordinatePreview = null;
    renderYandexObjects();
  });

  els.routeIssueForm.addEventListener("submit", event => {
    event.preventDefault();
    const formData = new FormData(els.routeIssueForm);
    state.routeIssues.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `route-issue-${Date.now()}`,
      type: formData.get("type"),
      detail: formData.get("detail"),
      coordinates: [Number(formData.get("lat")), Number(formData.get("lng"))],
      author: formData.get("author"),
      createdAt: new Date().toISOString(),
      status: "field-draft"
    });
    saveRouteIssues();
    els.routeIssueDialog.close();
    els.routeIssueForm.reset();
    showToast("Замечание появилось на карте и сохранено на этом устройстве");
  });

  document.querySelector("#sharedPointChapter").innerHTML = route.chapters.map(chapter => `<option value="${escapeHtml(chapter.id)}">${escapeHtml(chapter.title)}</option>`).join("");
  renderCoordinatePointOptions();
  document.querySelector("#coordinatePoint").addEventListener("change", updateCoordinatePointMode);

  renderFilters();
  renderPoints();
  renderPlanFilters();
  renderPlan();
  renderPhotos();
  updateProgress();
  renderRouteIssues();
  renderCoordinateDrafts();
  initMap();
  initializeCommunity();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();
