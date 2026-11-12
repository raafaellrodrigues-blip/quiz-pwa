const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const files=['app.js','cloud.js','sw.js','question-validation.js',...['api','lib','scripts'].flatMap(dir=>fs.readdirSync(dir).filter(f=>f.endsWith('.js')).map(f=>dir+'/'+f))];
for(const file of files){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0){console.error(r.stderr);process.exit(1);}}
for(const file of ['vercel.json','manifest.json'])JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
console.log(`Sintaxe validada: ${files.length} arquivos JavaScript e configurações JSON. PWA estática: sem compilação adicional.`);
