const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.resolve(__dirname,'../community.js'),'utf8');
let routesFail=false;
const calls=[],rpcCalls=[];
function query(table){
  const call={table,filters:[]};calls.push(call);
  const builder={select(value){call.select=value;return this;},order(value){call.order=value;return this;},eq(...args){call.filters.push(['eq',...args]);return this;},neq(...args){call.filters.push(['neq',...args]);return this;},maybeSingle(){return this;},then(resolve,reject){
    const data=table==='profiles'?{id:'participant-test',display_name:'Тест',role:'participant'}:table==='routes'?[{id:'main',title:'Общий',status:'published'},{id:'another',title:'Другой',status:'published'}]:table==='route_waypoints'?[{route_id:'main',position:1,latitude:64,longitude:34},{route_id:'another',position:1,latitude:65,longitude:35}]:[];
    return Promise.resolve({data,error:table==='routes'&&routesFail?{message:'No route titles'}:null}).then(resolve,reject);
  }};return builder;
}
const client={from:query,auth:{onAuthStateChange(){},async getSession(){return {data:{session:{user:{id:'participant-test'}}},error:null};}},async rpc(name,args){rpcCalls.push({name,args});return {error:null};}};
const context={window:{KEM_SUPABASE_CONFIG:{url:'https://example.invalid',publishableKey:'test-key'},supabase:{createClient:()=>client},setTimeout(){}},console:{warn(){},error(){}}};
vm.createContext(context);vm.runInContext(source,context);
(async()=>{
  const api=context.window.KemCommunity;await api.init();const workspace=await api.fetchWorkspace();
  assert.equal(workspace.routes.length,2);assert.equal(workspace.waypoints.length,2);
  assert.equal(calls.find(call=>call.table==='route_waypoints').filters.length,0,'Fetch geometry for all routes, without hardcoding main');
  assert(calls.some(call=>call.table==='routes'));
  routesFail=true;const fallback=await api.fetchWorkspace();assert.equal(fallback.routes.length,0);assert.equal(fallback.waypoints.length,2,'Optional route metadata failure does not hide map data');
  await api.saveRouteWaypoints([{lat:64,lng:34}]);assert.equal(rpcCalls.length,1);assert.equal(rpcCalls[0].name,'replace_main_route_waypoints');assert(rpcCalls[0].args.p_waypoints);
  console.log(JSON.stringify({workspaceRoutes:'passed',allRouteGeometry:'passed',optionalMetadataFallback:'passed',existingSaveRpc:'preserved'}));
})().catch(error=>{console.error(error);process.exitCode=1;});

