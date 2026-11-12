const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
test('service worker bypasses private APIs, external auth and non-GET requests',()=>{
 const listeners={};const context={self:{location:{origin:'https://quiz.example'},addEventListener:(name,fn)=>listeners[name]=fn},URL,console};
 vm.runInNewContext(fs.readFileSync('sw.js','utf8'),context);
 for(const request of [{url:'https://quiz.example/api/account',method:'GET'},{url:'https://quiz.example/api/game',method:'POST'},{url:'https://project.supabase.co/auth/v1/user',method:'GET'}]){
  let intercepted=false;listeners.fetch({request,respondWith(){intercepted=true;}});assert.equal(intercepted,false);
 }
});
test('browser session restores account scope and retains offline events until server confirmation',async()=>{
 const map=new Map([['raciocine_session_v1',JSON.stringify({access_token:'public-user-jwt',refresh_token:'refresh',expires_at:Date.now()/1000+3600,user:{id:'user-A'}})],['quizia_stats_v2',JSON.stringify({totalXP:999})]]);
 const storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),key:i=>[...map.keys()][i],get length(){return map.size;}};
 const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{value:'',hidden:false,textContent:'',classList:{contains:()=>false}});return elements.get(id);};
 let offline=false,writes=0;
 const data={stats:{totalXP:40,totalGames:1},history:[],streak:{streak:1},badges:[],profile:{public_name:'Jogador',listed:false},imported:false};
 const context={window:{addEventListener(){}},document:{getElementById:el,querySelectorAll:()=>[]},localStorage:storage,console,G:{correct:5,score:75,localId:'id-1',mode:'estudo',topic:'Matemática'},CONFIG:{},computeLevel:()=>0,loadHomeStats(){},navigator:{onLine:true},location:{hash:'',origin:'https://quiz.example'},URLSearchParams,
 fetch:async(path,init)=>{
  if(path==='/api/config')return {json:async()=>({enabled:true,url:'https://auth.example',key:'anon'})};
  assert.equal(init.headers.Authorization,'Bearer public-user-jwt');
  if(init.method==='POST'){if(offline)throw new Error('offline');writes++;}
  return {ok:true,json:async()=>data};
 }};
 context.getStats=()=>JSON.parse(storage.getItem('quizia_stats_v2_'+(context.window.Cloud?.userId||''))||'{}');
 vm.createContext(context);vm.runInContext(fs.readFileSync('cloud.js','utf8'),context);context.Cloud=context.window.Cloud;
 await context.Cloud.init();assert.equal(context.Cloud.userId,'user-A');assert.equal(context.G.xp,40);assert.equal(JSON.parse(storage.getItem('quizia_stats_v2')).totalXP,999);
 offline=true;context.Cloud.complete();await new Promise(setImmediate);
 assert.ok(storage.getItem('raciocine_event_user-A_id-1'));assert.match(el('account-status').textContent,/pendente/);
 offline=false;await context.Cloud.sync();assert.equal(storage.getItem('raciocine_event_user-A_id-1'),null);assert.equal(writes,1);
 await context.Cloud.sync();assert.equal(writes,1);assert.match(el('account-status').textContent,/Sincronizado/);
});
