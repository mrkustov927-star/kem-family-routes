const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const clone=value=>JSON.parse(JSON.stringify(value));
const database=new Map([['street',{id:'street',title:'Улица',updated_at:'v1',content:{guideText:'Рассказ',visualEvidence:{images:[{url:'photo.jpg'}]},routeRanks:{main:'9/1',short:'3/2'}}}]]);
let conflict=false,revision=1;
function query(table){
  const filters=[];let changes=null,inserting=false;
  return {
    select(){return this;},eq(key,value){filters.push([key,value]);return this;},
    update(value){changes=value;return this;},insert(value){changes=value;inserting=true;return this;},
    maybeSingle(){return this;},single(){return this;},
    then(resolve,reject){
      if(table==='profiles')return Promise.resolve({data:{id:'participant',role:'participant'},error:null}).then(resolve,reject);
      const id=inserting?changes.id:filters.find(([key])=>key==='id')[1];
      const row=database.get(id);
      if(changes){
        if(conflict)return Promise.resolve({data:null,error:null}).then(resolve,reject);
        if(row && filters.some(([key,value])=>key==='updated_at'&&value!==row.updated_at))return Promise.resolve({data:null,error:null}).then(resolve,reject);
        database.set(id,{...clone(row||{}),...clone(changes),updated_at:'v'+(++revision)});
      }
      return Promise.resolve({data:clone(database.get(id)||null),error:null}).then(resolve,reject);
    }
  };
}
const client={from:query,auth:{onAuthStateChange(){},async getSession(){return {data:{session:{user:{id:'participant'}}},error:null};}}};
const context={window:{KEM_SUPABASE_CONFIG:{url:'https://example.invalid',publishableKey:'test'},supabase:{createClient:()=>client},setTimeout(){}},console};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../community.js'),'utf8'),context);
(async()=>{
  const api=context.window.KemCommunity;await api.init();
  const stale={id:'street',title:'Новое название',content:{guideText:'Новый рассказ',routeRanks:{main:'1/1'},visualEvidence:{images:[]}}};
  await api.savePoint(stale,{routeId:'cathedral',rank:'3/2'});
  assert.deepEqual(database.get('street').content.routeRanks,{main:'9/1',short:'3/2',cathedral:'3/2'});
  assert.equal(database.get('street').content.guideText,'Новый рассказ');
  assert.equal(database.get('street').content.visualEvidence.images[0].url,'photo.jpg');
  await api.savePoint(stale);
  assert.equal(database.get('street').content.routeRanks.cathedral,'3/2','A stale text/cover edit cannot undo a later route move');
  await api.savePoint({id:'new-point',content:{guideText:'Новый материал'}},{routeId:'cathedral',rank:'1/2'});
  assert.equal(database.get('new-point').content.routeRanks.cathedral,'1/2');
  for(const rank of ['bad','1/0','1/-2'])await assert.rejects(api.savePoint(stale,{routeId:'cathedral',rank}),/новый номер/);
  conflict=true;
  await assert.rejects(api.savePoint(stale,{routeId:'cathedral',rank:'1/3'}),/изменилась/);
  assert.equal(database.get('street').content.routeRanks.cathedral,'3/2');
  console.log(JSON.stringify({sharedRouteRankSave:'passed',otherRouteRanksPreserved:'passed',staleTextEdit:'passed',visualEvidencePreserved:'passed',newPointOrder:'passed',invalidRank:'passed',concurrentSaveFailure:'passed'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
