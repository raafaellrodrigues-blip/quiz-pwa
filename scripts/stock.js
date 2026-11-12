const fs = require('node:fs');
const path = require('node:path');
const { topics } = require('../lib/catalog');
const DIFFICULTIES = ['facil', 'medio', 'dificil'];
function chooseNext(inventory, catalog, target, skipped = new Set()) {
 const cells = catalog.flatMap(topic => DIFFICULTIES.map(difficulty => ({
  topic:topic.label, difficulty, current:Number(inventory.find(t=>t.topic===topic.label)?.difficulties[difficulty])||0
 })));
 // Make every category playable before expanding categories already covered.
 return cells.filter(c=>c.current<target&&!skipped.has(c.topic+'|'+c.difficulty))
  .sort((a,b)=>Math.floor(a.current/10)-Math.floor(b.current/10)||Number(b.current%10>0)-Number(a.current%10>0)||a.current-b.current)[0];
}
function summary(inventory) {
 const counts=inventory.flatMap(t=>DIFFICULTIES.map(d=>Number(t.difficulties[d])||0));
 return {topics:inventory.length,combinations:counts.length,available:counts.reduce((a,b)=>a+b,0),playable:counts.filter(n=>n>=10).length,
  candidates:inventory.reduce((n,t)=>n+(Number(t.candidates)||0),0),target:inventory.length*300};
}
async function callOnce(body) {
 if(!process.env.APP_ORIGIN||!process.env.ADMIN_GENERATION_TOKEN)throw new Error('Configure APP_ORIGIN e ADMIN_GENERATION_TOKEN.');
 const r=await fetch(process.env.APP_ORIGIN.replace(/\/$/,'')+'/api/admin-questions',{
  method:'POST',headers:{Authorization:'Bearer '+process.env.ADMIN_GENERATION_TOKEN,'Content-Type':'application/json'},
  body:JSON.stringify(body),signal:AbortSignal.timeout(120000)
 });
 const data=await r.json().catch(()=>({error:'Resposta administrativa inválida.'}));
 if(!r.ok)throw Object.assign(new Error(data.error||'Falha administrativa.'),{status:r.status});return data;
}
async function call(body) {
 const attempts=body.action==='inventory'?3:1;
 for(let i=0;i<attempts;i++){
  try{return await callOnce(body);}catch(e){
   if(i===attempts-1||(e.status&&e.status<500))throw e;
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
 }
}
async function main(args=process.argv.slice(2)) {
 const mode=args[0]||'inventory';if(!['inventory','fill'].includes(mode))throw new Error('Use inventory ou fill.');
 const option=(key,fallback)=>{const raw=args.find(a=>a.startsWith('--'+key+'='));return raw?raw.slice(key.length+3):fallback;};
 const number=(key,fallback,max)=>{const value=Number(option(key,fallback));if(!Number.isInteger(value)||value<1||value>max)throw new Error('Parâmetro --'+key+' inválido.');return value;};
 const limit=number('batches',1,100),count=number('count',10,10),target=number('target',100,100),apply=args.includes('--apply');
 const pauseMs=Number(option('pause-ms',60000));if(!Number.isInteger(pauseMs)||pauseMs<0||pauseMs>60000)throw new Error('--pause-ms deve ficar entre 0 e 60000.');
 const reportPath=path.resolve(option('report','artifacts/stock-report.json'));
 const root=path.resolve('.');if(!reportPath.startsWith(root+path.sep))throw new Error('O relatório deve ficar dentro do projeto.');
 let snapshot=await call({action:'inventory'}),inventory=snapshot.inventory;
 const report={startedAt:new Date().toISOString(),apply,targetPerDifficulty:target,before:summary(inventory),budget:snapshot.budget,batches:[],inventory};
 const save=()=>{report.updatedAt=new Date().toISOString();report.after=summary(inventory);report.inventory=inventory;fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');};
 save();
 if(mode==='inventory'){console.log(JSON.stringify({summary:report.after,budget:report.budget,report:reportPath},null,2));return report;}
 const skipped=new Set();
 for(let n=0;n<limit;n++) {
  if(apply&&report.budget?.remaining===0){report.stopReason='Limite diário de lotes atingido. Retome no próximo dia do banco.';break;}
  const next=chooseNext(inventory,topics(),target,skipped);
  if(!next){report.stopReason='Meta desta etapa atingida ou todas as combinações tentadas.';break;}
  const body={topic:next.topic,difficulty:next.difficulty,count:Math.min(count,target-next.current,10-next.current%10),dryRun:!apply};
  if(apply&&n>0&&pauseMs)await new Promise(resolve=>setTimeout(resolve,pauseMs));
  console.log(JSON.stringify({batch:n+1,of:limit,...body}));
  try {
   const batch=await call(body);report.batches.push(batch);console.log(JSON.stringify(batch));
   if(apply){snapshot=await call({action:'inventory'});inventory=snapshot.inventory;report.budget=snapshot.budget;if(!batch.inserted)skipped.add(next.topic+'|'+next.difficulty);}
   else skipped.add(next.topic+'|'+next.difficulty);
   save();
  }catch(e){report.stopReason=e.message;report.errorStatus=e.status;console.error('Carga interrompida com segurança: '+e.message);break;}
 }
 // Re-read after a lost response: the report must describe confirmed DB state.
 try{snapshot=await call({action:'inventory'});inventory=snapshot.inventory;report.budget=snapshot.budget;}catch(e){report.inventoryWarning=e.message;}
 report.finishedAt=new Date().toISOString();save();
 console.log(JSON.stringify({summary:report.after,budget:report.budget,batches:report.batches.length,stopReason:report.stopReason||'Limite de lotes desta execução atingido.',report:reportPath},null,2));
 return report;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={chooseNext,summary,main};
