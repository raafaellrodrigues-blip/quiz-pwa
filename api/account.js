const {db,user,guard,fail}=require('../lib/backend');
module.exports=async(req,res)=>{
 if(!guard(req,res,['GET','POST']))return;
 try {
  const u=await user(req); const b=req.body||{};
  if(req.method==='GET') return res.json(await db('/rest/v1/rpc/progress_snapshot',{method:'POST',body:{p_user:u.id}}));
  if(b.action==='profile') {
   if(typeof b.name!=='string'|| !/^[\p{L}\p{N}_ .-]{3,30}$/u.test(b.name.trim()))throw Object.assign(new Error('Use um nome de 3 a 30 caracteres.'),{status:400});
   await db('/rest/v1/profiles?user_id=eq.'+u.id,{method:'PATCH',body:{public_name:b.name.trim(),listed:b.listed===true}});
  } else if(b.action==='import') {
   const data=b.data;if(!data || JSON.stringify(data).length>150000)throw Object.assign(new Error('Importação inválida.'),{status:400});
   await db('/rest/v1/rpc/import_local',{method:'POST',body:{p_user:u.id,p_data:require('../lib/progress').cleanImport(data)}});
  } else if(b.action==='practice') {
   const e=b.event;
   if(!e || !/^[0-9a-f-]{36}$/i.test(e.id)|| !Number.isInteger(e.correct)||e.correct<0||e.correct>10||!Number.isFinite(Date.parse(e.date)))throw Object.assign(new Error('Partida inválida.'),{status:400});
   await db('/rest/v1/rpc/save_practice',{method:'POST',body:{p_user:u.id,p_id:e.id,p_topic:String(e.tema||'Aleatório').slice(0,100),p_mode:['estudo','rapido','desafio'].includes(e.mode)?e.mode:'estudo',p_correct:e.correct,p_score:Math.max(0,Math.min(475,Number(e.score)||0)),p_date:e.date}});
  } else throw Object.assign(new Error('Ação inválida.'),{status:400});
  return res.json(await db('/rest/v1/rpc/progress_snapshot',{method:'POST',body:{p_user:u.id}}));
 }catch(e){return fail(res,e);}
};
