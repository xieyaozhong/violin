import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
const port=Number(process.env.PORT)||8173;
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'converter.html';
  const filename=path.resolve(root,relative);
  const allowed=new Set(['converter.html','converter.js','converter.css','core.js','sampler.js','project.js','editing.js','transcribe-worker.js','index.html','styles.css','app.js','data.js','results.html','favicon.svg']);
  if(!filename.startsWith(root+path.sep)||!allowed.has(relative))throw Error('Not found');
  const body=await readFile(filename);
  res.writeHead(200,{'content-type':types[path.extname(filename)]||'application/octet-stream','cache-control':'no-cache'});res.end(body);
 }catch{res.writeHead(404);res.end('Not found')}
}).listen(port,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:'+port+'/converter.html'));
