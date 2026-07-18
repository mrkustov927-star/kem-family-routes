(function () {
  "use strict";

  const route = window.KEM_ROUTE;
  const photos = window.KEM_PHOTOS || [];
  const routeGeometry = window.KEM_ROUTE_GEOMETRY || null;
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
    photosVisible: false,
    coordinatePreview: null,
    userLocation: null,
    userAccuracy: 0,
    yandexMap: null,
    yandexClasses: null,
    yandexObjects: [],
    yandexReady: false,
    yandexStatus: "idle"
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
    return [...photos, ...state.photoDrafts];
  }

  function photoPointDetails(pointId) {
    const guided = guidedPoints.find(point => point.id === pointId);
    if (guided) return { id: guided.id, title: guided.title, number: guided.number, coordinates: guided.coordinates };
    const planned = route.plannedPoints.find(point => point.id === pointId);
    const draft = state.edits.find(edit => edit.field === "new-point" && edit.pointId === pointId);
    if (draft) return { id: draft.pointId, title: draft.pointName, number: "+", coordinates: draft.coordinates };
    if (planned) return { id: planned.id, title: planned.title, number: planned.number, coordinates: null };
    return null;
  }

  function savePhotoDrafts() {
    try {
      localStorage.setItem(STORAGE_PHOTO_DRAFTS, JSON.stringify(state.photoDrafts));
      return true;
    } catch (_) {
      return false;
    }
  }

  function initMap() {
    const routeLine = routeGeometry?.coordinates?.length
      ? routeGeometry.coordinates
      : guidedPoints.map(point => point.coordinates);
    state.routeCoordinates = routeLine;

    if (routeGeometry) {
      const distanceKm = routeGeometry.distanceMeters / 1000;
      els.routeDistance.textContent = `${distanceKm.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} км`;
      els.routeWalkingTime.textContent = `≈ ${routeGeometry.estimatedWalkingMinutes} мин пешком`;
    }

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
        if (state.routeReviewMode) captureRouteIssue(latlng);
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
    const routeLine = state.routeCoordinates;
    L.polyline(routeLine, { color: "#fff", weight: 9, opacity: .92, lineJoin: "round", lineCap: "round", interactive: false }).addTo(state.routeLayer);
    L.polyline(routeLine, { color: "#e21f26", weight: 5, opacity: .94, lineJoin: "round", lineCap: "round", interactive: false }).addTo(state.routeLayer);

    guidedPoints.forEach(point => {
      const needsCheck = point.coordinateStatus === "needs-check";
      const marker = L.marker(point.coordinates, {
        icon: L.divIcon({
          className: "",
          html: `<div class="map-marker ${needsCheck ? "map-marker--check" : ""}"><span>${point.number}</span></div>`,
          iconSize: [38, 38],
          iconAnchor: [18, 38],
          popupAnchor: [0, -38]
        })
      }).addTo(state.routeLayer);

      marker.bindPopup(`<strong>${point.shortTitle}</strong><br><small>${needsCheck ? "Координату проверить" : "Координата проверена"}</small><br><button class="popup-button" onclick="window.openKemPoint('${point.id}')">Открыть подсказку →</button>`);
      marker.on("click", () => highlightPoint(point.id));
      state.markers.set(point.id, marker);
    });

    state.photoLayer = L.layerGroup();
    renderPhotoLayer();

    state.routeIssueLayer = L.layerGroup().addTo(state.map);
    renderRouteIssues();
    state.coordinateDraftLayer = L.layerGroup().addTo(state.map);
    renderCoordinateDrafts();

    const bounds = L.latLngBounds(routeLine);
    state.map.fitBounds(bounds, { padding: [45, 45] });

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
      if (state.routeReviewMode) captureRouteIssue(event.latlng);
      else if (state.coordinateMode) captureCoordinate(event.latlng);
    });
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
    const routeLine = state.routeCoordinates.map(toYandexCoordinates);
    addYandexObject(new state.yandexClasses.YMapFeature({
      id: "kem-route-outline",
      geometry: { type: "LineString", coordinates: routeLine },
      style: { stroke: [{ color: "#ffffff", width: 9, opacity: .92 }] }
    }));
    addYandexObject(new state.yandexClasses.YMapFeature({
      id: "kem-route-line",
      geometry: { type: "LineString", coordinates: routeLine },
      style: { stroke: [{ color: "#e21f26", width: 5, opacity: .94 }] }
    }));

    guidedPoints.forEach(point => {
      const needsCheck = point.coordinateStatus === "needs-check";
      addYandexMarker(
        point.coordinates,
        `<div class="map-marker ${needsCheck ? "map-marker--check" : ""}"><span>${point.number}</span></div>`,
        `${point.number}. ${point.shortTitle}`,
        () => openPoint(point.id)
      );
    });

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
    if (!state.yandexReady || !state.yandexMap || !state.routeCoordinates.length) return;
    const longitudes = state.routeCoordinates.map(coordinates => coordinates[1]);
    const latitudes = state.routeCoordinates.map(coordinates => coordinates[0]);
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
    const routeLine = state.routeCoordinates.length ? state.routeCoordinates : guidedPoints.map(point => point.coordinates);
    state.map.fitBounds(L.latLngBounds(routeLine), { padding: [55, 55] });
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
      const action = isReady
        ? `<button class="plan-action" type="button" data-open-plan="${point.id}">Открыть карточку →</button>`
        : `<button class="plan-action" type="button" data-edit-point="${point.id}">Добавить материал →</button>`;
      const photoAction = photo ? `<button class="plan-action" type="button" data-photo-id="${photo.id}">▣ Есть фото</button>` : "";
      const addPhotoAction = `<button class="plan-action" type="button" data-add-photo-point="${point.id}">＋ Фото</button>`;
      return `<li class="plan-item ${isReady ? "plan-item--ready" : ""}"><span class="plan-item__number">${point.number}</span><div><h3>${point.title}</h3><div class="plan-item__meta"><span class="plan-status">${isReady ? "✓ карточка готова" : "○ исследуем"}</span>${photoAction}${addPhotoAction}${action}</div></div></li>`;
    }).join("");
  }

  function renderPhotos() {
    els.photoStrip.innerHTML = allPhotos().map(photo => `<button class="photo-card${photo.isDraft ? " photo-card--draft" : ""}" type="button" data-photo-id="${photo.id}"><img src="${photo.src}" alt="" loading="lazy"><span class="photo-card__copy"><span>${photo.isDraft ? "Черновик" : `Точка ${escapeHtml(photo.pointNumber)}`}</span><strong>${escapeHtml(photo.title)}</strong><small>${escapeHtml(photo.date || "Дата уточняется")}</small></span></button>`).join("");
  }

  function openPhoto(photoId) {
    const photo = allPhotos().find(item => item.id === photoId);
    if (!photo) return;
    const draftAction = photo.isDraft ? `<p><button class="text-button text-button--danger" type="button" data-delete-photo-draft="${photo.id}">Удалить этот черновик</button></p>` : `<p><button class="text-button" type="button" data-edit-point="${photo.pointId}">Уточнить подпись или автора →</button></p>`;
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

  function openPhotoUpload(pointId = "") {
    if (els.pointDialog.open) els.pointDialog.close();
    if (els.photoDialog.open) els.photoDialog.close();
    if (els.draftPointDialog.open) els.draftPointDialog.close();
    els.photoUploadForm.reset();
    els.photoUploadPreview.hidden = true;
    els.photoUploadPreview.querySelector("img").removeAttribute("src");
    photoPointOptions(pointId);
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
    if (enabled && state.coordinateMode) setCoordinateMode(false);
    state.routeReviewMode = enabled;
    els.mapPanel.classList.toggle("is-route-review-mode", enabled);
    const button = document.querySelector("#routeReviewButton");
    button.classList.toggle("is-active", enabled);
    button.setAttribute("aria-pressed", String(enabled));
    if (enabled) showToast("Нажмите на проблемное место красной линии");
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
      return `<li><button class="point-card" type="button" data-point-id="${point.id}" data-status="${point.coordinateStatus}"><span class="point-card__number">${point.number}</span><strong>${point.shortTitle}</strong><small>${chapter.title} · ${point.duration}${done}</small></button></li>`;
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
    return point.sources.map(source => `<li><a href="${source.url}" target="_blank" rel="noreferrer">${source.title}</a></li>`).join("");
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
      <h2>${point.title}</h2>
      <p class="lead">${point.intro}</p>
      <div class="dialog-visual"><img src="${point.image}" alt="${point.imageAlt}"></div>
      <h3>Короткие факты</h3>
      <ul class="fact-list">${point.facts.map(fact => `<li>${fact}</li>`).join("")}</ul>
      <h3>Что показать</h3><p>${point.show}</p>
      <h3>Вопрос семье</h3><p>${point.familyQuestion}</p>
      <h3>Важно</h3><p>${point.safety}</p>
      <details><summary>Координата и источники</summary><p class="muted">${point.coordinateNote}</p><ul class="source-list">${sourceList(point)}</ul></details>
      <div class="dialog-actions">
        <button class="button button--ghost" type="button" data-add-photo-point="${point.id}">Добавить фото</button>
        <button class="button button--ghost" type="button" data-edit-point="${point.id}">Предложить правку</button>
        <button class="button button--primary" type="button" data-complete-point="${point.id}">${state.completed.has(point.id) ? "Отметить непройденной" : "Точка пройдена"}</button>
      </div>`;
    els.pointDialog.showModal();
  }

  function openEdit(pointId) {
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
      <div class="guide-visual"><img src="${point.image}" alt="${point.imageAlt}"></div>
      <div class="guide-copy">
        ${statusBadge(point)}
        <h2>${point.title}</h2>
        <p class="lead">${point.intro}</p>
        <div class="guide-blocks">
          <section class="guide-block"><h3>Что показать</h3><p>${point.show}</p></section>
          <section class="guide-block"><h3>Как рассказать</h3><p>${point.guideText}</p></section>
          <section class="guide-block"><h3>Спросить семью</h3><p>${point.familyQuestion}</p></section>
          <section class="guide-block"><h3>Безопасность</h3><p>${point.safety}</p></section>
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

  window.openKemPoint = openPoint;
  window.openKemPhoto = openPhoto;
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
      state.photoDrafts.push(draft);
      if (!savePhotoDrafts()) {
        state.photoDrafts.pop();
        throw new Error("На устройстве не хватает места. Сначала выгрузите и удалите старые черновики");
      }
      renderPhotos();
      renderPhotoLayer();
      renderPlan();
      renderYandexObjects();
      els.photoUploadDialog.close();
      els.photoUploadForm.reset();
      els.photoUploadPreview.hidden = true;
      document.querySelector("#photoStories").scrollIntoView({ behavior: "smooth", block: "start" });
      showToast("Фотография сохранена как черновик участника");
    } catch (error) {
      showToast(error.message || "Не удалось сохранить фотографию");
    } finally {
      els.savePhotoButton.disabled = false;
      els.savePhotoButton.textContent = "Сохранить черновик";
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

  els.coordinateForm.addEventListener("submit", event => {
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

  document.querySelector("#coordinatePoint").innerHTML = `<option value="">Выберите точку</option><option value="__new__">＋ Добавить новую точку</option>${route.plannedPoints.map(point => `<option value="${point.id}">${point.number}. ${point.title}${point.status === "ready" ? " — есть координата" : ""}</option>`).join("")}`;
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

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();
