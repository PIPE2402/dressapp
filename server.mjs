import http from 'node:http';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile, mkdir, readdir, stat, copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createReadStream} from 'node:fs';
const root=path.dirname(fileURLToPath(import.meta.url));
const ytDlp=process.env.YTDLP_PATH||(process.platform==='win32'?path.join(root,'bin','yt-dlp.exe'):'yt-dlp');
const ffmpeg=process.env.FFMPEG_PATH||path.join(root,'node_modules','ffmpeg-static',process.platform==='win32'?'ffmpeg.exe':'ffmpeg');
const publicOrigin=process.env.PUBLIC_ORIGIN||process.env.RENDER_EXTERNAL_URL;
let mediaReady;
async function prepareMedia(){
 if(process.env.FFMPEG_PATH)return;
 mediaReady??=(async()=>{const {default:probe}=await import('ffprobe-static');await copyFile(probe.path,path.join(path.dirname(ffmpeg),process.platform==='win32'?'ffprobe.exe':'ffprobe'));})();
 await mediaReady;
}
export function formatArgs(format,quality){
 if(format==='mp3')return ['-f','ba/b','--extract-audio','--audio-format','mp3','--audio-quality','192K'];
 const selection=quality==='720'?'bv*[height<=?720]+ba/b[height<=?720]/bv*[width<=720][height<=1280]+ba/b[width<=720][height<=1280]':'bv*+ba/b';
 return ['-f',selection,'--merge-output-format','mp4','--recode-video','mp4','--postprocessor-args','VideoConvertor:-c:v libx264 -c:a aac -movflags +faststart'];
}
export function canonicalVideoURL(value){
 const u=new URL(value);
 let id;
 if(u.hostname==='youtu.be')id=u.pathname.split('/')[1];
 else if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(u.hostname))id=u.pathname==='/watch'?u.searchParams.get('v'):/^\/(?:shorts|embed|live)\/([^/]+)/.exec(u.pathname)?.[1];
 return /^[\w-]{11}$/.test(id||'')?`https://www.youtube.com/watch?v=${id}`:u.href;
}
export async function inspectVideo(url,{fetchMetadata=fetch}={}){
 const canonical=canonicalVideoURL(url);
 if(/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(canonical)){
 try{
 const endpoint=new URL('https://www.youtube.com/oembed');endpoint.searchParams.set('url',canonical);endpoint.searchParams.set('format','json');
 const response=await fetchMetadata(endpoint,{signal:AbortSignal.timeout(5000),redirect:'error'});
 if(response.ok){
 const meta=await response.json();
 if(meta.type==='video'&&meta.provider_name==='YouTube'&&typeof meta.title==='string'&&meta.title.trim())return {title:meta.title,duration:0,platform:'YouTube',source:'oembed'};
 }
 }catch{}
 }
 let info;
 await run(['--js-runtimes','node','--skip-download','--dump-single-json','--',url],line=>{if(line.startsWith('{'))info=JSON.parse(line);});
 if(!info?.title||info.is_live||!info.formats?.some(f=>f.url&&(f.vcodec!=='none'||f.acodec!=='none')))throw Error('No se encontró un video disponible para descargar.');
 return {title:info.title,duration:Number(info.duration)||0,platform:info.extractor_key||info.extractor||'Video'};
}
export function createRecognizer(inspect,{now=Date.now,ttlMs=300000,maxEntries=100}={}){
 const cache=new Map(),pending=new Map();
 return async value=>{
 const url=canonicalVideoURL(value),cached=cache.get(url);
 if(cached&&cached.expires>now())return cached.info;
 if(pending.has(url))return pending.get(url);
 if(pending.size>=2)throw Object.assign(Error('Hay dos enlaces en revisión. Espera un momento e intenta de nuevo.'),{status:429});
 const task=Promise.resolve().then(()=>inspect(url)).then(info=>{
 for(const [key,entry] of cache)if(entry.expires<=now())cache.delete(key);
 if(cache.size>=maxEntries)cache.delete(cache.keys().next().value);
 cache.set(url,{info,expires:now()+ttlMs});return info;
 }).finally(()=>pending.delete(url));
 pending.set(url,task);return task;
 };
}
const hosts=['youtube.com','youtu.be','tiktok.com','instagram.com','facebook.com','fb.watch'];
export function validateURL(value){
 let u;try{u=new URL(value);}catch{throw Error('Pega un enlace válido.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||!hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))throw Error('Usa un enlace HTTPS de TikTok, Instagram, Facebook o YouTube.');
 return canonicalVideoURL(u.href);
}
export function downloadError(message){
 if(/Requested format is not available/i.test(message))return 'Este video no ofrece la calidad seleccionada. Escoge «Mejor disponible» y vuelve a intentar la descarga.';
 if(/10054|ConnectionResetError|Connection aborted/i.test(message))return 'La conexión con la plataforma se interrumpió (10054). No se descargó el video. Comprueba que el enlace abre en tu navegador y prueba con otra conexión, por ejemplo los datos de tu celular.';
 if(/resolv|dns|getaddrinfo/i.test(message))return 'No se pudo encontrar la plataforma en esta conexión (DNS). Comprueba tu conexión a internet e intenta de nuevo.';
 if(/timed? out|tiempo/i.test(message))return 'La plataforma no respondió a tiempo. No se descargó el video. Comprueba tu conexión e intenta de nuevo.';
 if(/not available|unavailable/i.test(message))return 'La plataforma indica que este video no está disponible. Comprueba el enlace o prueba con otro video público.';
 if(/sign in|login|cookies|private/i.test(message))return 'El video requiere iniciar sesión o es privado. Prueba con un video público que abra en tu navegador.';
 if(/\[facebook\][^\r\n]*Cannot parse data/i.test(message))return 'Facebook no entregó los datos del video para este enlace. Abre la publicación, entra al video y copia su enlace directo. Comprueba que el video se pueda reproducir sin iniciar sesión.';
 return 'No se pudo descargar el video. Prueba con otro enlace público.';
}
function run(args,onLine){return new Promise((resolve,reject)=>{
 const p=spawn(ytDlp,['--ignore-config','--encoding','utf-8','--no-playlist','--socket-timeout','12','--retries','1','--extractor-retries','0',...args],{windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
 let err='';let buffer='';
 let prepared=false;
 p.stdout.setEncoding('utf8');p.stderr.setEncoding('utf8');
 p.stdout.on('data',d=>{buffer+=d;let lines=buffer.split(/\r?\n/);buffer=lines.pop();for(const l of lines){if(l.startsWith('TITLE:')&&!prepared){prepared=true;clearTimeout(timer);timer=setTimeout(expire,15*60*1000);}onLine?.(l);}});
 p.stderr.on('data',d=>{err=(err+d).slice(-6000);});
 const expire=()=>{p.kill();reject(Error('Se agotó el tiempo de descarga. Prueba de nuevo.'));};
 let timer=setTimeout(expire,60000);
 p.on('error',e=>{clearTimeout(timer);reject(e);});p.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error(err||'No se pudo descargar este video.'));});
 });}
export async function download(job){
 try{
 await prepareMedia();
 const dir=path.join(root,'downloads',job.id);await mkdir(dir,{recursive:true});
 await run(['--js-runtimes','node','--match-filters','!is_live','--ffmpeg-location',ffmpeg,...formatArgs(job.format,job.quality),'--newline','--progress','--progress-template','download:PROGRESS:%(progress._percent_str)s','--print','before_dl:TITLE:%(title)s','--print','after_move:FILE:%(filepath)s','-o',path.join(dir,'%(title).100B.%(ext)s'),'--',job.url],line=>{
 if(line.startsWith('TITLE:')){job.title=line.slice(6);job.phase='downloading';}
 if(line.startsWith('PROGRESS:')){const percent=parseFloat(line.slice(9))||0;job.progress=Math.min(99,percent);if(percent>=100)job.phase='converting';}
 });
 const files=await readdir(dir);for(const name of files){if(name.endsWith(job.format==='mp3'?'.mp3':'.mp4')&&(await stat(path.join(dir,name))).size>0){job.file=name;break;}}
 if(!job.file)throw Error('El motor terminó sin generar un archivo.');
 job.status='done';job.progress=100;
 }catch(e){job.status='error';job.error=downloadError(e.message);job.details=e.message.slice(-4000);}
}
export async function serveMedia(req,res,file,inline=false){
 const {size}=await stat(file);
 const headers={'Content-Type':file.endsWith('.mp3')?'audio/mpeg':'video/mp4','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff','Content-Disposition':`${inline?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(path.basename(file))}`};
 let start=0,end=size-1,code=200;
 if(req.headers.range){
 const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
 if(!match||(!match[1]&&!match[2])){res.writeHead(416,{...headers,'Content-Range':`bytes */${size}`});return res.end();}
 if(match[1]){start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;}
 else{start=Math.max(0,size-Number(match[2]));}
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size){res.writeHead(416,{...headers,'Content-Range':`bytes */${size}`});return res.end();}
 code=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;
 }
 headers['Content-Length']=String(end-start+1);
 res.writeHead(code,headers);if(req.method==='HEAD')return res.end();
 const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
}
export function createApp({inspect=inspectVideo,startDownload=download}={}){
const jobs=new Map(),verified=new Map();const recognize=createRecognizer(inspect);
return http.createServer(async(req,res)=>{
 const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
 try{
 const u=new URL(req.url,'http://localhost');
 if(req.method==='GET'&&u.pathname==='/api/health')return send(200,{app:'Dressapp',version:'1.3.0',recognition:true});
 if(req.method==='POST'){
 if(req.headers.origin&&!(publicOrigin?req.headers.origin===publicOrigin:/^http:\/\/(localhost|127\.0\.0\.1):3847$/.test(req.headers.origin)))return send(403,{error:'Origen no permitido.'});
 if(!['/api/jobs','/api/inspect'].includes(u.pathname))return send(404,{});
 let raw='';for await(const c of req){raw+=c;if(raw.length>4096)return send(413,{error:'Solicitud demasiado grande.'});}
 const body=JSON.parse(raw);const url=validateURL(body.url);
 if(u.pathname==='/api/inspect'){
 try{
 const info=await recognize(url);
 for(const [key,value] of verified)if(value.expires<Date.now())verified.delete(key);
 if(verified.size>=100)verified.delete(verified.keys().next().value);
 const token=randomUUID(),expires=Date.now()+10*60*1000;verified.set(token,{url,expires,...info});
 return send(200,{...info,token,expires,url});
 }catch(e){return send(e.status||422,{error:e.status===429?e.message:downloadError(e.message),details:e.message.slice(-2000)});}
 }
 if(body.format!==undefined&&!['mp3','mp4'].includes(body.format))return send(400,{error:'Escoge MP3 (audio) o MP4 (video).'});
 const confirmation=verified.get(body.token);
 if(!confirmation||confirmation.url!==url||confirmation.expires<Date.now())return send(409,{error:'Primero verifica el enlace para reconocer el video.'});
 if([...jobs.values()].filter(j=>j.status==='downloading').length>=2)return send(429,{error:'Espera a que termine una de las descargas.'});
 const job={id:randomUUID(),url,format:body.format||'mp4',quality:body.quality==='720'?'720':'best',status:'downloading',progress:0,title:confirmation.title};jobs.set(job.id,job);startDownload(job);return send(202,job);
 }
 if(req.method!=='GET'&&req.method!=='HEAD')return send(405,{});
 if(u.pathname.startsWith('/api/jobs/')){const j=jobs.get(u.pathname.split('/').pop());return send(j?200:404,j||{error:'Descarga no encontrada.'});}
 if(u.pathname.startsWith('/files/')||u.pathname.startsWith('/preview/')){
 const j=jobs.get(u.pathname.split('/').pop());if(!j||j.status!=='done')return send(404,{});
 return await serveMedia(req,res,path.join(root,'downloads',j.id,j.file),u.pathname.startsWith('/preview/'));
 }
 const files={'/':'index.html','/app.js':'app.js','/controls.js':'controls.js','/style.css':'style.css','/effects.css':'effects.css','/refined.css':'refined.css','/mobile.css':'mobile.css','/install.js':'install.js','/sw.js':'sw.js','/manifest.webmanifest':'manifest.webmanifest','/icon-192.png':'icon-192.png','/icon-512.png':'icon-512.png','/icon-maskable.png':'icon-maskable.png','/apple-touch-icon.png':'apple-touch-icon.png'};const f=files[u.pathname];if(!f)return send(404,{});
 const type=f.endsWith('html')?'text/html; charset=utf-8':f.endsWith('css')?'text/css':f.endsWith('webmanifest')?'application/manifest+json':f.endsWith('png')?'image/png':'text/javascript';
 res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(f==='sw.js'?{'Service-Worker-Allowed':'/'}:{})});res.end(await readFile(path.join(root,'public',f)));
 }catch(e){send(400,{error:e.message});}
});
}
export const server=createApp();
if(process.argv[1]===fileURLToPath(import.meta.url))server.listen(Number(process.env.PORT)||3847,process.env.HOST||'127.0.0.1',()=>console.log(`Dressapp: puerto ${process.env.PORT||3847}`));
