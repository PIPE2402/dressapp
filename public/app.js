const form=document.querySelector('#form');
const msg=document.querySelector('#message');
const format=document.querySelector('#format');
const quality=document.querySelector('#quality');
const submit=document.querySelector('#submit');
const urlInput=document.querySelector('#url'),linkStatus=document.querySelector('#link-status');
let submitting=false,onlineFile,confirmed,checkRequest,checkTimer,expiryTimer;
const platforms=['youtube.com','youtu.be','instagram.com','tiktok.com','facebook.com','fb.watch'];
const verifyAgain=document.createElement('button');
const retryIcon=document.createElement('i'),retryLabel=document.createElement('span');
verifyAgain.type='button';verifyAgain.className='verify-again';verifyAgain.hidden=true;
retryIcon.textContent='↻';retryIcon.setAttribute('aria-hidden','true');
verifyAgain.append(retryIcon,retryLabel);linkStatus.after(verifyAgain);
verifyAgain.onclick=recognize;

function validLink(value){
 try{
 const url=new URL(value);
 return url.protocol==='https:'&&!url.username&&!url.password&&!url.port
 &&platforms.some(host=>url.hostname===host||url.hostname.endsWith('.'+host));
 }catch{return false;}
}
function updateSubmit(){
 submit.disabled=submitting||!confirmed||confirmed.url!==urlInput.value.trim();
 submit.textContent=submitting?'Preparando descarga…':`Descargar ${format.value.toUpperCase()} ↓`;
}
function showLinkState(state,text=''){
 linkStatus.hidden=!text;
 linkStatus.dataset.state=state;
 linkStatus.textContent=text;
 urlInput.closest('.input').dataset.state=state;
 urlInput.setAttribute('aria-invalid',String(state==='error'));
 verifyAgain.hidden=!['loading','error'].includes(state);
 verifyAgain.disabled=state==='loading';
 verifyAgain.classList.toggle('is-loading',state==='loading');
 retryLabel.textContent=state==='loading'?'Verificando…':'Volver a verificar';
}
function resetVerification(){
 clearTimeout(checkTimer);clearTimeout(expiryTimer);
 checkRequest?.abort();checkRequest=null;confirmed=null;
 updateSubmit();
}
async function recognize(){
 resetVerification();
 const url=urlInput.value.trim();
 if(!url){showLinkState('');return;}
 if(!validLink(url)){
 showLinkState('error','Usa un enlace HTTPS de YouTube, TikTok, Instagram o Facebook.');
 return;
 }
 const request=new AbortController();
 checkRequest=request;
 const timeout=setTimeout(()=>request.abort(),65000);
 showLinkState('loading','Reconociendo video… Estamos comprobando el enlace.');
 const post=(path,body)=>fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},
 body:JSON.stringify(body),signal:request.signal});
 try{
 let online=location.hostname.endsWith('.vercel.app');
 let response=online?null:await post('/api/inspect',{url});
 if(!response||response.status===404||!response.headers.get('content-type')?.includes('application/json')){
 online=true;response=await post('/api/download',{url,inspect:true});
 }
 const info=await response.json().catch(()=>null);
 if(checkRequest!==request)return;
 if(!response.ok||!info?.title)throw Error(info?.error||(typeof info?.detail==='string'?info.detail:'No pudimos reconocer el video.'));
 confirmed={url,online,token:info.token};
 showLinkState('valid',`✓ Video reconocido · ${info.platform}\n${info.title}`);
 expiryTimer=setTimeout(()=>{
 confirmed=null;updateSubmit();
 showLinkState('error','La verificación caducó. Vuelve a verificar el enlace.');
 },Math.max(0,(info.expires||Date.now()+10*60*1000)-Date.now()));
 }catch(error){
 if(checkRequest===request)showLinkState('error',request.signal.aborted?'La verificación tardó demasiado. Inténtalo de nuevo.':error.message);
 }finally{
 clearTimeout(timeout);
 if(checkRequest===request){checkRequest=null;updateSubmit();}
 }
}
function saveFile(url,name){
 const link=document.createElement('a');
 link.href=url;link.download=name;
 document.body.append(link);link.click();link.remove();
}
async function downloadOnline(options){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),125000);
 try{
 const response=await fetch('/api/download',{method:'POST',headers:{'Content-Type':'application/json'},
 body:JSON.stringify(options),signal:controller.signal});
 if(!response.ok){
 const error=await response.json().catch(()=>null);
 throw Error(typeof error?.detail==='string'?error.detail:'El servicio de descargas no pudo completar la solicitud.');
 }
 const type=options.format==='mp3'?'audio/mpeg':'video/mp4';
 if(!response.headers.get('content-type')?.startsWith(type))throw Error('El servicio de descargas no devolvió el archivo.');
 const file=await response.blob();
 if(!file.size)throw Error('El servidor devolvió un archivo vacío. Inténtalo de nuevo.');
 const url=URL.createObjectURL(file);
 const card=document.createElement('article');
 const title=document.createElement('h3');
 const link=document.createElement('a');
 card.className='job';card.dataset.status='done';
 title.textContent='Archivo listo';
 link.href=url;link.download=`Dressapp.${options.format}`;
 link.textContent=`Guardar ${options.format.toUpperCase()} ↓`;
 card.append(title,link);
 if(onlineFile){URL.revokeObjectURL(onlineFile.url);onlineFile.card.remove();}
 onlineFile={url,card};
 document.querySelector('#results').prepend(card);
 card.scrollIntoView({block:'nearest'});
 link.click();
 }finally{clearTimeout(timeout);}
}
urlInput.setAttribute('aria-describedby','link-status');
urlInput.addEventListener('input',event=>{
 msg.textContent='';resetVerification();showLinkState('');
 if(urlInput.value.trim())checkTimer=setTimeout(recognize,event.inputType==='insertFromPaste'?0:250);
});
format.onchange=()=>{
 quality.disabled=format.value==='mp3';
 document.querySelector('#format-hint').textContent=format.value==='mp3'?'Solo audio en MP3 a 192 kbps.':'Video con audio en un archivo MP4.';
 updateSubmit();
};
document.querySelector('#paste').onclick=async()=>{
 try{urlInput.value=await navigator.clipboard.readText();msg.textContent='';recognize();}
 catch{msg.textContent='Usa Ctrl + V para pegar tu enlace.';}
};
form.onsubmit=async e=>{
 e.preventDefault();msg.textContent='';updateSubmit();if(submit.disabled)return;
 const options={url:urlInput.value.trim(),format:format.value,quality:quality.value};
 const verification=confirmed;
 submitting=true;updateSubmit();
 try{
 if(verification.online){
 await downloadOnline(options);
 return;
 }
 const r=await fetch('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...options,token:verification.token}),signal:AbortSignal.timeout(10000)});
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
 const retry=document.createElement('button');retry.className='paste';retry.textContent='Volver a descargar';retry.onclick=async()=>{urlInput.value=j.url;format.value=j.format||'mp4';quality.value=j.quality;format.dispatchEvent(new Event('change'));quality.dispatchEvent(new Event('change'));await recognize();form.requestSubmit();};card.append(retry);
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
updateSubmit();if(urlInput.value.trim())recognize();
