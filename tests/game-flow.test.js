const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function gameContext(){
 const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{style:{},textContent:'',className:'',classList:{add(){},remove(){}},onclick:null});return elements.get(id);};
 const timers=[];const context={window:{addEventListener(){}},document:{getElementById:element,querySelectorAll:()=>[],querySelector:()=>({style:{}})},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},clearInterval(){},requestAnimationFrame(){},console};
 vm.createContext(context);vm.runInContext(fs.readFileSync('app.js','utf8'),context);return {context,timers,element};
}
test('double Next and auto/manual overlap advance only one question',()=>{
 const {context,timers}=gameContext();vm.runInContext("G.onlineId='game';G.idx=5;G.answered=true;var renders=0;renderQuestion=()=>{renders++;G.transitioning=false;};nextQuestion();nextQuestion();nextQuestion();",context);
 assert.equal(vm.runInContext('G.idx',context),6);assert.equal(timers.length,1);timers[0]();assert.equal(vm.runInContext('renders',context),1);
});
test('answer retry preserves the original selection until the server confirms',async()=>{
 const {context,element}=gameContext();const choices=[];let attempts=0;
 context.Cloud={present:async()=>{},answer:async(index,answer)=>{choices.push(answer);if(++attempts===1)throw new Error('Conexão interrompida');return {correct:2,answer:2,explanation:'Resposta confirmada'};}};
 vm.runInContext("G.onlineId='game';G.idx=0;G.mode='rapido';G.questions=[{question:'Questão',options:['um','dois','três','quatro'],correct:-2,difficulty:'Fácil'}];showExplanation=()=>{};showPtsFlash=()=>{};",context);
 await vm.runInContext('selectAnswer(2)',context);assert.equal(vm.runInContext('G.answered',context),false);assert.equal(typeof element('btn-next').onclick,'function');
 await vm.runInContext('selectAnswer(0)',context);assert.deepEqual(choices,[2,2]);assert.equal(vm.runInContext('G.correct',context),1);assert.equal(vm.runInContext('G.pendingAnswer',context),null);
});
async function api(body,rows){
 const calls=[];const backend={guard:()=>true,user:async()=>({id:'owner'}),db:async(route)=>{calls.push(route);return rows;},fail:(res,e)=>{throw e;}};
 const context={require:name=>name==='../lib/backend'?backend:{topics:()=>[]},module:{exports:{}},Date};vm.runInNewContext(fs.readFileSync('api/game.js','utf8'),context);
 const response={json(data){this.body=data;return this;}};await context.module.exports({body,method:'POST'},response);return {body:response.body,calls};
}
test('presentation retry after committed answer does not reject or write twice',async()=>{
 const {body,calls}=await api({action:'present',id:'11111111-1111-4111-8111-111111111111',index:7},[{answers:Array(8).fill({answer:0,correct:0})}]);
 assert.equal(body.alreadyAnswered,true);assert.equal(calls.length,1);assert.ok(calls[0].includes('user_id=eq.owner'));
});
test('resume uses confirmed server position and never returns unanswered solutions',async()=>{
 const g={id:'game',topic:'Matemática',mode:'estudo',answers:Array(6).fill({answer:0,correct:0}),score:135,correct:6,max_combo:6,questions:Array(10).fill({id:'q',question:'Questão',options:['1','2','3','4'],topic:'Matemática',difficulty:'facil',correct:0,explanation:'Privada'})};
 const {body,calls}=await api({action:'resume',index:8},[g]);assert.equal(body.index,6);assert.equal(body.score,135);assert.equal(body.questions[0].correct,undefined);assert.equal(body.questions[0].explanation,undefined);assert.ok(calls[0].includes('user_id=eq.owner'));
});
