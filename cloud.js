/* Browser auth uses only the public key; privileged requests stay in /api. */
window.Cloud = (() => {
 let config,session=null,recovery=false,refreshing=null,busy=false;
 const sessionKey='raciocine_session_v1';
 const keys={stats:'quizia_stats_v2',streak:'quizia_streak_v1',history:'quizia_history_v1',badges:'quizia_badges_v1',leaderboard:'quizia_leaderboard_v2'};
 const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f;}catch{return f;}};
 const status=text=>{document.getElementById('account-status').textContent=text;};
 function remember(s){session=s?.access_token?{...s,expires_at:s.expires_at||Date.now()/1000+s.expires_in}:null;if(session)localStorage.setItem(sessionKey,JSON.stringify(session));else localStorage.removeItem(sessionKey);render();}
 async function auth(path,body,method='POST',token){
  const r=await fetch(config.url+'/auth/v1/'+path,{method,headers:{apikey:config.key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.msg||data.error_description||data.message||'Não foi possível autenticar.');return data;
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
  const data=await r.json();if(!r.ok)throw new Error(data.error||data.details||'Falha na conexão.');return data;
 }
 function render(){
  const logged=!!session;
  document.getElementById('account-login').hidden=logged;
  document.getElementById('account-profile').hidden=!logged;
  document.getElementById('btn-account').textContent=logged?'Minha conta':'Entrar';
  document.querySelectorAll('.dashboard-local,.dashboard-footer').forEach(el=>el.textContent=logged?'Progresso da conta · consulte o estado de sincronização em Minha conta':'Seu progresso é salvo neste dispositivo.');
 }
 function apply(data){
  for(const name of ['stats','history','streak','badges'])localStorage.setItem(keys[name]+'_'+session.user.id,JSON.stringify(data[name]));
  document.getElementById('public-name').value=data.profile?.public_name||'';
  document.getElementById('public-listed').checked=data.profile?.listed===true;
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
  if(!config?.enabled){status('Configure o Supabase conforme o guia do projeto.');return;}
  const email=document.getElementById('account-email').value.trim(),password=document.getElementById('account-password').value;
  try{
   status('Processando…');
   if(action==='logout'){
    if(G.onlineId&&document.getElementById('screen-quiz').classList.contains('active'))throw new Error('Conclua ou saia da partida antes de trocar de conta.');
    await sync();await auth('logout',undefined,'POST',await token());remember(null);goHome();G.xp=getStats().totalXP||0;G.level=computeLevel(G.xp);loadHomeStats();status('Você saiu da conta.');return;
   }
   if(action==='signup'){if(password.length<8)throw new Error('Use uma senha com pelo menos 8 caracteres.');const result=await auth('signup',{email,password});if(result.access_token){remember(result);await sync();}else status('Confira seu e-mail para confirmar o cadastro.');return;}
   if(action==='recover'){await auth('recover?redirect_to='+encodeURIComponent(location.origin+'/'),{email});status('Se o e-mail estiver cadastrado, você receberá o link de recuperação.');return;}
   if(action==='password'){if(password.length<8)throw new Error('Use uma senha com pelo menos 8 caracteres.');await auth('user',{password},'PUT',await token());recovery=false;status('Senha atualizada.');return;}
   if(action==='login'){remember(await auth('token?grant_type=password',{email,password}));await sync();return;}
   if(action==='profile'){await api('/api/account',{action:'profile',name:document.getElementById('public-name').value,listed:document.getElementById('public-listed').checked});status('Perfil atualizado.');return;}
   if(action==='import'){
    const data=Object.fromEntries(Object.entries(keys).map(([name,key])=>[name,read(key,name==='stats'||name==='streak'?{}:[])]));
    apply(await api('/api/account',{action:'import',data}));status('Histórico local importado. Os dados deste dispositivo foram preservados.');
   }
  }catch(e){status(e.message);}finally{document.getElementById('account-password').value='';document.getElementById('new-account-password').value='';}
 }
 async function init(){
  remember(read(sessionKey,null));
  G.xp=getStats().totalXP||0;G.level=computeLevel(G.xp);
  document.getElementById('btn-account').onclick=()=>document.getElementById('account-dialog').showModal();
  document.querySelectorAll('[data-account-action]').forEach(b=>b.onclick=()=>submit(b.dataset.accountAction));
  window.addEventListener('online',sync);
  try{
   config=await fetch('/api/config',{cache:'no-store'}).then(r=>r.json());
   if(config.rules)Object.assign(CONFIG,config.rules);
   if(!config.enabled){status('Contas ainda não configuradas. O modo local continua disponível.');return;}
   const hash=new URLSearchParams(location.hash.slice(1));
   if(hash.has('access_token')){
    const access=hash.get('access_token');const u=await auth('user',undefined,'GET',access);
    remember({access_token:access,refresh_token:hash.get('refresh_token'),expires_in:Number(hash.get('expires_in'))||3600,user:u});
    recovery=hash.get('type')==='recovery';history.replaceState(null,'',location.pathname);if(recovery){document.getElementById('account-dialog').showModal();status('Digite sua nova senha e clique em Atualizar senha.');}
   }else remember(read(sessionKey,null));
   await sync();
  }catch(e){status('Sem conexão com contas: '+e.message);}
 }
 async function start(topic,difficulty,mode){
  if(!session||!navigator.onLine)return null;
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
  try{const r=await fetch('/api/leaderboard?period='+period+'&page='+page,{cache:'no-store'});const data=await r.json();if(!r.ok)throw new Error(data.error);
   list.replaceChildren();if(!data.players.length){list.textContent='Nenhum jogador público neste período.';return;}
   for(const p of data.players){const row=document.createElement('div');row.className='lb-row';for(const text of [p.position+'º',p.public_name,p.score+' pts']){const span=document.createElement('span');span.textContent=text;row.append(span);}list.append(row);}
  }catch(e){list.textContent='Ranking online indisponível. '+e.message;}
 }
 return {init,sync,start,answer,complete,ranking,present:index=>api('/api/game',{action:'present',id:G.onlineId,index}),get userId(){return session?.user?.id;},get enabled(){return config?.enabled;}};
})();
window.addEventListener('DOMContentLoaded',()=>Cloud.init());
