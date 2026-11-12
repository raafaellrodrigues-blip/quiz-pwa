function configured() { return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY); }
async function db(route, {method='GET',body,token,publicKey=false,prefer}={}) {
  const key = publicKey ? process.env.SUPABASE_ANON_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !key) throw Object.assign(new Error('Supabase ainda não configurado.'),{status:503});
  const response = await fetch(process.env.SUPABASE_URL.replace(/\/$/,'') + route, {
    method, headers:{apikey:key, Authorization:'Bearer '+(token||key),'Content-Type':'application/json', ...(prefer?{Prefer:prefer}:{})},
    body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(15000)
  });
  const raw=await response.text(); let data; try { data=raw?JSON.parse(raw):null; } catch { data=null; }
  if (!response.ok) { console.warn('Supabase error',response.status,data?.code); throw Object.assign(new Error(response.status===401?'Sessão expirada. Entre novamente.':data?.code==='23505'?'Nome público já utilizado.': 'Não foi possível concluir a operação no banco.'),{status:response.status===401?401:400}); }
  return data;
}
async function user(req) {
  const token = /^Bearer (.+)$/.exec(req.headers?.authorization||'')?.[1];
  if (!token) throw Object.assign(new Error('Entre na sua conta para continuar.'),{status:401});
  return db('/auth/v1/user',{token,publicKey:true});
}
function guard(req,res,methods) {
  res.setHeader('Cache-Control','no-store');
  const origin=req.headers?.origin;
  if(origin && origin !== process.env.APP_ORIGIN && origin !== 'https://'+process.env.VERCEL_URL && !(process.env.NODE_ENV!=='production' && /^http:\/\/localhost:\d+$/.test(origin))) {
    res.status(403).json({error:'Origem não permitida'}); return false;
  }
  if(!methods.includes(req.method)) {res.setHeader('Allow',methods.join(', '));res.status(405).json({error:'Método não permitido'});return false;}
  return true;
}
function fail(res,e) {console.warn(e.message);return res.status(e.status||500).json({error:e.status?e.message:'Serviço indisponível. Tente novamente.'});}
module.exports={db,user,guard,fail,configured};
