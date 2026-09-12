import {mkdir,copyFile,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const files=['converter.html','converter.js','converter.css','core.js','sampler.js','project.js','editing.js','transcribe-worker.js','index.html','styles.css','app.js','data.js','results.html','favicon.svg','LICENSE','.nojekyll'];
for(const f of files.filter(f=>f.endsWith('.js'))){
 const result=spawnSync(process.execPath,['--check',f],{stdio:'inherit'});
 if(result.status!==0)process.exit(result.status||1);
}
await mkdir('dist',{recursive:true});
for(const f of files)await copyFile(f,'dist/'+f);
console.log('Static site ready in dist/. No server or account required.');
