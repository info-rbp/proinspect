import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { createServer } from 'node:net';
test('actual Node React Router build serves safe pages, assets and rejects operational routes',async()=>{
 const port=await new Promise(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const child=spawn(process.execPath,['apps/platform/node/server.mjs'],{env:{...process.env,FOUNDATION_PROOF:'true',FOUNDATION_ENV:'dev',BUILD_SHA:'15382bea37d05b0a9533b040e6d79591a7883442',PORT:String(port),HOST:'127.0.0.1'},stdio:'pipe'});
 const origin=`http://127.0.0.1:${port}`;
 try {
  let ready=false;for(let i=0;i<60;i++){try{ready=(await fetch(origin+'/healthz')).ok;}catch{}if(ready)break;await setTimeout(100);}
  assert.ok(ready,'server starts');
  const health=await (await fetch(origin+'/healthz')).json();assert.equal(health.operationalRoutes,false);
  for(const path of ['/about','/how-it-works','/why-proinspect']){
   const r=await fetch(origin+path);assert.equal(r.status,200);const html=await r.text();assert.match(html,/ProInspect/);
   assert.equal(r.headers.get('x-robots-tag'),'noindex, nofollow');
   const nonce=r.headers.get('content-security-policy').match(/'nonce-([^']+)'/)[1];assert.ok(html.includes(`nonce="${nonce}"`));
   const asset=html.match(/(?:href|src)="(\/assets\/[^\"]+\.css)"/)?.[1];assert.ok(asset);assert.equal((await fetch(origin+asset)).status,200);
  }
  for(const path of ['/signin','/api/health','/w/staff/operations','/about?_data=routes/about','/.env','/node/server.mjs','/assets/%2e%2e/%2e%2e/package.json'])assert.equal((await fetch(origin+path)).status,503,path);
  assert.equal((await fetch(origin+'/about',{method:'POST',body:'synthetic'})).status,405);
  assert.equal((await fetch(origin+'/internal/proof',{method:'POST'})).status,204);
 }finally{child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
});
