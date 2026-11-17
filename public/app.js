const form=document.querySelector('#form');
const msg=document.querySelector('#message');
const format=document.querySelector('#format');
const quality=document.querySelector('#quality');
const submit=document.querySelector('#submit');
const urlInput=document.querySelector('#url'),linkStatus=document.querySelector('#link-status');
let confirmed=null,checkTimer,checkRequest,checkVersion=0,submitting=false,expiryTimer;
function updateSubmit(){submit.disabled=submitting||!confirmed||confirmed.expires<=Date.now()||confirmed.url!==urlInput.value.trim();}
function showLinkState(state,text){linkStatus.hidden=!text;linkStatus.dataset.state=state;linkStatus.textContent=text;urlInput.closest('.input').dataset.state=state;urlInput.setAttribute('aria-invalid',state==='error'?'true':'false');verifyAgain.hidden=!['error','loading'].includes(state);verifyAgain.disabled=state==='loading';verifyAgain.classList.toggle('is-loading',state==='loading');verifyAgain.querySelector('span').textContent=state==='loading'?'Verificando…':'Volver a verificar';}
async function recognize(){
 const value=urlInput.value.trim(),version=++checkVersion;
 checkRequest?.abort();clearTimeout(checkTimer);clearTimeout(expiryTimer);confirmed=null;updateSubmit();
 if(!value){showLinkState('','');return;}
 let url;try{url=new URL(value);}catch{showLinkState('error','Pega un enlace completo que empiece con https://.');return;}
 const supported=['youtube.com','youtu.be','instagram.com','tiktok.com','facebook.com','fb.watch'];
 if(url.protocol!=='https:'||url.username||url.password||url.port||!supported.some(h=>url.hostname===h||url.hostname.endsWith('.'+h))){showLinkState('error','Usa un enlace HTTPS de YouTube, TikTok, Instagram o Facebook.');return;}
 showLinkState('loading','Reconociendo video… Estamos comprobando el enlace.');
 checkRequest=new AbortController();const request=checkRequest;
 const timeout=setTimeout(()=>request.abort(),65000);
 try{
 const response=await fetch('/api/inspect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:value}),signal:request.signal});
 if(response.status===404)throw Error('El servidor está desactualizado. Reinicia Dressapp con iniciar.cmd y recarga esta página.');
 const info=await response.json();if(version!==checkVersion)return;
 if(!response.ok)throw Error(info.error||'No pudimos reconocer este video.');
 confirmed={...info,url:value};
 const seconds=info.duration?` · ${Math.floor(info.duration/60)}:${String(Math.floor(info.duration%60)).padStart(2,'0')}`:'';
 showLinkState('valid',`✓ Video reconocido · ${info.platform}${seconds}\n${info.title}`);updateSubmit();
 expiryTimer=setTimeout(()=>{confirmed=null;updateSubmit();showLinkState('error','La verificación caducó. Pulsa «Verificar de nuevo».');},Math.max(0,info.expires-Date.now()));
 }catch(e){if(version===checkVersion)showLinkState('error',request.signal.aborted?'La comprobación tardó demasiado. Puedes verificar de nuevo.':e.message);}
 finally{clearTimeout(timeout);if(version===checkVersion)updateSubmit();}
}
urlInput.setAttribute('aria-describedby','link-status');
urlInput.addEventListener('input',event=>{++checkVersion;checkRequest?.abort();clearTimeout(checkTimer);clearTimeout(expiryTimer);confirmed=null;updateSubmit();showLinkState('','');if(urlInput.value.trim())checkTimer=setTimeout(recognize,event.inputType==='insertFromPaste'?0:250);});
const verifyAgain=document.createElement('button');verifyAgain.type='button';verifyAgain.className='verify-again';verifyAgain.hidden=true;const retryIcon=document.createElement('i');retryIcon.textContent='↻';retryIcon.setAttribute('aria-hidden','true');const retryLabel=document.createElement('span');retryLabel.textContent='Volver a verificar';verifyAgain.append(retryIcon,retryLabel);verifyAgain.onclick=recognize;linkStatus.after(verifyAgain);
format.onchange=()=>{
 quality.disabled=format.value==='mp3';
 document.querySelector('#format-hint').textContent=format.value==='mp3'?'Solo audio en MP3 a 192 kbps.':'Video con audio en un archivo MP4.';
 submit.textContent=`Descargar ${format.value.toUpperCase()} ↓`;
};
document.querySelector('#paste').onclick=async()=>{
 try{urlInput.value=await navigator.clipboard.readText();recognize();}
 catch{msg.textContent='Usa Ctrl + V para pegar tu enlace.';}
};
form.onsubmit=async e=>{
 e.preventDefault();msg.textContent='';updateSubmit();if(submit.disabled)return;submitting=true;updateSubmit();
 try{
 const r=await fetch('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:urlInput.value.trim(),token:confirmed.token,quality:quality.value,format:format.value}),signal:AbortSignal.timeout(10000)});
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
 const a=document.createElement('a');a.href='/files/'+j.id;a.textContent=`Guardar ${label} ↓`;a.download=data.file;card.append(a);
 }else if(data.status==='error'){
 if(data.details){const details=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='Ver detalle técnico';pre.textContent=data.details;pre.style.whiteSpace='pre-wrap';details.append(summary,pre);card.append(details);}
 const retry=document.createElement('button');retry.className='paste';retry.textContent='Verificar para reintentar';retry.onclick=()=>{urlInput.value=j.url;format.value=j.format||'mp4';quality.value=j.quality;format.dispatchEvent(new Event('change'));quality.dispatchEvent(new Event('change'));recognize();form.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});};card.append(retry);
 }else setTimeout(poll,1200);
 }catch{title.textContent='Conexión con la app perdida';progress.hidden=true;status.textContent='Reinicia la app y vuelve a intentar la descarga.';}
 }
 poll();
 }catch(e){msg.textContent=e.message;}finally{submitting=false;updateSubmit();}
};
updateSubmit();if(urlInput.value.trim())recognize();
