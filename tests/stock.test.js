const {test}=require('node:test');const assert=require('node:assert/strict');
const {chooseNext,summary}=require('../scripts/stock');
const catalog=[{label:'A'},{label:'B'}];
const inventory=[{topic:'A',difficulties:{facil:10,medio:0,dificil:0},candidates:2},{topic:'B',difficulties:{facil:0,medio:0,dificil:0},candidates:0}];
test('stock prioritizes empty difficulties before growing a playable category',()=>{const next=chooseNext(inventory,catalog,100);assert.equal(next.topic,'A');assert.equal(next.difficulty,'medio');assert.equal(next.current,0);});
test('stock skips unproductive categories and stops when stage target is met',()=>{const next=chooseNext(inventory,catalog,10,new Set(['A|medio','A|dificil']));assert.equal(next.topic,'B');const full=inventory.map(t=>({...t,difficulties:{facil:10,medio:10,dificil:10}}));assert.equal(chooseNext(full,catalog,10),undefined);});
test('stock summary reports actual coverage and separates candidates from available questions',()=>{assert.deepEqual(summary(inventory),{topics:2,combinations:6,available:10,playable:1,candidates:2,target:600});});
