// Local-only interactive design review. No production proxy or provider access.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const respond=require('./workspace-preview-data.cjs');
const root=path.resolve('artifacts/helpdesk/dist/public');
const base='/ai-receptionist/dashboard';
const types={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.html':'text/html'};
http.createServer(async(req,res)=>{
 try {
  const u=new URL(req.url,'http://127.0.0.1:8784');
  if(u.pathname.startsWith('/api/')){
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>100000)throw Error('Too large');}
   const {body,status}=respond(u,req.method,raw?JSON.parse(raw):{});
   res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));return;
  }
  const rel=decodeURIComponent(u.pathname.startsWith(base)?u.pathname.slice(base.length):u.pathname);
  const file=path.resolve(root,'.'+rel);
  if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);res.end();return;}
  if(fs.existsSync(file)&&fs.statSync(file).isFile()){res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);return;}
  let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  html=html.replace('</body>',`<div style="position:fixed;bottom:0;left:0;z-index:9999;padding:5px 12px;background:#edf8f4;color:#345c54;font:11px system-ui;border-top:1px solid #cce5dd">Design preview · fictional sample data · local only</div></body>`);
  res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(html);
 }catch(e){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Preview request failed'}));}
}).listen(8784,'127.0.0.1',()=>console.log('Design preview: http://127.0.0.1:8784'+base+'/'));
