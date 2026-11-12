const {db,user,guard,fail}=require('../lib/backend');
const {topics}=require('../lib/catalog');
module.exports=async(req,res)=>{if(!guard(req,res,['POST']))return;try{
 const u=await user(req), b=req.body||{};
 if(b.action==='start') {
  if(!['estudo','rapido','desafio'].includes(b.mode)||!['facil','medio','dificil','misto'].includes(b.difficulty)|| !(b.topic==='Aleatório'||topics().some(t=>t.label===b.topic)))throw Object.assign(new Error('Configuração inválida.'),{status:400});
  return res.json(await db('/rest/v1/rpc/start_game',{method:'POST',body:{p_user:u.id,p_topic:b.topic,p_difficulty:b.difficulty,p_mode:b.mode}}));
 }
 if(b.action==='present' && /^[0-9a-f-]{36}$/i.test(b.id||'') && Number.isInteger(b.index)&&b.index>=0&&b.index<10){
   await db('/rest/v1/rpc/present_game',{method:'POST',body:{p_user:u.id,p_game:b.id,p_index:b.index}});return res.json({ok:true});
 }
 if(b.action==='answer' && /^[0-9a-f-]{36}$/i.test(b.id||'') && Number.isInteger(b.index)&&b.index>=0&&b.index<10&&Number.isInteger(b.answer)&&b.answer>=-1&&b.answer<=3)
  return res.json(await db('/rest/v1/rpc/answer_game',{method:'POST',body:{p_user:u.id,p_game:b.id,p_index:b.index,p_answer:b.answer}}));
 throw Object.assign(new Error('Requisição inválida.'),{status:400});
}catch(e){fail(res,e);}};
