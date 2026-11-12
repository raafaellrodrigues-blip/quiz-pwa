// Usage: node --env-file=.env scripts/stock.js inventory|fill [--apply] [--batches=1]
const {topics}=require('../lib/catalog');
const args=process.argv.slice(2),mode=args[0]||'inventory';
const limit=Math.min(100,Math.max(1,Number(args.find(a=>a.startsWith('--batches='))?.split('=')[1])||1));
async function call(body){
 if(!process.env.APP_ORIGIN||!process.env.ADMIN_GENERATION_TOKEN)throw new Error('Configure APP_ORIGIN e ADMIN_GENERATION_TOKEN.');
 const r=await fetch(process.env.APP_ORIGIN+'/api/admin-questions',{method:'POST',headers:{Authorization:'Bearer '+process.env.ADMIN_GENERATION_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
 const data=await r.json();if(!r.ok)throw new Error(data.error);return data;
}
(async()=>{
 if(!['inventory','fill'].includes(mode))throw new Error('Use inventory ou fill.');
 const inventory=await call({action:'inventory'});
 if(mode==='inventory'){console.log(JSON.stringify(inventory,null,2));return;}
 let batches=0;
 for(const topic of topics())for(const difficulty of ['facil','medio','dificil']){
  const current=inventory.inventory.find(t=>t.topic===topic.label)?.difficulties[difficulty]||0;
  if(current>=100)continue;
  console.log(JSON.stringify(await call({topic:topic.label,difficulty,count:Math.min(5,100-current),dryRun:!args.includes('--apply')})));
  if(++batches>=limit)return;
 }
 console.log('Nenhum lote necessário: todas as faixas atingiram 100 questões validadas.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
