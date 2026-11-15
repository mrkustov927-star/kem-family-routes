const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const source = read('app.js');
const storage = new Map([['kem-route-progress-v1', JSON.stringify(['station', 'removed-point'])]]);
let failLineStorage = false;
const nodes = new Map();
let generatedNodeId = 0;
function node(key) {
  if (!nodes.has(key)) nodes.set(key, {
    innerHTML: '', textContent: '', value: '', hidden: true, open: false, disabled: false, dataset: {}, style: {}, options: [],
    classList: { add(){}, remove(){}, toggle(){} }, querySelectorAll: () => [],
    querySelector: selector => node(key + selector), addEventListener(){}, setAttribute(){},
    scrollIntoView(){}, showModal(){this.open = true;}, close(){this.open = false;}
  });
  return nodes.get(key);
}
let mainWrites = 0;
let gate = null;
const context = {
  window: { location: { href: 'https://mrkustov927-star.github.io/kem-family-routes/' }, setTimeout: () => 0, clearTimeout(){}, KemCommunity: { async saveRouteWaypoints(){ mainWrites++; if (gate) await gate; } } },
  localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => {if(failLineStorage && key.startsWith('kem-route-line-v1:')) throw new Error('Storage full'); storage.set(key, String(value));} },
  document: { querySelector: node, querySelectorAll: () => [], createElement: () => node('generated:'+generatedNodeId++) }, URL, console, Map, Set,
};
vm.createContext(context);
for (const name of ['points.js','research-cards.js','visual-evidence.js','route-geometry.js','routes.js','photos.js']) vm.runInContext(read(name), context);
const boundary = source.indexOf('  window.openKemPoint = openPoint;');
assert(boundary > 0);
vm.runInContext(source.slice(0,boundary) + '\nwindow.testRoutes={state,els,selectRoute,selectedRoutePoints,selectedRouteGeometry,activeRouteLine,applySharedWorkspace,updateProgress,saveProgress,renderGuide,openPoint,saveSharedRoute,selectedRouteIssues,pointDisplayNumber,renderPlan,renderPlanFilters,renderPoints,renderYandexObjects,redrawLeafletRoute,renderPhotos,photoPointDetails};\n})();', context);
const api = context.window.testRoutes;
api.state.community.authenticated = true;
api.state.routeCoordinates = api.selectedRouteGeometry();
assert.equal(api.selectedRoutePoints().length,46);
api.updateProgress();
assert.equal(api.els.progressText.textContent,'1 из 46 точек');

assert.equal(context.window.KEM_ROUTES.length,3);
assert.equal(api.selectRoute('annunciation-assumption'),true);
assert.deepEqual(Array.from(api.selectedRoutePoints(),p=>p.id),[
  'annunciation','krestovsky-prospect','slon-office','pomor-house','revolution-square',
  'humpback-bridge','kem-fortress','mill-street','malyshev-street',
  'sea-rapid-memorial','vitsupa-ostrog','pomorye-museum','assumption-cathedral'
]);
assert.equal(new Set(api.selectedRoutePoints().map(p=>p.id)).size,13);
assert.equal(api.activeRouteLine().length,0,'The third route does not borrow main geometry');
assert.equal(api.els.routeOverview.hidden,false);
assert(api.els.routeOverviewContent.innerHTML.includes('Троицкая часовня'));
assert(api.els.routeOverviewContent.innerHTML.includes('порядок тематических остановок'));
for (const topic of ['Лихачёв','Пономарёв','Зосимо-Савватиевский','судоверф','Ужма','жемчужниц','Подужем','телеграф','Державин','артел']) {
  assert(api.els.routeOverviewContent.innerHTML.toLowerCase().includes(topic.toLowerCase()), 'Missing route theme: '+topic);
}
for (const id of ['krestovsky-prospect','kem-fortress','mill-street','malyshev-street']) {
  const p=api.selectedRoutePoints().find(p=>p.id===id);assert(p);assert.equal(p.coordinates,null);
}
api.openPoint('slon-office');assert(api.els.pointDialogContent.innerHTML.includes('Лихачёв'));
api.renderGuide();assert(api.els.guideContent.innerHTML.includes('Лихачёв'));
api.selectRoute('main');api.openPoint('slon-office');
assert(!api.els.pointDialogContent.innerHTML.includes('Темы этого маршрута'),'Route supplements do not alter the general card');
api.selectRoute('annunciation-assumption');
assert.equal((api.els.routeOverviewContent.innerHTML.match(/data-point-id=/g)||[]).length,13);
api.state.completed.add('annunciation');api.saveProgress();
assert.equal(api.els.progressText.textContent,'1 из 13 точек');
api.renderGuide();assert(api.els.guideStep.textContent.includes('из 13'));
api.selectRoute('main');
assert.equal(api.els.routeOverview.hidden,true);
assert.equal(api.els.routeOverviewContent.innerHTML,'');
assert(!api.state.completed.has('annunciation'));
api.selectRoute('annunciation-assumption');
assert(api.state.completed.has('annunciation'));
api.selectRoute('main');

assert.equal(api.selectRoute('ckis-assumption'),true);
assert.equal(api.selectedRoutePoints().length,9);
assert.equal(api.selectedRoutePoints()[0].id,'ckis-square');
assert.equal(api.selectedRoutePoints().at(-1).id,'assumption-cathedral');
assert.equal(api.activeRouteLine().length,0,'No main line leaks into the short route');
api.state.completed.add('ckis-square'); api.saveProgress();
assert.equal(api.els.progressText.textContent,'1 из 9 точек');
api.selectRoute('main');
assert(api.state.completed.has('station') && !api.state.completed.has('ckis-square'));
api.selectRoute('ckis-assumption');
assert(api.state.completed.has('ckis-square') && !api.state.completed.has('station'));
api.state.routeEditMode = true;
assert.equal(api.selectRoute('main'),false,'Do not discard a line draft');
assert.equal(api.state.activeRouteId,'ckis-assumption');
api.state.routeEditMode = false;
api.state.routeIssues = [{id:'old'},{id:'short',routeId:'ckis-assumption'}];
assert.equal(api.selectedRouteIssues()[0].id,'short');
const mainLine = [{route_id:'main',position:1,latitude:64.95,longitude:34.60},{route_id:'main',position:2,latitude:64.96,longitude:34.61}];
api.applySharedWorkspace({points:[],photos:[],waypoints:mainLine,routes:[{id:'main',title:'Общий',status:'published'}]});
assert.equal(api.activeRouteLine().length,0);
api.state.routeEditMode = true;
api.state.routeDraft = [[64.945,34.61],[64.946,34.62]];
(async () => {
  await api.saveSharedRoute();
  assert.equal(mainWrites,0,'A short route must never call the legacy main-route RPC');
  assert(storage.has('kem-route-line-v1:ckis-assumption'));
  assert.equal(api.activeRouteLine().length,2);
  api.selectRoute('main');
  assert.equal(JSON.stringify(api.activeRouteLine()),JSON.stringify(mainLine.map(p=>[p.latitude,p.longitude])));
  api.selectRoute('ckis-assumption');
  assert.equal(api.activeRouteLine()[0][0],64.945);
  api.applySharedWorkspace({points:[],photos:[],waypoints:mainLine,routes:[{id:'main',title:'Общий',status:'published'},{id:'empty-route',title:'Пустой',status:'published'}]});
  assert.equal(api.activeRouteLine()[0][0],64.945,'Workspace refresh preserves the selected route geometry');
  api.selectRoute('empty-route'); api.updateProgress(); api.renderGuide();
  assert.equal(api.els.progressText.textContent,'0 из 0 точек');
  assert.equal(api.els.progressBar.style.width,'0%');
  assert(api.els.guideContent.innerHTML.includes('пока нет подготовленных точек'));
  api.selectRoute('ckis-assumption'); api.state.currentPointIndex = 0;
  api.renderGuide(); assert(api.els.guideStep.textContent.includes('из 9'));
  api.openPoint('station'); assert(!api.els.pointDialogContent.innerHTML.includes('data-complete-point='),'Out-of-route cards do not affect tour progress');
  api.openPoint('ckis-square'); assert(api.els.pointDialogContent.innerHTML.includes('data-complete-point='));
  failLineStorage = true; api.state.routeEditMode = true; api.state.routeDraft = [[64.947,34.61],[64.948,34.62]];
  await api.saveSharedRoute(); assert.equal(api.state.routeEditMode,true); assert.equal(api.state.routeDraft.length,2); assert.equal(mainWrites,0);
  failLineStorage = false; api.state.routeEditMode = false; api.selectRoute('main');
  let release; gate = new Promise(resolve=>{release=resolve;});
  api.state.routeEditMode = true; api.state.routeDraft = [[64.949,34.61],[64.950,34.62]];
  const pending = api.saveSharedRoute();
  assert.equal(api.state.routeSaving,true); assert.equal(api.els.routeSelect.disabled,true); assert.equal(api.selectRoute('ckis-assumption'),false);
  release(); await pending; assert.equal(mainWrites,1); assert.equal(api.state.routeSaving,false); assert.equal(api.state.routeEditMode,false);
  assert.equal(api.activeRouteLine()[0][0],64.949);

  // Every visible number comes from the selected route, even when stored orders have gaps.
  api.applySharedWorkspace({points:[
    {id:'station',route_order:508,title:'Вокзал — правка участника',short_title:'Вокзал — правка участника',chapter:'railway',status:'published',latitude:64.95,longitude:34.57,content:{researchRevision:'20260724-1',intro:'Сохранённый текст участника'}},
    {id:'shared-no-location',route_order:901,title:'Черновик без координат',chapter:'river',status:'draft',latitude:null,longitude:null,content:{}}
  ],photos:[],waypoints:mainLine,routes:[]});
  assert(api.selectedRoutePoints().some(p=>p.id==='shared-no-location'),'Unmapped shared records remain in the same route list');
  const yandexObjects=[],leafletMarkers=[];
  api.state.yandexReady=true;
  api.state.yandexMap={addChild(o){yandexObjects.push(o);},removeChild(){},update(){}};
  api.state.yandexClasses={
    YMapFeature:class {constructor(options){this.options=options;}},
    YMapMarker:class {constructor(options,host){this.options=options;this.host=host;}}
  };
  context.L=context.window.L={
    polyline(){return {addTo(){return this;}};},
    divIcon(options){return options;},
    marker(coordinates,options){const marker={coordinates,options,addTo(){leafletMarkers.push(this);return this;},bindPopup(){return this;},on(){return this;}};return marker;}
  };
  api.state.routeLayer={clearLayers(){leafletMarkers.length=0;}};
  function planRows(){return [...api.els.planGrid.innerHTML.matchAll(/data-route-point-id="([^"]+)"><span class="plan-item__number">(\d+)<\/span>/g)].map(m=>[m[1],Number(m[2])]);}
  function legendRows(){return [...api.els.pointsList.innerHTML.matchAll(/data-point-id="([^"]+)"[^>]*><span class="point-card__number">(\d+)<\/span>/g)].map(m=>[m[1],Number(m[2])]);}
  for(const routeId of ['main','ckis-assumption','annunciation-assumption']){
    api.selectRoute(routeId);
    const points=Array.from(api.selectedRoutePoints());
    const expected=points.map((p,i)=>[p.id,i+1]);
    assert.deepEqual(planRows(),expected,'Full tour order: '+routeId);
    assert.deepEqual(legendRows(),expected,'Legend order: '+routeId);
    assert(api.els.routePlanRouteName.textContent.includes(api.els.routeSelect.innerHTML.match(new RegExp('value="'+routeId+'">([^<]+)'))[1]));
    yandexObjects.length=0;api.renderYandexObjects();
    const expectedMapped=points.map((p,i)=>({p,n:i+1})).filter(({p})=>Array.isArray(p.coordinates));
    const yandexMarkers=yandexObjects.filter(o=>o.host);
    assert.deepEqual(yandexMarkers.map(o=>Number(o.host.innerHTML.match(/<i>(\d+)<\/i>/)[1])),expectedMapped.map(o=>o.n),'Yandex numbers: '+routeId);
    assert.deepEqual(yandexMarkers.map(o=>o.host.title),expectedMapped.map(({p,n})=>n+'. '+p.shortTitle));
    api.redrawLeafletRoute();
    assert.deepEqual(leafletMarkers.map(o=>Number(o.options.icon.html.match(/<i>(\d+)<\/i>/)[1])),expectedMapped.map(o=>o.n),'OSM numbers: '+routeId);
    api.state.planFilter='old-town';api.renderPlanFilters();api.renderPlan();
    assert.deepEqual(planRows(),expected.filter(([id])=>points.find(p=>p.id===id).chapter==='old-town'),'Filtering preserves route numbers');
  }
  api.selectRoute('main');
  assert.equal(api.state.planFilter,'all','Route selection resets a stale chapter filter');
  assert(api.els.planGrid.innerHTML.includes('Сохранённый текст участника'),'Plan displays the saved participant text');
  assert(api.els.planGrid.innerHTML.includes('Вокзал — правка участника'));
  assert(api.els.planGrid.innerHTML.includes('Ещё не отмечена на карте'));
  const definition=context.window.KEM_ROUTES.find(r=>r.id==='annunciation-assumption');
  definition.pointIds.push('annunciation');
  api.selectRoute(definition.id);assert.equal(api.selectedRoutePoints().length,13,'Duplicate IDs do not create duplicate stops');definition.pointIds.pop();
  api.state.sharedPhotos=[
    {id:'route-photo',pointId:'annunciation',pointNumber:999,title:'Собор',src:'image.jpg'},
    {id:'other-photo',pointId:'station',pointNumber:999,title:'Вокзал',src:'image.jpg'}
  ];
  api.renderPhotos();
  assert(api.els.photoStrip.innerHTML.includes('Точка 1'));
  assert(!api.els.photoStrip.innerHTML.includes('999'));
  assert(!api.els.photoStrip.innerHTML.includes('other-photo'));
  const collection = context.window.KEM_PHOTOS.filter(photo => photo.id.startsWith('collection-'));
  assert.equal(collection.length,53);
  assert.equal(new Set(collection.map(photo=>photo.id)).size,53);
  for (const photo of collection) {
    assert(fs.existsSync(path.join(root,photo.src)), 'Missing imported image: '+photo.src);
    assert(context.window.KEM_ROUTE.plannedPoints.some(point=>point.id===photo.pointId), 'Unmapped photo: '+photo.id);
    assert(photo.caption && photo.author && photo.source && photo.rightsStatus, 'Missing photo credit: '+photo.id);
  }
  assert(api.els.photoStrip.innerHTML.includes('Автор: Не указан в подборке'));
  assert(api.els.photoStrip.innerHTML.includes('Рисунок деревянного укрепления'));
  const shownIds=[...api.els.photoStrip.innerHTML.matchAll(/data-photo-id="([^"]+)"/g)].map(match=>match[1]);
  const shown=shownIds.map(id=>context.window.KEM_PHOTOS.find(photo=>photo.id===id)||api.state.sharedPhotos.find(photo=>photo.id===id));
  const routeIds=api.selectedRoutePoints().map(point=>point.id);
  assert(shown.every((photo,index)=>index===0||routeIds.indexOf(shown[index-1].pointId)<=routeIds.indexOf(photo.pointId)), 'Gallery follows route order');
  api.selectRoute('ckis-assumption'); api.renderPhotos();
  assert(!api.els.photoStrip.innerHTML.includes('collection-golodnukha-26'), 'Other-route photos stay hidden');
  api.state.yandexReady=false;api.state.yandexMap=null;api.state.routeLayer=null;context.L=context.window.L=undefined;

  const html=read('index.html'); const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size);
  for(const id of ['routeSelect','routeDescription','routeLineNote','routePointCount','routeEditorTitle','routeOverview','routeOverviewContent','routePlanRouteName'])assert(ids.includes(id));
  for(const name of ['app.js','community.js','routes.js','sw.js'])new vm.Script(read(name),{filename:name});
  const css=read('styles.css'); assert.equal([...css.matchAll(/\{/g)].length,[...css.matchAll(/\}/g)].length);
  assert(read('sw.js').includes('"./routes.js"'));
  console.log(JSON.stringify({syntax:'passed',builtInRoutes:3,mainPoints:46,shortRoutePoints:9,cathedralRoutePoints:13,routeOverview:'passed',allViewNumbering:'passed',bothMapProviders:'passed',unmappedSharedPoint:'passed',progressIsolation:'passed',lineIsolation:'passed',draftAndSaveGuards:'passed',emptyRoute:'passed',outOfRouteCards:'passed',quotaFailure:'passed'}));
})().catch(error=>{console.error(error);process.exitCode=1;});

