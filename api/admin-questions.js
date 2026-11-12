const {timingSafeEqual}=require('node:crypto');
const {guard,fail,db}=require('../lib/backend');
const {topics}=require('../lib/catalog');
module.exports=async(req,res)=>{
 if(!guard(req,res,['POST']))return;
 const actual=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+(process.env.ADMIN_GENERATION_TOKEN||''));
 if(!process.env.ADMIN_GENERATION_TOKEN||actual.length!==expected.length||!timingSafeEqual(actual,expected))return res.status(401).json({error:'Acesso restrito'});
 try{
  const b=req.body||{};
  if(b.action==='inventory') {
   const rows=await db('/rest/v1/rpc/question_inventory', {method:'POST',body:{}});
   const day=new Date().toISOString().slice(0,10);
   const budgetRows=await db('/rest/v1/generation_budget?day=eq.'+day+'&select=used');
   const limit=Math.max(1,Math.min(100,Number(process.env.GENERATION_DAILY_BATCHES)||10)),used=Number(budgetRows[0]?.used)||0;
   return res.json({inventory:topics().map(t=>({topic:t.label,target:300,difficulties:Object.fromEntries(['facil','medio','dificil'].map(d=>[d,rows.filter(q=>q.topic===t.label&&q.difficulty===d&&['validated','reviewed'].includes(q.status)).reduce((n,q)=>n+Number(q.quantity),0)])),candidates:rows.filter(q=>q.topic===t.label&&q.status==='candidate').reduce((n,q)=>n+Number(q.quantity),0)})),budget:{day,limit,used,remaining:Math.max(0,limit-used)},note:'Contagens reais do banco. Questões validadas automaticamente ainda precisam de revisão pedagógica.'});
  }
  const report=await require('../lib/stock').replenish(b.topic,b.difficulty,Number(b.count)||5,require('./quiz').generateWithFallback,{dryRun:b.dryRun!==false});
  return res.json(report);
 }catch(e){fail(res,e);}
};
