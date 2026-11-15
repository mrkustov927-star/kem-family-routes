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
    reset(){}, scrollIntoView(){}, showModal(){this.open = true;}, close(){this.open = false;}
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
for (const name of ['points.js','research-cards.js','visual-evidence.js','route-geometry.js','routes.js','photos.js','intervention-cards.js']) vm.runInContext(read(name), context);
// Re-loading the optional catalogue must retain sources and avoid duplicate cards.
vm.runInContext(read('intervention-cards.js'), context);
const boundary = source.indexOf('  window.openKemPoint = openPoint;');
assert(boundary > 0);
vm.runInContext(source.slice(0,boundary) + '\nwindow.testRoutes={state,els,selectRoute,selectedRoutePoints,selectedRouteGeometry,activeRouteLine,applySharedWorkspace,updateProgress,saveProgress,renderGuide,openPoint,saveSharedRoute,selectedRouteIssues,pointDisplayNumber,renderPlan,renderPlanFilters,renderPoints,renderYandexObjects,redrawLeafletRoute,renderPhotos,photoPointDetails,pointSeedRecords,pointRecordForEditor,pointCover,pointCoverMarkup,isPlaceholderCover,pointLabel,allPhotos,openSharedPointEditor};\n})();', context);
const api = context.window.testRoutes;
api.state.community.authenticated = true;
api.state.routeCoordinates = api.selectedRouteGeometry();
assert.equal(api.selectedRoutePoints().length,54);
api.updateProgress();
assert.equal(api.els.progressText.textContent,'1 из 54 точек');

assert.equal(context.window.KEM_ROUTES.length,3);
assert.equal(api.selectRoute('annunciation-assumption'),true);
assert.deepEqual(Array.from(api.selectedRoutePoints(),p=>p.id),[
  'annunciation','intervention-garrison','intervention-july-1918','krestovsky-prospect',
  'intervention-woods-regiment','intervention-kem-winter','intervention-karelian-assembly',
  'intervention-post-telegraph','intervention-railway-network','slon-office','pomor-house','revolution-square',
  'humpback-bridge','intervention-port-evacuation','kem-fortress','mill-street','malyshev-street',
  'sea-rapid-memorial','vitsupa-ostrog','pomorye-museum','assumption-cathedral'
]);
assert.equal(new Set(api.selectedRoutePoints().map(p=>p.id)).size,21);
assert.equal(api.activeRouteLine().length,0,'The third route does not borrow main geometry');
assert.equal(api.els.routeOverview.hidden,false);
assert(api.els.routeOverviewContent.innerHTML.includes('Троицкая часовня'));
assert(api.els.routeOverviewContent.innerHTML.includes('порядок тематических остановок'));
for (const topic of ['Лихачёв','Пономарёв','Зосимо-Савватиевский','судоверф','Ужма','жемчужниц','Подужем','телеграф','Державин','артел']) {
  assert(api.els.routeOverviewContent.innerHTML.toLowerCase().includes(topic.toLowerCase()), 'Missing route theme: '+topic);
}
const cathedralRoute=context.window.KEM_ROUTES.find(route=>route.id==='annunciation-assumption');
const interventionSections=cathedralRoute.overview.stops.flatMap(stop=>stop.sections||[]).filter(section=>section.id?.startsWith('intervention-'));
assert.equal(interventionSections.length,0,'Full cards replace duplicated topic blocks');
const interventionCards=context.window.KEM_INTERVENTION_CARDS;
assert.equal(interventionCards.length,8);
assert.equal(new Set(interventionCards.map(card=>card.id)).size,8);
const seeds=api.pointSeedRecords();
for(const card of interventionCards){
  const point=api.selectedRoutePoints().find(point=>point.id===card.id);
  assert(point && point.coordinates===null,'Leave placement to the route author: '+card.id);
  assert(card.guideText.split(/\s+/).length>=190 && card.facts.length>=3 && card.familyQuestion);
  assert(card.sources.length && card.sources.every(source=>new URL(source.url).protocol==='https:'));
  assert(card.visualEvidence.images.length && card.visualEvidence.images.every(image=>image.caption && image.credit));
  assert(fs.existsSync(path.join(root,card.image)),'Missing card photograph: '+card.id);
  api.openPoint(card.id);
  assert(api.els.pointDialogContent.innerHTML.includes(card.guideText.split('\n')[0]));
  assert(api.els.pointDialogContent.innerHTML.includes(card.visualEvidence.images[0].caption));
  assert(api.els.pointDialogContent.innerHTML.includes(card.sources[0].url));
  const seed=seeds.find(seed=>seed.id===card.id);
  assert.equal(seed.latitude,null);assert.equal(seed.longitude,null);
  assert.equal(seed.content.guideText,card.guideText);
  assert.equal(seed.content.visualEvidence.images[0].url,card.visualEvidence.images[0].url);
  const editor=api.pointRecordForEditor(card.id);
  assert.equal(editor.content.guideText,card.guideText);
  assert.equal(editor.content.image,card.image);
  assert.equal(editor.content.visualEvidence.images[0].url,card.visualEvidence.images[0].url);
}
assert(api.els.planGrid.innerHTML.includes('Фото и документы'),'Evidence is reachable from the route plan');
for (const id of ['krestovsky-prospect','kem-fortress','mill-street','malyshev-street']) {
  const p=api.selectedRoutePoints().find(p=>p.id===id);assert(p);assert.equal(p.coordinates,null);
}
api.openPoint('slon-office');assert(api.els.pointDialogContent.innerHTML.includes('Лихачёв'));
api.openPoint('intervention-kem-winter');assert(api.els.pointDialogContent.innerHTML.includes('Филиппа Вудса'));
api.openPoint('intervention-july-1918');assert(api.els.pointDialogContent.innerHTML.includes('24 июля 1918'));
api.openPoint('slon-office');
api.renderGuide();assert(api.els.guideContent.innerHTML.includes('Лихачёв'));
api.selectRoute('main');api.openPoint('slon-office');
assert(!api.els.pointDialogContent.innerHTML.includes('Темы этого маршрута'),'Route supplements do not alter the general card');
api.selectRoute('annunciation-assumption');
assert.equal((api.els.routeOverviewContent.innerHTML.match(/data-point-id=/g)||[]).length,21);
api.state.completed.add('annunciation');api.saveProgress();
assert.equal(api.els.progressText.textContent,'1 из 21 точек');
api.renderGuide();assert(api.els.guideStep.textContent.includes('из 21'));
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
    {id:'station',route_order:508,title:'Вокзал — правка участника',short_title:'',chapter:'railway',status:'published',latitude:64.95,longitude:34.57,content:{researchRevision:'20260724-1',intro:'Сохранённый текст участника'}},
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
  api.selectRoute(definition.id);assert.equal(api.selectedRoutePoints().length,21,'Duplicate IDs do not create duplicate stops');definition.pointIds.pop();
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
  for(const name of ['app.js','community.js','routes.js','intervention-cards.js','sw.js'])new vm.Script(read(name),{filename:name});
  const css=read('styles.css'); assert.equal([...css.matchAll(/\{/g)].length,[...css.matchAll(/\}/g)].length);
  assert(read('sw.js').includes('"./routes.js"'));
  assert(read('sw.js').includes('"./intervention-cards.js"'));
  // Later placement and participant edits keep their text, cover and evidence.
  const savedCard=JSON.parse(JSON.stringify(seeds.find(seed=>seed.id==='intervention-woods-regiment')));
  savedCard.latitude=64.955;savedCard.longitude=34.604;
  savedCard.content.guideText='Дополненный участником рассказ о Вудсе';
  savedCard.content.coverImage='https://example.com/participant-cover.jpg';
  api.applySharedWorkspace({points:[savedCard],photos:[],waypoints:[],routes:[]});
  api.selectRoute('annunciation-assumption');
  const placed=api.selectedRoutePoints().find(point=>point.id===savedCard.id);
  assert.deepEqual(Array.from(placed.coordinates),[64.955,34.604]);
  assert.equal(placed.guideText,savedCard.content.guideText);
  assert.equal(placed.image,savedCard.content.coverImage);
  const placedEditor=api.pointRecordForEditor(savedCard.id);
  assert.equal(placedEditor.content.guideText,savedCard.content.guideText);
  assert.equal(placedEditor.content.coverImage,savedCard.content.coverImage);
  assert.equal(placedEditor.content.visualEvidence.images[0].url,savedCard.content.visualEvidence.images[0].url);
  assert.equal(api.pointCover(placed).src,savedCard.content.coverImage,'Participant-selected covers remain authoritative');

  // The editor displays the current route number and does not replace the saved catalogue order.
  const renamed=JSON.parse(JSON.stringify(seeds.find(seed=>seed.id==='krestovsky-prospect')));
  renamed.route_order=2;renamed.title='Крестовский проспект — новое название';renamed.short_title='';
  api.applySharedWorkspace({points:[renamed,savedCard],photos:[
    {id:'legacy-krestovsky',point_id:'annunciation',title:'Крестовский проспект',publicUrl:'https://example.com/krestovsky.jpg',caption:'Исторический снимок проспекта',author:'Неизвестен',status:'draft'}
  ],waypoints:[],routes:[]});
  api.selectRoute('annunciation-assumption');
  const street=api.selectedRoutePoints().find(point=>point.id===renamed.id);
  assert.equal(api.pointLabel(street),renamed.title,'Clearing a short title uses the newly saved full title');
  assert(api.els.pointsList.innerHTML.includes(renamed.title));
  assert(api.els.planGrid.innerHTML.includes(renamed.title));
  assert(api.els.routeOverviewContent.innerHTML.includes(renamed.title));
  api.openSharedPointEditor(renamed.id);
  assert.equal(node('#sharedPointRouteNumber').value,4);
  assert.equal(node('#sharedPointOrder').value,2,'Displayed route number never overwrites catalogue order');
  assert(/id="sharedPointRouteNumber" readonly/.test(html));
  assert(/id="sharedPointOrder" name="routeOrder" type="hidden"/.test(html));
  const legacy=api.allPhotos().find(photo=>photo.id==='legacy-krestovsky');
  assert.equal(legacy.pointId,'krestovsky-prospect');
  assert.equal(api.pointCover(street).photoId,legacy.id,'An exact street view wins over a contextual photograph');
  api.openPoint(street.id);
  assert(api.els.pointDialogContent.innerHTML.includes('class="point-cover-image" src="'+legacy.src+'"'));
  assert(api.els.pointDialogContent.innerHTML.includes('Автор: Неизвестен'));
  api.renderGuide();
  assert(api.els.guideContent.innerHTML.includes('class="point-cover-image" src="'+legacy.src+'"'));

  // Audit every catalogue card: use its own gallery material, and never render the logo as a cover.
  api.selectRoute('main');
  const audit=Array.from(api.selectedRoutePoints().filter(point=>seeds.some(seed=>seed.id===point.id)),point=>{
    const cover=api.pointCover(point);
    const direct=api.allPhotos().filter(photo=>photo.pointId===point.id && photo.autoCover!==false);
    if(direct.length && !point.coverImage){
      assert(direct.some(photo=>photo.src===cover?.src),'Cover belongs to the point: '+point.id);
    }
    api.openPoint(point.id);
    const rendered=api.els.pointDialogContent.innerHTML.match(/class="point-cover-image" src="([^"]+)"/);
    if(rendered)assert(!api.isPlaceholderCover(rendered[1]),'No placeholder logo: '+point.id);
    else assert(api.els.pointDialogContent.innerHTML.includes('Фотография этой точки пока не добавлена.'));
    return {id:point.id,cover:Boolean(cover)};
  });
  const cathedral=api.selectedRoutePoints().find(point=>point.id==='assumption-cathedral');
  assert.notEqual(api.pointCover(cathedral).photoId,'collection-assumption-cathedral-41','A nearby house cannot become the cathedral cover');
  for(const [id,photoId] of [['revolution-square','collection-revolution-square-57'],['humpback-bridge','collection-humpback-bridge-21'],['pomorye-museum','collection-pomorye-museum-51']]){
    assert.equal(api.pointCover(api.selectedRoutePoints().find(point=>point.id===id)).photoId,photoId);
  }
  console.log(JSON.stringify({coverAudit:{checked:audit.length,withImage:audit.filter(point=>point.cover).length,withoutImage:audit.filter(point=>!point.cover).map(point=>point.id)},editorRouteNumber:'passed',clearedShortTitle:'passed',legacyStreetPhoto:'passed',coverCredits:'passed'}));
  console.log(JSON.stringify({syntax:'passed',builtInRoutes:3,mainPoints:54,shortRoutePoints:9,cathedralRoutePoints:21,interventionCards:8,unmappedCardContentAndSeeds:'passed',routeOverview:'passed',allViewNumbering:'passed',bothMapProviders:'passed',unmappedSharedPoint:'passed',progressIsolation:'passed',lineIsolation:'passed',draftAndSaveGuards:'passed',emptyRoute:'passed',outOfRouteCards:'passed',quotaFailure:'passed'}));
})().catch(error=>{console.error(error);process.exitCode=1;});

