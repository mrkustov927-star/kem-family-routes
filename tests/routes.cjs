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
  document: { querySelector: node, querySelectorAll: () => [] }, URL, console, Map, Set,
};
vm.createContext(context);
for (const name of ['points.js','research-cards.js','visual-evidence.js','route-geometry.js','routes.js']) vm.runInContext(read(name), context);
const boundary = source.indexOf('  window.openKemPoint = openPoint;');
assert(boundary > 0);
vm.runInContext(source.slice(0,boundary) + '\nwindow.testRoutes={state,els,selectRoute,selectedRoutePoints,selectedRouteGeometry,activeRouteLine,applySharedWorkspace,updateProgress,saveProgress,renderGuide,openPoint,saveSharedRoute,selectedRouteIssues,pointDisplayNumber};\n})();', context);
const api = context.window.testRoutes;
api.state.community.authenticated = true;
api.state.routeCoordinates = api.selectedRouteGeometry();
assert.equal(api.selectedRoutePoints().length,42);
api.updateProgress();
assert.equal(api.els.progressText.textContent,'1 из 42 точек');

assert.equal(context.window.KEM_ROUTES.length,3);
assert.equal(api.selectRoute('annunciation-assumption'),true);
assert.deepEqual(Array.from(api.selectedRoutePoints(),p=>p.id),[
  'annunciation','slon-office','revolution-square','pomor-house',
  'kem-river-bridge','vitsupa-ostrog','pomorye-museum','assumption-cathedral'
]);
assert.equal(new Set(api.selectedRoutePoints().map(p=>p.id)).size,8);
assert.equal(api.activeRouteLine().length,0,'The third route does not borrow main geometry');
assert.equal(api.els.routeOverview.hidden,false);
assert(api.els.routeOverviewContent.innerHTML.includes('Троицкая часовня'));
assert(api.els.routeOverviewContent.innerHTML.includes('Порядок остановок предварительный'));
assert.equal((api.els.routeOverviewContent.innerHTML.match(/data-point-id=/g)||[]).length,9);
api.state.completed.add('annunciation');api.saveProgress();
assert.equal(api.els.progressText.textContent,'1 из 8 точек');
api.renderGuide();assert(api.els.guideStep.textContent.includes('из 8'));
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
  const html=read('index.html'); const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size);
  for(const id of ['routeSelect','routeDescription','routeLineNote','routePointCount','routeEditorTitle','routeOverview','routeOverviewContent'])assert(ids.includes(id));
  for(const name of ['app.js','community.js','routes.js','sw.js'])new vm.Script(read(name),{filename:name});
  const css=read('styles.css'); assert.equal([...css.matchAll(/\{/g)].length,[...css.matchAll(/\}/g)].length);
  assert(read('sw.js').includes('"./routes.js"'));
  console.log(JSON.stringify({syntax:'passed',builtInRoutes:3,mainPoints:42,shortRoutePoints:9,cathedralRoutePoints:8,routeOverview:'passed',progressIsolation:'passed',lineIsolation:'passed',draftAndSaveGuards:'passed',emptyRoute:'passed',outOfRouteCards:'passed',quotaFailure:'passed'}));
})().catch(error=>{console.error(error);process.exitCode=1;});

