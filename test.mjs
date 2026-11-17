import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {server,validateURL,downloadError,download,serveMedia,inspectVideo,createApp,createRecognizer,canonicalVideoURL} from './server.mjs';
import {randomUUID} from 'node:crypto';
import probe from 'ffprobe-static';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
after(()=>new Promise(r=>server.close(r)));
test('YouTube reconoce metadatos oficiales sin extraer todos los formatos',async()=>{
 let calls=0;
 const info=await inspectVideo('https://youtu.be/VxrIZGQfxmE?si=tracking',{fetchMetadata:async endpoint=>{
 calls++;assert.equal(endpoint.origin,'https://www.youtube.com');assert.equal(endpoint.pathname,'/oembed');assert.equal(endpoint.searchParams.get('url'),'https://www.youtube.com/watch?v=VxrIZGQfxmE');
 return {ok:true,json:async()=>({title:'Curso de programación',type:'video',provider_name:'YouTube'})};
 }});
 assert.equal(calls,1);assert.equal(info.title,'Curso de programación');assert.equal(info.duration,0);assert.equal(info.source,'oembed');
});
test('Reconocimiento reutiliza resultados, agrupa solicitudes y caduca la caché',async()=>{
 let time=1000,calls=0;
 const recognize=createRecognizer(async()=>{calls++;await new Promise(r=>setTimeout(r,10));return {title:'Prueba'};},{now:()=>time,ttlMs:100});
 const short='https://youtu.be/VxrIZGQfxmE?si=tracking',long='https://www.youtube.com/watch?v=VxrIZGQfxmE&list=RDtest';
 assert.equal(canonicalVideoURL(short),canonicalVideoURL(long));
 const [a,b]=await Promise.all([recognize(short),recognize(long)]);assert.equal(a.title,b.title);assert.equal(calls,1);
 await recognize(short);assert.equal(calls,1);
 time=1101;await recognize(long);assert.equal(calls,2);
 let attempts=0;const failing=createRecognizer(async()=>{attempts++;throw Error('No disponible');});
 await assert.rejects(failing(short));await assert.rejects(failing(long));assert.equal(attempts,2);
});
test('Explica el error 10054 y diferencia DNS, espera y autenticación',()=>{
 assert.match(downloadError('ConnectionResetError(10054)'),/10054.*No se descargó/);
 assert.match(downloadError('Failed to resolve host'),/DNS/);
 assert.match(downloadError('Request timed out'),/tiempo/);
 assert.match(downloadError('Please sign in'),/iniciar sesión/);
 assert.match(downloadError('Requested format is not available'),/Mejor disponible/);
});
test('Valida las cuatro plataformas y rechaza destinos no permitidos',()=>{
 for(const host of ['www.youtube.com','youtu.be','vm.tiktok.com','www.instagram.com','www.facebook.com','fb.watch'])assert.ok(validateURL(`https://${host}/video`));
 for(const url of ['file:///etc/passwd','http://youtube.com/x','https://youtube.com.evil.com/x','https://localhost/x','https://user@youtube.com/x','https://youtube.com:444/x'])assert.throws(()=>validateURL(url));
});
test('Interfaz y recursos accesibles',async()=>{for(const p of ['/','/app.js','/controls.js','/style.css','/effects.css','/refined.css'])assert.equal((await fetch(base+p)).status,200);assert.equal((await fetch(base+'/missing')).status,404);});
test('API rechaza enlaces inválidos, JSON incorrecto y peticiones externas',async()=>{
 const post=(body,origin)=>fetch(base+'/api/jobs',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body});
 assert.equal((await post(JSON.stringify({url:'https://localhost/video'}))).status,400);
 assert.equal((await post(JSON.stringify({url:'https://youtu.be/abc',format:'exe'}))).status,400);
 assert.equal((await post(JSON.stringify({url:'https://youtu.be/abc',format:'mp4'}))).status,409);
 assert.equal((await post('{')).status,400);
 assert.equal((await post('{}','https://example.com')).status,403);
 assert.equal((await fetch(base+'/files/unknown')).status,404);
 assert.equal((await fetch(base+'/preview/unknown')).status,404);
 assert.equal((await fetch(base+'/api/jobs/unknown')).status,404);
});
test('Flujo de la app: convierte WebM a MP3 y MP4 con contenido real',{timeout:90000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'dressapp-format-'));let fixture;
 const jobDirs=[];
 try{
 const original=path.join(dir,'original.webm');
 await exec(path.resolve('node_modules/ffmpeg-static/ffmpeg.exe'),['-f','lavfi','-i','color=c=blue:s=160x90:d=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libvpx','-c:a','libopus','-shortest',original]);
 const video=await readFile(original);
 fixture=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'video/webm','Content-Length':video.length});res.end(video);});
 await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
 const metadata=await inspectVideo(`http://127.0.0.1:${fixture.address().port}/video.webm`);assert.equal(metadata.title,'video');
 for(const format of ['mp3','mp4']){
 const job={id:randomUUID(),url:`http://127.0.0.1:${fixture.address().port}/video.webm`,format,quality:'720',status:'downloading',progress:0};
 const jobDir=path.resolve('downloads',job.id);jobDirs.push(jobDir);
 await download(job);
 assert.equal(job.status,'done',job.details);assert.ok(job.file.endsWith('.'+format));
 const info=JSON.parse(await exec(probe.path,['-v','error','-show_streams','-show_format','-of','json',path.join(jobDir,job.file)]));
 assert.ok(Number(info.format.duration)>0);
 if(format==='mp3'){assert.deepEqual(info.streams.map(s=>s.codec_type),['audio']);assert.equal(info.streams[0].codec_name,'mp3');}
 else{assert.ok(info.streams.some(s=>s.codec_type==='video'&&s.codec_name==='h264'));assert.ok(info.streams.some(s=>s.codec_type==='audio'&&s.codec_name==='aac'));}
 const file=path.join(jobDir,job.file),bytes=await readFile(file);
 const playback=http.createServer((req,res)=>{serveMedia(req,res,file,req.url==='/preview').catch(()=>res.destroy());});
 await new Promise(r=>playback.listen(0,'127.0.0.1',r));
 try{
 const url=`http://127.0.0.1:${playback.address().port}`;
 const full=await fetch(url+'/preview');assert.equal(full.status,200);
 assert.equal(full.headers.get('content-type'),format==='mp3'?'audio/mpeg':'video/mp4');
 assert.match(full.headers.get('content-disposition'),/^inline/);
 assert.deepEqual(Buffer.from(await full.arrayBuffer()),bytes);
 for(const [range,start,end] of [['bytes=0-31',0,31],['bytes=-16',bytes.length-16,bytes.length-1],['bytes=32-',32,bytes.length-1]]){
 const partial=await fetch(url+'/preview',{headers:{Range:range}});assert.equal(partial.status,206);
 assert.equal(partial.headers.get('content-range'),`bytes ${start}-${end}/${bytes.length}`);
 assert.deepEqual(Buffer.from(await partial.arrayBuffer()),bytes.subarray(start,end+1));
 }
 const invalid=await fetch(url+'/preview',{headers:{Range:`bytes=${bytes.length}-`}});assert.equal(invalid.status,416);await invalid.arrayBuffer();
 const head=await fetch(url+'/preview',{method:'HEAD'});assert.equal(head.headers.get('content-length'),String(bytes.length));assert.equal((await head.arrayBuffer()).byteLength,0);
 const saved=await fetch(url+'/download');assert.match(saved.headers.get('content-disposition'),/^attachment/);await saved.arrayBuffer();
 }finally{await new Promise(r=>playback.close(r));}
 }
 }finally{if(fixture)await new Promise(r=>fixture.close(r));for(const d of jobDirs)await rm(d,{recursive:true,force:true});await rm(dir,{recursive:true,force:true});}
});
test('API de reconocimiento: exige verificación y vincula el permiso al enlace',{timeout:10000},async()=>{
 let downloads=0;
 const app=createApp({inspect:async url=>{if(url.includes('fallo'))throw Error('ConnectionResetError(10054)');return {title:'Video de prueba',duration:90,platform:'YouTube'};},startDownload:()=>{downloads++;}});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${app.address().port}`;
 const post=(route,body)=>fetch(origin+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
 const invalid=await post('/api/inspect',{url:'https://example.com/video'});assert.equal(invalid.status,400);
 const failed=await post('/api/inspect',{url:'https://youtu.be/fallo'});assert.equal(failed.status,422);assert.match((await failed.json()).error,/10054/);
 const denied=await post('/api/jobs',{url:'https://youtu.be/video',format:'mp3'});assert.equal(denied.status,409);
 const checked=await post('/api/inspect',{url:'https://youtu.be/video'});assert.equal(checked.status,200);const info=await checked.json();assert.equal(info.title,'Video de prueba');assert.ok(info.token);assert.ok(info.expires>Date.now());
 const changed=await post('/api/jobs',{url:'https://youtu.be/otro',token:info.token,format:'mp3'});assert.equal(changed.status,409);
 const good=await post('/api/jobs',{url:'https://youtu.be/video',token:info.token,format:'mp3'});assert.equal(good.status,202);assert.equal((await good.json()).title,'Video de prueba');assert.equal(downloads,1);
 }finally{await new Promise(r=>app.close(r));}
});
function exec(file,args){return new Promise((resolve,reject)=>{const p=spawn(file,args,{windowsHide:true});let out='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>out+=d);p.on('error',reject);p.on('close',c=>c===0?resolve(out):reject(Error(out)));});}
test('Descarga real con yt-dlp y archivo de video controlado',{timeout:60000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'dressapp-'));let fixture;
 try{
 const original=path.join(dir,'original.mp4'),downloaded=path.join(dir,'descarga.mp4');
 await exec(path.resolve('node_modules/ffmpeg-static/ffmpeg.exe'),['-f','lavfi','-i','color=c=green:s=160x90:d=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libx264','-c:a','aac','-shortest',original]);
 const video=await readFile(original);
 fixture=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':video.length});res.end(video);});await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
 await exec(path.resolve('bin/yt-dlp.exe'),['--ignore-config','--no-playlist','-o',downloaded,`http://127.0.0.1:${fixture.address().port}/video.mp4`]);
 assert.deepEqual(await readFile(downloaded),video);
 }finally{if(fixture)await new Promise(r=>fixture.close(r));await rm(dir,{recursive:true,force:true});}
});
