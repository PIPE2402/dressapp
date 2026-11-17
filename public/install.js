(()=>{
 const button=document.querySelector('#install-app'),dialog=document.querySelector('#install-dialog'),steps=document.querySelector('#install-steps');
 let prompt;
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 function sync(){button.hidden=standalone();}
 addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event;sync();});
 addEventListener('appinstalled',()=>{prompt=null;button.hidden=true;dialog.close();});
 button.onclick=async()=>{
 if(prompt){const current=prompt;prompt=null;try{await current.prompt();const result=await current.userChoice;if(result.outcome==='accepted')button.hidden=true;}catch{showHelp();}return;}
 showHelp();
 };
 function showHelp(){
 steps.replaceChildren();
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const android=/Android/i.test(navigator.userAgent);
 const instructions=!isSecureContext?[
 'La instalación necesita una dirección HTTPS accesible desde este dispositivo.',
 'El servidor debe permanecer encendido para reconocer y descargar videos.',
 'En el celular, localhost se refiere al propio celular: no abre el servidor de tu computadora.'
 ]:ios?[
 'Abre esta misma dirección en Safari.',
 'Pulsa Compartir y selecciona «Añadir a la pantalla de inicio».',
 'Si aparece «Abrir como app web», actívalo y pulsa Añadir.'
 ]:android?[
 'Abre esta misma dirección en Chrome.',
 'Abre el menú ⋮ y pulsa «Instalar aplicación» o «Añadir a pantalla de inicio».',
 'Confirma para añadir Dressapp a tus aplicaciones.'
 ]:[
 'Abre Dressapp en Chrome o Edge. En Mac también puedes usar Safari.',
 'En Chrome o Edge, busca «Instalar Dressapp» en el menú del navegador o la barra de direcciones.',
 'En Safari de Mac, utiliza Archivo → Añadir al Dock.'
 ];
 for(const instruction of instructions){const li=document.createElement('li');li.textContent=instruction;steps.append(li);}
 dialog.showModal();
 }
 document.querySelector('#close-install').onclick=()=>dialog.close();
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 const offline=document.querySelector('#offline-banner');
 function connection(){offline.hidden=navigator.onLine;}
 addEventListener('online',connection);addEventListener('offline',connection);connection();sync();
 matchMedia('(display-mode: standalone)').addEventListener('change',sync);
 if('serviceWorker' in navigator&&isSecureContext)navigator.serviceWorker.register('/sw.js').catch(()=>{
 document.querySelector('#install-note').textContent='No se pudo preparar el acceso sin conexión. Puedes seguir usando la web y volver a intentarlo al recargar.';
 });
})();
