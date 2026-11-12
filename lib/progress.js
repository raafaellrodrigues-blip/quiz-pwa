const integer=(v,max=10000000)=>Math.max(0,Math.min(max,Math.trunc(Number(v)||0)));
function cleanImport(data){
 const stats=Object.fromEntries(['totalGames','totalCorrect','totalAnswered','totalXP','bestScore'].map(k=>[k,integer(data.stats?.[k])]));
 stats.totalCorrect=Math.min(stats.totalCorrect,stats.totalAnswered);
 const history=(Array.isArray(data.history)?data.history:[]).slice(0,50).map(e=>({
  date:String(e.date||'').slice(0,40),tema:String(e.tema||'Aleatório').slice(0,100),mode:['estudo','rapido','desafio'].includes(e.mode)?e.mode:'estudo',
  correct:integer(e.correct,10),total:10,score:integer(e.score,475),pct:integer(e.correct,10)*10
 }));
 const badges=(Array.isArray(data.badges)?data.badges:[]).filter(b=>typeof b==='string'&&/^[a-z0-9_]{1,40}$/.test(b)).slice(0,50);
 const date=new Date(data.streak?.lastDate||'invalid');
 const streak={streak:integer(data.streak?.streak,36500),lastDate:Number.isFinite(date.getTime())?date.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}):null};
 return {stats,history,badges,streak,leaderboard:(Array.isArray(data.leaderboard)?data.leaderboard:[]).slice(0,20)};
}
module.exports={cleanImport};
