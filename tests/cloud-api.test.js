const {test}=require('node:test');const assert=require('node:assert/strict');
const {normalize,prepare}=require('../lib/questions');
const {cleanImport}=require('../lib/progress');
const {topics}=require('../lib/catalog');
const {guard,user}=require('../lib/backend');
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.code=s;return this;},json(b){this.body=b;return this;}});
test('canonical catalog has 42 unique real topics and excludes random',()=>{const catalog=topics();assert.equal(catalog.length,42);assert.equal(new Set(catalog.map(t=>t.label)).size,42);assert.ok(!catalog.some(t=>t.label==='Aleatório'));assert.ok(catalog.some(t=>t.label==='Tecnologia da Informação'));});
test('normalization and signature ignore trivial punctuation, accents and reordered distractors',()=>{
 const q={question:'Qual é a ação correta?',options:['Uma ação','Outro ato','Terceiro ato','Quarto ato'],correct:0,explanation:'Porque sim.'};
 const a=prepare(q,'Português','medio'),b=prepare({...q,question:'QUAL E A ACAO CORRETA!',options:[q.options[1],q.options[0],q.options[3],q.options[2]],correct:1},'Português','medio');
 assert.equal(a.canonical_hash,b.canonical_hash);assert.equal(a.signature,b.signature);assert.equal(normalize('ÁÇÃO...'),'acao');
 assert.throws(()=>prepare({...q,options:['A','B','C','D']},'Português','medio'));
});
test('import sanitizes private legacy data without trusting public scores',()=>{
 const data=cleanImport({stats:{totalGames:-1,totalAnswered:10,totalCorrect:999,totalXP:'100'},history:[{tema:'Matemática',correct:8}],badges:['perfecto','<script>'],streak:{streak:4,lastDate:'Thu Nov 12 2026'},leaderboard:[{score:999}]});
 assert.equal(data.stats.totalGames,0);assert.equal(data.stats.totalCorrect,10);assert.equal(data.stats.totalXP,100);assert.deepEqual(data.badges,['perfecto']);assert.equal(data.streak.lastDate,'2026-11-12');assert.equal(data.history[0].pct,80);
});
test('API denies foreign origins and unsupported methods and disables caching',()=>{
 const r=response();assert.equal(guard({headers:{origin:'https://unrelated.example'},method:'POST'},r,['POST']),false);assert.equal(r.code,403);assert.equal(r.headers['Cache-Control'],'no-store');
 const method=response();assert.equal(guard({headers:{},method:'DELETE'},method,['POST']),false);assert.equal(method.code,405);
});
test('authentication refuses missing bearer before any database call',async()=>{await assert.rejects(user({headers:{}}),e=>e.status===401);});
test('admin generation refuses missing secret and cannot accidentally run AI',async()=>{const r=response();await require('../api/admin-questions')({headers:{},method:'POST',body:{dryRun:false}},r);assert.equal(r.code,401);});
test('config never serializes server secrets',async()=>{
 const previous=process.env.SUPABASE_SERVICE_ROLE_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='never_expose_this';
 try{const r=response();await require('../api/config')({headers:{},method:'GET'},r);assert.ok(!JSON.stringify(r.body).includes('never_expose_this'));}finally{if(previous===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous;}
});
