const {test}=require('node:test');const assert=require('node:assert/strict');
const {chooseNext,summary}=require('../scripts/stock');
const catalog=[{label:'A'},{label:'B'}];
const inventory=[{topic:'A',difficulties:{facil:10,medio:0,dificil:0},candidates:2},{topic:'B',difficulties:{facil:0,medio:0,dificil:0},candidates:0}];
test('stock prioritizes empty difficulties before growing a playable category',()=>{const next=chooseNext(inventory,catalog,100);assert.equal(next.topic,'A');assert.equal(next.difficulty,'medio');assert.equal(next.current,0);});
test('stock skips unproductive categories and stops when stage target is met',()=>{const next=chooseNext(inventory,catalog,10,new Set(['A|medio','A|dificil']));assert.equal(next.topic,'B');const full=inventory.map(t=>({...t,difficulties:{facil:10,medio:10,dificil:10}}));assert.equal(chooseNext(full,catalog,10),undefined);});
test('stock summary reports actual coverage and separates candidates from available questions',()=>{assert.deepEqual(summary(inventory),{topics:2,combinations:6,available:10,playable:1,candidates:2,target:600});});
test('stock finishes a partial group before opening another empty group',()=>{const rows=[{topic:'A',difficulties:{facil:10,medio:10,dificil:6}},{topic:'B',difficulties:{facil:0,medio:0,dificil:0}}];assert.equal(chooseNext(rows,catalog,100).difficulty,'dificil');assert.equal(chooseNext(rows,catalog,100).current,6);});

test('generation counts only persisted candidates and keeps duplicates separate',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');let insert=0,finished=false,reservations=0;
 const db=async(route,opts={})=>{
  if(route.includes('reserve_generation')){reservations++;return true;}
  if(route==='/rest/v1/generation_runs')return [{id:'lease'}];
  if(route.startsWith('/rest/v1/generation_runs?id=')){finished=true;return null;}
  if(route.startsWith('/rest/v1/questions?on_conflict='))return ++insert===1?[{status:'candidate'}]:[];
  return [];
 };
 const context={module:{exports:{}},process:{env:{}},require:name=>name==='./backend'?{db}:name==='./catalog'?{topics:()=>[{label:'Tema'}]}:{prepare:()=>({normalized:'texto',status:'validated'})}};
 vm.runInNewContext(fs.readFileSync('lib/stock.js','utf8'),context);
 const report=await context.module.exports.replenish('Tema','facil',1,async()=>({questions:[{}]}));
 assert.equal(report.candidates,1);assert.equal(report.duplicates,1);assert.equal(report.inserted,0);assert.equal(reservations,1);assert.equal(finished,true);
});
