/* Browser auth uses only the public key; privileged requests stay in /api. */
window.Cloud = (() => {
 let config,session=null,recovery=false,refreshing=null,busy=false,verified=false,submitting=false;
 const sessionKey='raciocine_session_v1';
 const keys={stats:'quizia_stats_v2',streak:'quizia_streak_v1',history:'quizia_history_v1',badges:'quizia_badges_v1',leaderboard:'quizia_leaderboard_v2'};
 const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f;}catch{return f;}};
 const status=text=>{document.getElementById('account-status').textContent=text;const el=document.getElementById('auth-status');if(el)el.textContent=text;};
 function friendly(message){
  if(/invalid login credentials/i.test(message))return 'E-mail ou senha incorretos. Confira seus dados e tente novamente.';
  if(/email not confirmed/i.test(message))return 'Confirme seu e-mail antes de entrar.';
  if(/different from the old password/i.test(message))return 'Escolha uma senha diferente da senha atual.';
  if(/rate limit|too many|after \d+ seconds/i.test(message))return 'Muitas tentativas. Aguarde um minuto antes de tentar novamente.';
  return message;
 }
 function remember(s){session=s?.access_token?{...s,expires_at:s.expires_at||Date.now()/1000+s.expires_in}:null;if(session)localStorage.setItem(sessionKey,JSON.stringify(session));else localStorage.removeItem(sessionKey);render();}
 async function auth(path,body,method='POST',token){
  const r=await fetch(config.url+'/auth/v1/'+path,{method,headers:{apikey:config.key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(friendly(data.msg||data.error_description||data.message||'Não foi possível autenticar.')),{status:r.status});return data;
 }
 async function token(){
  if(!session)throw new Error('Entre na sua conta.');
  if(session.expires_at<Date.now()/1000+60){
   if(!refreshing)refreshing=auth('token?grant_type=refresh_token',{refresh_token:session.refresh_token}).then(remember).finally(()=>refreshing=null);
   await refreshing;
  }
  return session.access_token;
 }
 async function api(path,body){
  const access=await token();const r=await fetch(path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const data=await r.json();if(!r.ok){if(r.status===401){verified=false;remember(null);showScreen('auth');}throw new Error(data.error||data.details||'Falha na conexão.');}return data;
 }
 function render(){
  const logged=!!session&&verified;
  document.body?.classList.toggle('auth-locked',!logged);
  document.getElementById('screen-auth').hidden=logged;
  document.getElementById('account-login').hidden=logged;
  document.getElementById('account-profile').hidden=!logged;
  document.getElementById('btn-account').textContent=logged?'Minha conta':'Entrar';
  document.querySelectorAll('.dashboard-local,.dashboard-footer').forEach(el=>el.textContent=logged?'Progresso da conta · consulte o estado de sincronização em Minha conta':'Seu progresso é salvo neste dispositivo.');
 }
 function apply(data){
  for(const name of ['stats','history','streak','badges'])localStorage.setItem(keys[name]+'_'+session.user.id,JSON.stringify(data[name]));
  document.getElementById('public-name').value=data.profile?.public_name||'';
  document.getElementById('import-local').hidden=data.imported||!read(keys.stats,{}).totalGames;
  G.xp=data.stats.totalXP||0;G.level=computeLevel(G.xp);loadHomeStats();
 }
 function pendingEvents(owner){
  const prefix='raciocine_event_'+owner+'_',events=[];
  for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key.startsWith(prefix)){const event=read(key,null);if(event)events.push({key,event});}}
  return events;
 }
 async function sync(){
  if(!session||busy)return;busy=true;const owner=session.user.id;
  try{
   for(const {key,event} of pendingEvents(owner)){if(event.kind==='practice')await api('/api/account',{action:'practice',event});localStorage.removeItem(key);}
   const data=await api('/api/account');if(session?.user.id!==owner)return;
   if(document.getElementById('screen-quiz').classList.contains('active')){status('Dados remotos serão atualizados ao concluir a partida.');return;}
   apply(data);status('Sincronizado com o servidor.');
  }catch(e){status('Sincronização pendente: '+e.message);}finally{busy=false;}
 }
 async function submit(action){
  if(submitting)return;
  if(!config?.enabled){status('Configure o Supabase conforme o guia do projeto.');return;}
  const emailInput=document.getElementById('account-email');
  const email=emailInput.value.trim(),password=document.getElementById(action==='password'?'new-account-password':'account-password').value;
  if(['login','signup','recover'].includes(action)&&!emailInput.checkValidity()){emailInput.reportValidity();return;}
  submitting=true;
  document.querySelectorAll('[data-account-action],.auth-submit').forEach(b=>b.disabled=true);
  try{
   status('Processando…');
   if(action==='logout'){
    if(G.onlineId&&document.getElementById('screen-quiz').classList.contains('active'))throw new Error('Conclua ou saia da partida antes de trocar de conta.');
    await sync();try{await auth('logout',undefined,'POST',await token());}catch{}verified=false;remember(null);document.getElementById('account-dialog').close();goHome();status('Você saiu da conta. Entre para continuar.');return;
   }
   if(action==='signup'){if(password.length<8)throw new Error('Use uma senha com pelo menos 8 caracteres.');const result=await auth('signup',{email,password});if(result.access_token){verified=true;remember(result);await sync();goHome();}else status('Confira seu e-mail para confirmar o cadastro. Depois entre com sua senha.');return;}
   if(action==='recover'){await auth('recover?redirect_to='+encodeURIComponent(location.origin+'/'),{email});status('Se o e-mail estiver cadastrado, você receberá o link de recuperação.');return;}
   if(action==='password'){if(password.length<8)throw new Error('Use uma senha com pelo menos 8 caracteres.');await auth('user',{password},'PUT',await token());recovery=false;status('Senha atualizada. Você já pode continuar estudando.');document.getElementById('account-dialog').close();goHome();return;}
   if(action==='login'){const result=await auth('token?grant_type=password',{email,password});verified=true;remember(result);await sync();goHome();return;}
   if(action==='profile'){await api('/api/account',{action:'profile',name:document.getElementById('public-name').value});status('Perfil atualizado. Sua participação no ranking é automática.');return;}
   if(action==='import'){
    const data=Object.fromEntries(Object.entries(keys).map(([name,key])=>[name,read(key,name==='stats'||name==='streak'?{}:[])]));
    apply(await api('/api/account',{action:'import',data}));status('Histórico local importado. Os dados deste dispositivo foram preservados.');
   }
  }catch(e){status(e.message);}finally{submitting=false;document.querySelectorAll('[data-account-action],.auth-submit').forEach(b=>b.disabled=false);}
 }
 async function init(){
  remember(read(sessionKey,null));
  showScreen('auth');
  G.xp=getStats().totalXP||0;G.level=computeLevel(G.xp);
  document.getElementById('btn-account').onclick=()=>document.getElementById('account-dialog').showModal();
  document.querySelectorAll('[data-account-action]').forEach(b=>b.onclick=()=>submit(b.dataset.accountAction));
  document.getElementById('auth-form').onsubmit=e=>{e.preventDefault();submit('login');};
  document.getElementById('account-dialog').addEventListener('cancel',e=>{if(recovery)e.preventDefault();});
  window.addEventListener('online',sync);
  try{
   config=await fetch('/api/config',{cache:'no-store'}).then(r=>r.json());
   if(config.rules)Object.assign(CONFIG,config.rules);
   if(!config.enabled){status('Login indisponível. A configuração do servidor precisa ser concluída.');return;}
   const hash=new URLSearchParams(location.hash.slice(1));
   if(hash.has('access_token')){
    const access=hash.get('access_token');const u=await auth('user',undefined,'GET',access);
    verified=true;remember({access_token:access,refresh_token:hash.get('refresh_token'),expires_in:Number(hash.get('expires_in'))||3600,user:u});
    recovery=hash.get('type')==='recovery';history.replaceState(null,'',location.pathname);if(recovery){document.getElementById('account-dialog').showModal();status('Digite sua nova senha e clique em Atualizar senha.');}
   }else if(hash.has('error')){status('Este link expirou ou já foi utilizado. Solicite um novo e-mail de recuperação.');history.replaceState(null,'',location.pathname);return;}
   else if(session){const u=await auth('user',undefined,'GET',await token());session.user=u;verified=true;remember(session);}
   if(!session){status('Entre com seu e-mail e senha para continuar.');return;}
   await sync();
   goHome();
  }catch(e){verified=false;remember(null);showScreen('auth');status('Não foi possível entrar: '+e.message);}
 }
 async function start(topic,difficulty,mode){
  if(!session||!verified)throw new Error('Entre na sua conta para estudar.');
  if(!navigator.onLine)return null;
  const result=await api('/api/game',{action:'start',topic,difficulty,mode});
  if(!result.available){status(result.reason);return null;}return result;
 }
 async function answer(index,chosen){return api('/api/game',{action:'answer',id:G.onlineId,index,answer:chosen});}
 function complete(){
  if(!session)return;
  const event={id:G.onlineId||G.localId,kind:G.onlineId?'verified':'practice',correct:G.correct,score:G.score,mode:G.mode,tema:G.topic,date:new Date().toISOString()};
  localStorage.setItem('raciocine_event_'+session.user.id+'_'+event.id,JSON.stringify(event));status('Partida salva neste dispositivo. Sincronização pendente.');sync();
 }
 async function ranking(period='all',page=0){
  const list=document.getElementById('lb-list');list.textContent='Carregando ranking online…';
  try{const data=await api('/api/leaderboard?period='+period+'&page='+page);
   list.replaceChildren();if(!data.players.length){list.textContent='Nenhum jogador público neste período.';return;}
   for(const p of data.players){const row=document.createElement('div');row.className='lb-row';for(const text of [p.position+'º',p.public_name,p.score+' pts']){const span=document.createElement('span');span.textContent=text;row.append(span);}list.append(row);}
  }catch(e){list.textContent='Ranking online indisponível. '+e.message;}
 }
 return {init,sync,start,answer,complete,ranking,questions:(diff,topic,count)=>api('/api/quiz?difficulty='+encodeURIComponent(diff)+'&topic='+encodeURIComponent(topic)+'&count='+count),present:index=>api('/api/game',{action:'present',id:G.onlineId,index}),get authenticated(){return !!session&&verified;},get userId(){return session?.user?.id;},get enabled(){return config?.enabled;}};
})();
window.addEventListener('DOMContentLoaded',()=>Cloud.init());
