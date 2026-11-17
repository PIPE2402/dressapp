import {createApp,download} from './server.mjs';
import {mkdir,writeFile,readFile,stat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import probe from 'ffprobe-static';

const allSamples=[
 {platform:'YouTube',url:'https://www.youtube.com/watch?v=jNQXAC9IVRw'},
 {platform:'TikTok',url:'https://www.tiktok.com/@scout2015/video/6718335390845095173'},
 {platform:'Instagram',url:'https://www.instagram.com/reel/DA6o7HlpdXu/'},
 {platform:'Facebook',url:'https://www.facebook.com/cnn/videos/10155529876156509/'},
];
const samples=process.env.LIVE_PLATFORM?allSamples.filter(s=>s.platform===process.env.LIVE_PLATFORM):allSamples;
const quality=process.env.LIVE_QUALITY||'best';
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const out=path.resolve('artifacts','live-'+stamp);await mkdir(out,{recursive:true});
const report={started:new Date().toISOString(),samples,quality,results:[]};
const app=createApp();await new Promise(r=>app.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${app.address().port}`;
const post=async(route,body)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(70000)});const data=await r.json();return {status:r.status,data};};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hash=data=>createHash('sha256').update(data).digest('hex');
function execute(file,args,timeout=120000){return new Promise((resolve,reject)=>{const p=spawn(file,args,{windowsHide:true});let data='',error='';p.stdout.on('data',d=>data+=d);p.stderr.on('data',d=>error=(error+d).slice(-8000));const timer=setTimeout(()=>{p.kill();reject(Error('Tiempo agotado verificando el archivo'));},timeout);p.on('error',e=>{clearTimeout(timer);reject(e);});p.on('close',code=>{clearTimeout(timer);code===0?resolve(data):reject(Error(error||'Error de análisis multimedia'));});});}
async function check(sample){
 console.log('RECONOCER',sample.platform,sample.url);
 let inspected;
 try{inspected=await post('/api/inspect',{url:sample.url});}catch(e){inspected={status:0,data:{error:e.message}};}
 for(const format of ['mp4','mp3']){
 const result={platform:sample.platform,url:sample.url,format,recognitionStatus:inspected.status,mode:inspected.status===200?'app-http':'diagnostico-motor',passed:false,started:new Date().toISOString()};
 const t=performance.now();
 try{
 let job;
 if(inspected.status===200){
 const response=await post('/api/jobs',{url:sample.url,token:inspected.data.token,format,quality});
 if(response.status!==202)throw Error(response.data.error);
 job=response.data;
 do{await sleep(800);const r=await fetch(base+'/api/jobs/'+job.id);job=await r.json();}while(job.status==='downloading');
 }else{
 result.recognitionError=inspected.data.error;result.recognitionDetails=inspected.data.details;
 job={id:randomUUID(),url:sample.url,format,quality,status:'downloading',progress:0};await download(job);
 }
 result.jobId=job.id;result.title=job.title;
 if(job.status!=='done'){result.details=job.details;throw Error(job.error||'La descarga no terminó');}
 const source=path.resolve('downloads',job.id,job.file);
 const onDisk=await readFile(source);if(!onDisk.length)throw Error('Archivo vacío');
 let saved=onDisk;
 if(result.mode==='app-http'){
 const response=await fetch(base+'/files/'+job.id);if(response.status!==200)throw Error('No se pudo guardar desde el endpoint');
 if(!response.headers.get('content-disposition')?.startsWith('attachment'))throw Error('Falta encabezado de descarga');
 saved=Buffer.from(await response.arrayBuffer());if(hash(onDisk)!==hash(saved))throw Error('El archivo servido no coincide con el descargado');
 const preview=await fetch(base+'/preview/'+job.id,{headers:{Range:'bytes=0-63'}});result.previewStatus=preview.status;await preview.arrayBuffer();if(preview.status!==206)throw Error('La previsualización no permite rangos');
 }
 const destination=path.join(out,`${sample.platform}.${format}`);await writeFile(destination,saved);
 result.savedFile=destination;result.bytes=(await stat(destination)).size;result.sha256=hash(saved);
 const info=JSON.parse(await execute(probe.path,['-v','error','-show_format','-show_streams','-of','json',destination],30000));
 result.duration=Number(info.format.duration);result.streams=info.streams.map(s=>({type:s.codec_type,codec:s.codec_name}));
 if(!(result.duration>0))throw Error('Duración inválida');
 if(format==='mp3'&&(info.streams.length!==1||info.streams[0].codec_type!=='audio'||info.streams[0].codec_name!=='mp3'))throw Error('El archivo no es MP3 de solo audio');
 if(format==='mp4'&&(!info.streams.some(s=>s.codec_type==='video')||!info.streams.some(s=>s.codec_type==='audio')))throw Error('El MP4 no contiene video y audio');
 await execute(path.resolve('node_modules','ffmpeg-static','ffmpeg.exe'),['-v','error','-i',destination,'-f','null','-']);
 result.decoded=true;result.passed=result.mode==='app-http';
 if(!result.passed)result.error='El motor guardó el archivo, pero la verificación previa de la app falló.';
 }catch(e){result.error=e.message;}
 result.seconds=Number(((performance.now()-t)/1000).toFixed(2));report.results.push(result);
 await writeFile(path.join(out,'resultados.json'),JSON.stringify(report,null,2));
 console.log('RESULTADO',JSON.stringify({platform:result.platform,format,passed:result.passed,bytes:result.bytes,seconds:result.seconds,error:result.error}));
 }
}
try{
 let next=0;await Promise.all([0,1].map(async()=>{while(next<samples.length){const sample=samples[next++];await check(sample);}}));
 report.finished=new Date().toISOString();await writeFile(path.join(out,'resultados.json'),JSON.stringify(report,null,2));
 console.log('INFORME',path.join(out,'resultados.json'));
}finally{await new Promise(r=>app.close(r));}
