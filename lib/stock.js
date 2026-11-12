const {db}=require('./backend');
const {topics}=require('./catalog');
const {prepare}=require('./questions');
async function stock(topic,difficulty,count) {
 const allowed=topic==='Aleatório'?topics().map(t=>t.label):[topic];
 const rows=await db('/rest/v1/rpc/practice_questions',{method:'POST',body:{p_topics:allowed,p_difficulty:difficulty,p_count:count}});
 return rows.sort(()=>Math.random()-.5).slice(0,count).map(q=>({...q,category:q.topic,difficulty:({facil:'Fácil',medio:'Médio',dificil:'Difícil'})[q.difficulty]}));
}
async function replenish(topic,difficulty,count,generate,{dryRun=false}={}) {
 if(!topics().some(t=>t.label===topic)||!['facil','medio','dificil'].includes(difficulty))throw new Error('Tema ou dificuldade inválida');
 count=Math.max(1,Math.min(10,count));
 const report={topic,difficulty,requested:count,inserted:0,duplicates:0,invalid:0,candidates:0,dryRun};
 let existing=await db('/rest/v1/questions?topic=eq.'+encodeURIComponent(topic)+'&difficulty=eq.'+difficulty+'&status=in.(validated,reviewed)&select=id');
 report.available=existing.length;
 if(dryRun||existing.length>=100)return report;
 // Unique partial index provides cross-instance lease. A crashed lease expires after 10 minutes.
 await db('/rest/v1/generation_runs?finished_at=is.null&started_at=lt.'+encodeURIComponent(new Date(Date.now()-600000).toISOString()),{method:'PATCH',body:{finished_at:new Date().toISOString(),report:{expired:true}}});
 const lease=await db('/rest/v1/generation_runs',{method:'POST',body:{topic,difficulty},prefer:'return=representation'});
 try {
  existing=await db('/rest/v1/questions?topic=eq.'+encodeURIComponent(topic)+'&difficulty=eq.'+difficulty+'&status=in.(validated,reviewed)&select=id');
  const permitted=await db('/rest/v1/rpc/reserve_generation',{method:'POST',body:{p_limit:Math.max(1,Math.min(100,Number(process.env.GENERATION_DAILY_BATCHES)||10))}});
  if(!permitted)throw Object.assign(new Error('Limite diário de lotes atingido. Retome no próximo dia do banco.'),{status:429});
  const wanted=Math.min(count,100-existing.length);
  for(let attempt=0;attempt<2&&report.inserted<wanted;attempt++) {
   const context=await db('/rest/v1/questions?topic=eq.'+encodeURIComponent(topic)+'&select=normalized&order=created_at.desc&limit=40');
   let generated;
   try{generated=await generate(difficulty,topic,wanted-report.inserted,context.map(q=>q.normalized));}
   catch(e){if(!report.inserted)throw e;report.generationWarning=e.message;break;}
   for(const q of generated.questions){
    let row;try{row=prepare(q,topic,difficulty);}catch{report.invalid++;continue;}
    // DB trigger is the identity authority; exact check is by normalized stem.
    const candidates=await db('/rest/v1/questions?topic=eq.'+encodeURIComponent(topic)+'&select=id,normalized&limit=5000');
    const terms=new Set(row.normalized.split(' '));
    const close=candidates.some(c=>{const other=new Set(c.normalized.split(' '));const union=new Set([...terms,...other]);return [...terms].filter(x=>other.has(x)).length/union.size>0.8;});
    if(close)row.status='candidate';
    const inserted=await db('/rest/v1/questions?on_conflict=canonical_hash',{method:'POST',body:row,prefer:'resolution=ignore-duplicates,return=representation'});
    if(inserted.length){if(inserted[0].status==='candidate')report.candidates++;else report.inserted++;}else report.duplicates++;
   }
  }
  report.insufficient=report.inserted<wanted;
  return report;
 }catch(e){report.error=e.message;throw e;}finally{await db('/rest/v1/generation_runs?id=eq.'+lease[0].id,{method:'PATCH',body:{finished_at:new Date().toISOString(),report}});}
}
module.exports={stock,replenish};
