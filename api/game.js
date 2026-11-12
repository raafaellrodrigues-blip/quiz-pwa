const {db,user,guard,fail}=require('../lib/backend');
const {topics}=require('../lib/catalog');
module.exports=async(req,res)=>{if(!guard(req,res,['POST']))return;try{
 const u=await user(req), b=req.body||{};
 if(b.action==='resume') {
  const rows=await db('/rest/v1/game_sessions?user_id=eq.'+u.id+'&verified=eq.true&completed_at=is.null&started_at=gte.'+encodeURIComponent(new Date(Date.now()-86400000).toISOString())+'&order=started_at.desc&limit=1');
  const g=rows[0];if(!g)return res.json({available:false});
  let combo=0;for(let i=g.answers.length-1;i>=0&&g.answers[i].answer===g.answers[i].correct;i--)combo++;
  const questions=g.questions.map(q=>({id:q.id,question:q.question,options:q.options,category:q.topic,difficulty:({facil:'Fácil',medio:'Médio',dificil:'Difícil'})[q.difficulty]}));
  return res.json({available:true,id:g.id,topic:g.topic,mode:g.mode,index:g.answers.length,score:g.score,correct:g.correct,maxCombo:g.max_combo,combo,questions});
 }
 if(b.action==='start') {
  if(!['estudo','rapido','desafio'].includes(b.mode)||!['facil','medio','dificil','misto'].includes(b.difficulty)|| !(b.topic==='Aleatório'||topics().some(t=>t.label===b.topic)))throw Object.assign(new Error('Configuração inválida.'),{status:400});
  return res.json(await db('/rest/v1/rpc/start_game',{method:'POST',body:{p_user:u.id,p_topic:b.topic,p_difficulty:b.difficulty,p_mode:b.mode}}));
 }
 if(b.action==='present' && /^[0-9a-f-]{36}$/i.test(b.id||'') && Number.isInteger(b.index)&&b.index>=0&&b.index<10){
   const rows=await db('/rest/v1/game_sessions?id=eq.'+b.id+'&user_id=eq.'+u.id+'&verified=eq.true&select=answers');
   if(rows[0]&&b.index<rows[0].answers.length)return res.json({ok:true,alreadyAnswered:true});
   await db('/rest/v1/rpc/present_game',{method:'POST',body:{p_user:u.id,p_game:b.id,p_index:b.index}});return res.json({ok:true});
 }
 if(b.action==='answer' && /^[0-9a-f-]{36}$/i.test(b.id||'') && Number.isInteger(b.index)&&b.index>=0&&b.index<10&&Number.isInteger(b.answer)&&b.answer>=-1&&b.answer<=3)
  return res.json(await db('/rest/v1/rpc/answer_game',{method:'POST',body:{p_user:u.id,p_game:b.id,p_index:b.index,p_answer:b.answer}}));
 throw Object.assign(new Error('Requisição inválida.'),{status:400});
}catch(e){fail(res,e);}};
