const form=document.querySelector('#form');
const msg=document.querySelector('#message');
const format=document.querySelector('#format');
const quality=document.querySelector('#quality');
const submit=document.querySelector('#submit');
const urlInput=document.querySelector('#url'),linkStatus=document.querySelector('#link-status');
let submitting=false;
const platforms=['youtube.com','youtu.be','instagram.com','tiktok.com','facebook.com','fb.watch'];

function validLink(value){
 try{
 const url=new URL(value);
 return url.protocol==='https:'&&!url.username&&!url.password&&!url.port
 &&platforms.some(host=>url.hostname===host||url.hostname.endsWith('.'+host));
 }catch{return false;}
}
function updateSubmit(){
 const value=urlInput.value.trim();
 const valid=validLink(value);
 const invalid=Boolean(value)&&!valid;
 submit.disabled=submitting||!valid;
 submit.textContent=submitting?'Preparando descarga…':`Descargar ${format.value.toUpperCase()} ↓`;
 urlInput.setAttribute('aria-invalid',String(invalid));
 urlInput.closest('.input').dataset.state=invalid?'error':'';
 linkStatus.hidden=!invalid;
 linkStatus.dataset.state='error';
 linkStatus.textContent=invalid?'Usa un enlace HTTPS de YouTube, TikTok, Instagram o Facebook.':'';
}
function saveFile(url,name){
 const link=document.createElement('a');
 link.href=url;link.download=name;
 document.body.append(link);link.click();link.remove();
}
async function downloadOnline(options){
 const response=await fetch('/api/download',{method:'POST',headers:{'Content-Type':'application/json'},
 body:JSON.stringify(options),signal:AbortSignal.timeout(125000)});
 if(!response.ok){
 const error=await response.json().catch(()=>null);
 throw Error(typeof error?.detail==='string'?error.detail:'El servicio de descargas no pudo completar la solicitud.');
 }
 const type=options.format==='mp3'?'audio/mpeg':'video/mp4';
 if(!response.headers.get('content-type')?.startsWith(type))throw Error('El servicio de descargas no devolvió el archivo.');
 const file=await response.blob();
 const url=URL.createObjectURL(file);
 saveFile(url,`Dressapp.${options.format}`);
 setTimeout(()=>URL.revokeObjectURL(url),60000);
 msg.textContent='Archivo enviado a las descargas del navegador.';
}
urlInput.setAttribute('aria-describedby','link-status');
urlInput.addEventListener('input',()=>{msg.textContent='';updateSubmit();});
format.onchange=()=>{
 quality.disabled=format.value==='mp3';
 document.querySelector('#format-hint').textContent=format.value==='mp3'?'Solo audio en MP3 a 192 kbps.':'Video con audio en un archivo MP4.';
 updateSubmit();
};
document.querySelector('#paste').onclick=async()=>{
 try{urlInput.value=await navigator.clipboard.readText();msg.textContent='';updateSubmit();}
 catch{msg.textContent='Usa Ctrl + V para pegar tu enlace.';}
};
form.onsubmit=async e=>{
 e.preventDefault();msg.textContent='';updateSubmit();if(submit.disabled)return;
 const options={url:urlInput.value.trim(),format:format.value,quality:quality.value};
 submitting=true;updateSubmit();
 try{
 const inspection=await fetch('/api/inspect',{method:'POST',headers:{'Content-Type':'application/json'},
 body:JSON.stringify({url:options.url}),signal:AbortSignal.timeout(65000)});
 if(inspection.status===404||!inspection.headers.get('content-type')?.includes('application/json')){
 await downloadOnline(options);
 return;
 }
 const info=await inspection.json();
 if(!inspection.ok)throw Error(info.error||'No pudimos reconocer este video.');
 const r=await fetch('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...options,token:info.token}),signal:AbortSignal.timeout(10000)});
 const j=await r.json();if(!r.ok)throw Error(j.error);
 const card=document.createElement('article');card.className='job';
 const title=document.createElement('h3'),progress=document.createElement('progress'),status=document.createElement('p');
 progress.max=100;card.append(title,progress,status);document.querySelector('#results').prepend(card);
 async function poll(){
 try{
 const r=await fetch('/api/jobs/'+j.id,{signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('No se encontró la descarga.');
 const data=await r.json();const label=(data.format||'mp4').toUpperCase();
 title.textContent=data.status==='error'?'No se pudo descargar':`${data.title} · ${label}`;
 card.dataset.status=data.status;progress.hidden=data.status==='error';
 if(data.phase==='downloading'||data.status==='done')progress.value=data.progress;else progress.removeAttribute('value');
 status.textContent=data.status==='downloading'?(data.phase==='converting'?`Preparando tu archivo ${label}…` : data.phase==='downloading'?`Descargando · ${Math.round(data.progress)} %`:'Conectando con la plataforma… Puede tardar hasta 60 segundos.'):data.status==='done'?'Tu archivo está listo. Pulsa el botón para guardarlo.':data.error;
 if(data.status==='done'){
 progress.hidden=true;
 const preview=document.createElement(data.format==='mp3'?'audio':'video');
 preview.className='media-preview';preview.controls=true;preview.preload='metadata';
 preview.setAttribute('aria-label',`Previsualización de ${data.title}`);
 if(data.format!=='mp3')preview.setAttribute('playsinline','');
 preview.src='/preview/'+j.id;
 const fallback=document.createElement('p');fallback.className='preview-fallback';fallback.hidden=true;
 fallback.textContent='Tu navegador no pudo reproducir este archivo. Puedes guardarlo y abrirlo en tu dispositivo.';
 preview.addEventListener('error',()=>{fallback.hidden=false;});
 card.append(preview,fallback);
 const a=document.createElement('a');a.href='/files/'+j.id;a.textContent=`Guardar ${label} ↓`;a.download=data.file;card.append(a);saveFile(a.href,data.file);
 }else if(data.status==='error'){
 if(data.details){const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='Ver detalle técnico';pre.textContent=data.details;pre.style.whiteSpace='pre-wrap';details.append(summary,pre);card.append(details);}
 const retry=document.createElement('button');retry.className='paste';retry.textContent='Volver a descargar';retry.onclick=()=>{urlInput.value=j.url;format.value=j.format||'mp4';quality.value=j.quality;format.dispatchEvent(new Event('change'));quality.dispatchEvent(new Event('change'));form.requestSubmit();};card.append(retry);
 }else setTimeout(poll,1200);
 }catch{title.textContent='Conexión con la app perdida';progress.hidden=true;status.textContent='Reinicia la app y vuelve a intentar la descarga.';}
 }
 poll();
 }catch(e){msg.textContent=e.message;}finally{submitting=false;updateSubmit();}
};
if(['localhost','127.0.0.1','[::1]'].includes(location.hostname)){
 const incoming=new URLSearchParams(location.hash.slice(1));
 if(incoming.has('video')){
 urlInput.value=incoming.get('video');
 format.value=incoming.get('format')==='mp3'?'mp3':'mp4';
 quality.value=incoming.get('quality')==='720'?'720':'best';
 format.dispatchEvent(new Event('change'));
 quality.dispatchEvent(new Event('change'));
 history.replaceState(null,'',location.pathname+location.search);
 }
}
updateSubmit();
