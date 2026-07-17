(function () {
  "use strict";

  const route = window.KEM_ROUTE;
  const photos = window.KEM_PHOTOS || [];
  const STORAGE_PROGRESS = "kem-route-progress-v1";
  const STORAGE_EDITS = "kem-route-edits-v1";
  const state = {
    filter: "all",
    planFilter: "all",
    currentPointIndex: 0,
    completed: new Set(readStorage(STORAGE_PROGRESS, [])),
    edits: readStorage(STORAGE_EDITS, []),
    markers: new Map(),
    map: null,
    routeLayer: null,
    coordinateMode: false,
    coordinateMarker: null,
    userMarker: null,
    accuracyCircle: null
  };

  const els = {
    map: document.querySelector("#map"),
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
    coordinateDialog: document.querySelector("#coordinateDialog"),
    coordinateForm: document.querySelector("#coordinateForm"),
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
    const total = route.points.length;
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

  function initMap() {
    if (!window.L) {
      els.map.innerHTML = '<div style="padding:32px">Карта не загрузилась. Проверьте подключение к интернету.</div>';
      return;
    }

    state.map = L.map("map", { zoomControl: true, scrollWheelZoom: false }).setView([64.953, 34.594], 14);
    const tileOptions = {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    };
    const streetMap = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", tileOptions).addTo(state.map);
    const quietMap = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", tileOptions);
    quietMap.on("add", () => window.setTimeout(() => {
      const container = quietMap.getContainer();
      if (container) container.classList.add("map-tiles--quiet");
    }, 0));

    state.routeLayer = L.layerGroup().addTo(state.map);
    const routeLine = route.points.map(point => point.coordinates);
    L.polyline(routeLine, { color: "#e21f26", weight: 4, opacity: .82, dashArray: "9 9" }).addTo(state.routeLayer);

    route.points.forEach(point => {
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

    const bounds = L.latLngBounds(routeLine);
    state.map.fitBounds(bounds, { padding: [45, 45] });

    L.control.layers(
      { "Карта улиц": streetMap, "Спокойная схема": quietMap },
      { "Маршрут экскурсии": state.routeLayer },
      { position: "bottomright", collapsed: true }
    ).addTo(state.map);
    state.map.on("click", event => {
      if (state.coordinateMode) captureCoordinate(event.latlng);
    });
    state.map.on("locationfound", showUserLocation);
    state.map.on("locationerror", () => showToast("Не удалось определить местоположение. Проверьте разрешение геолокации."));
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
      const photo = photos.find(item => item.pointId === point.id);
      const action = isReady
        ? `<button class="plan-action" type="button" data-open-plan="${point.id}">Открыть карточку →</button>`
        : `<button class="plan-action" type="button" data-edit-point="${point.id}">Добавить материал →</button>`;
      const photoAction = photo ? `<button class="plan-action" type="button" data-photo-id="${photo.id}">▣ Есть фото</button>` : "";
      return `<li class="plan-item ${isReady ? "plan-item--ready" : ""}"><span class="plan-item__number">${point.number}</span><div><h3>${point.title}</h3><div class="plan-item__meta"><span class="plan-status">${isReady ? "✓ карточка готова" : "○ исследуем"}</span>${photoAction}${action}</div></div></li>`;
    }).join("");
  }

  function renderPhotos() {
    els.photoStrip.innerHTML = photos.map(photo => `<button class="photo-card" type="button" data-photo-id="${photo.id}"><img src="${photo.src}" alt="" loading="lazy"><span class="photo-card__copy"><span>Точка ${photo.pointNumber}</span><strong>${photo.title}</strong><small>${photo.date}</small></span></button>`).join("");
  }

  function openPhoto(photoId) {
    const photo = photos.find(item => item.id === photoId);
    if (!photo) return;
    els.photoDialogContent.innerHTML = `<img class="photo-viewer__image" src="${photo.src}" alt="${photo.alt}"><div class="photo-viewer__copy"><p class="eyebrow">Фото · точка ${photo.pointNumber}</p><h2>${photo.title}</h2><p>${photo.caption}</p><div class="photo-meta"><div><strong>Дата</strong><span>${photo.date}</span></div><div><strong>Автор</strong><span>${photo.author}</span></div><div><strong>Источник</strong><span>${photo.source}</span></div><div><strong>Статус прав</strong><span>${photo.rightsStatus}</span></div></div><p><button class="text-button" type="button" data-edit-point="${photo.pointId}">Уточнить подпись или автора →</button></p></div>`;
    els.photoDialog.showModal();
  }

  function setCoordinateMode(enabled) {
    state.coordinateMode = enabled;
    els.mapPanel.classList.toggle("is-coordinate-mode", enabled);
    const button = document.querySelector("#coordinateModeButton");
    button.classList.toggle("is-active", enabled);
    button.setAttribute("aria-pressed", String(enabled));
    if (enabled) showToast("Нажмите на карте в месте остановки группы");
  }

  function captureCoordinate(latlng) {
    setCoordinateMode(false);
    if (state.coordinateMarker) state.coordinateMarker.remove();
    state.coordinateMarker = L.marker(latlng, {
      icon: L.divIcon({ className: "", html: '<div class="coordinate-marker">＋</div>', iconSize: [30, 30], iconAnchor: [15, 15] })
    }).addTo(state.map);
    document.querySelector("#coordinateLat").value = latlng.lat.toFixed(6);
    document.querySelector("#coordinateLng").value = latlng.lng.toFixed(6);
    els.coordinateDialog.showModal();
  }

  function showUserLocation(event) {
    if (state.userMarker) state.userMarker.remove();
    if (state.accuracyCircle) state.accuracyCircle.remove();
    state.userMarker = L.marker(event.latlng, {
      icon: L.divIcon({ className: "", html: '<div class="user-marker"></div>', iconSize: [24, 24], iconAnchor: [12, 12] })
    }).addTo(state.map).bindPopup("Вы находитесь здесь").openPopup();
    state.accuracyCircle = L.circle(event.latlng, { radius: event.accuracy, color: "#1769aa", weight: 1, fillOpacity: .08 }).addTo(state.map);
    const nearest = route.points.map(point => ({ point, distance: state.map.distance(event.latlng, point.coordinates) })).sort((a, b) => a.distance - b.distance)[0];
    const distanceText = nearest.distance < 1000 ? `${Math.round(nearest.distance)} м` : `${(nearest.distance / 1000).toFixed(1)} км`;
    showToast(`Ближайшая готовая точка — «${nearest.point.shortTitle}», ${distanceText}`);
  }

  function renderPoints() {
    const visible = state.filter === "all" ? route.points : route.points.filter(point => point.chapter === state.filter);
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
    const point = route.points.find(item => item.id === pointId);
    if (!point) return;
    state.currentPointIndex = route.points.indexOf(point);
    highlightPoint(pointId);
    if (state.map) state.map.flyTo(point.coordinates, 16, { duration: .65 });

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
        <button class="button button--ghost" type="button" data-edit-point="${point.id}">Предложить правку</button>
        <button class="button button--primary" type="button" data-complete-point="${point.id}">${state.completed.has(point.id) ? "Отметить непройденной" : "Точка пройдена"}</button>
      </div>`;
    els.pointDialog.showModal();
  }

  function openEdit(pointId) {
    const point = route.points.find(item => item.id === pointId) || route.plannedPoints.find(item => item.id === pointId);
    if (!point) return;
    if (els.pointDialog.open) els.pointDialog.close();
    if (els.photoDialog.open) els.photoDialog.close();
    els.editForm.reset();
    document.querySelector("#editPointId").value = point.id;
    document.querySelector("#editPointName").value = point.title;
    els.editDialog.showModal();
  }

  function enterGuide(pointIndex = 0) {
    state.currentPointIndex = Math.min(Math.max(pointIndex, 0), route.points.length - 1);
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
    window.setTimeout(() => state.map && state.map.invalidateSize(), 0);
  }

  function renderGuide() {
    const point = route.points[state.currentPointIndex];
    els.guideStep.textContent = `Точка ${state.currentPointIndex + 1} из ${route.points.length}`;
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
    document.querySelector("#nextPointButton").textContent = state.currentPointIndex === route.points.length - 1 ? "Завершить маршрут" : "Следующая точка";
  }

  function completePoint(pointId) {
    if (state.completed.has(pointId)) state.completed.delete(pointId); else state.completed.add(pointId);
    saveProgress();
    renderPoints();
    els.pointDialog.close();
    showToast(state.completed.has(pointId) ? "Точка отмечена пройденной" : "Отметка снята");
  }

  function exportEdits() {
    if (!state.edits.length) {
      showToast("Сохранённых предложений пока нет");
      return;
    }
    const payload = { project: route.title, exportedAt: new Date().toISOString(), proposals: state.edits };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kem-route-edits-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  window.openKemPoint = openPoint;

  document.addEventListener("click", event => {
    const pointCard = event.target.closest("[data-point-id]");
    const editButton = event.target.closest("[data-edit-point]");
    const completeButton = event.target.closest("[data-complete-point]");
    const closeButton = event.target.closest("[data-close-dialog]");
    const filterButton = event.target.closest("[data-filter]");
    const planFilterButton = event.target.closest("[data-plan-filter]");
    const openPlanButton = event.target.closest("[data-open-plan]");
    const photoButton = event.target.closest("[data-photo-id]");

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
    const current = route.points[state.currentPointIndex];
    state.completed.add(current.id);
    saveProgress();
    renderPoints();
    if (state.currentPointIndex < route.points.length - 1) {
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
  document.querySelector("#photosButton").addEventListener("click", () => document.querySelector("#photoStories").scrollIntoView({ behavior: "smooth", block: "start" }));
  document.querySelector("#coordinateModeButton").addEventListener("click", () => setCoordinateMode(!state.coordinateMode));
  document.querySelector("#locateButton").addEventListener("click", () => {
    if (!state.map) return;
    showToast("Определяем местоположение…");
    state.map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true, timeout: 12000 });
  });
  document.querySelector("#exportButton").addEventListener("click", exportEdits);
  document.querySelector("#resetProgressButton").addEventListener("click", () => {
    state.completed.clear();
    saveProgress();
    renderPoints();
    showToast("Прогресс маршрута сброшен");
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
    const planned = route.plannedPoints.find(point => point.id === formData.get("pointId"));
    state.edits.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `coordinate-${Date.now()}`,
      pointId: formData.get("pointId"),
      pointName: planned ? planned.title : formData.get("pointId"),
      field: "coordinate",
      text: `${formData.get("lat")}, ${formData.get("lng")}`,
      coordinates: [Number(formData.get("lat")), Number(formData.get("lng"))],
      source: formData.get("note"),
      author: formData.get("author"),
      createdAt: new Date().toISOString(),
      status: "field-draft"
    });
    localStorage.setItem(STORAGE_EDITS, JSON.stringify(state.edits));
    els.coordinateDialog.close();
    showToast("Координата сохранена как редакционный черновик");
  });

  document.querySelector("#coordinatePoint").innerHTML = route.plannedPoints.map(point => `<option value="${point.id}">${point.number}. ${point.title}${point.status === "ready" ? " — есть координата" : ""}</option>`).join("");

  renderFilters();
  renderPoints();
  renderPlanFilters();
  renderPlan();
  renderPhotos();
  updateProgress();
  initMap();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();
