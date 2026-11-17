import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createApp} from './server.mjs';
const app=createApp();await new Promise(r=>app.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${app.address().port}`;
after(()=>new Promise(r=>app.close(r)));
test('Manifiesto instalable y PNG de tamaños correctos',async()=>{
 const response=await fetch(base+'/manifest.webmanifest');assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/manifest\+json/);
 const manifest=await response.json();assert.equal(manifest.name,'Dressapp');assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');
 for(const [url,size] of [...manifest.icons.map(i=>[i.src,Number(i.sizes.split('x')[0])]),['/apple-touch-icon.png',180]]){
 const r=await fetch(base+url);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');
 const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);
 }
 const html=await(await fetch(base)).text();assert.match(html,/rel="manifest"/);assert.match(html,/id="install-app"/);assert.match(html,/id="install-dialog"/);
});
test('Todos los archivos de la app offline se sirven correctamente',async()=>{
 const sw=await fetch(base+'/sw.js');assert.equal(sw.status,200);assert.equal(sw.headers.get('service-worker-allowed'),'/');
 const source=await sw.text();const handlers={};let assets;
 vm.runInNewContext(source,{self:{addEventListener:(name,handler)=>handlers[name]=handler},caches:{open:async()=>({addAll:async list=>{assets=list;}})}});
 let done;handlers.install({waitUntil:promise=>done=promise});await done;
 assert.ok(assets.includes('/install.js'));assert.ok(assets.includes('/mobile.css'));
 for(const asset of assets)assert.equal((await fetch(base+asset)).status,200,asset);
});
test('El service worker no intercepta API, descargas, rangos ni otros orígenes',async()=>{
 const handlers={};const source=await readFile('public/sw.js','utf8');
 vm.runInNewContext(source,{URL,self:{location:{origin:base},addEventListener:(name,handler)=>handlers[name]=handler}});
 for(const [url,method,headers] of [[base+'/api/inspect','POST',{}],[base+'/api/jobs/123','GET',{}],[base+'/files/123','GET',{}],[base+'/preview/123','GET',{}],['https://example.com/','GET',{}],[base+'/','GET',{Range:'bytes=0-10'}]]){
 let intercepted=false;handlers.fetch({request:new Request(url,{method,headers}),respondWith:()=>intercepted=true});assert.equal(intercepted,false,url);
 }
});
test('La interfaz conserva acceso offline cuando el servidor no responde',async()=>{
 const handlers={};const source=await readFile('public/sw.js','utf8');let touched=false;
 vm.runInNewContext(source,{URL,self:{location:{origin:base},addEventListener:(name,handler)=>handlers[name]=handler},fetch:async()=>{throw Error('offline');},caches:{open:async()=>({match:async pathname=>{assert.equal(pathname,'/');touched=true;return new Response('<h1>Dressapp</h1>');}})}});
 let response;handlers.fetch({request:new Request(base+'/'),respondWith:promise=>response=promise});assert.match(await(await response).text(),/Dressapp/);assert.equal(touched,true);
});
