const CACHE='dressapp-shell-v1';
const SHELL=['/','/style.css','/effects.css','/refined.css','/mobile.css','/app.js','/controls.js','/install.js','/manifest.webmanifest','/icon-192.png','/icon-512.png','/icon-maskable.png','/apple-touch-icon.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('dressapp-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})());});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!SHELL.includes(url.pathname)||event.request.headers.has('range'))return;
 event.respondWith((async()=>{
 const cache=await caches.open(CACHE);
 try{const response=await fetch(event.request);if(response.ok)await cache.put(url.pathname,response.clone());return response;}
 catch(error){const saved=await cache.match(url.pathname);if(saved)return saved;throw error;}
 })());
});
