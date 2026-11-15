import {DurableObject,WorkerEntrypoint} from 'cloudflare:workers';
import {boundedScanBody,scanMetadata,engineHealth,freshScanEngine,scanKeyId,PRIVATE_SCAN_PROTOCOL,MAX_DOCUMENT_BYTES,MAX_SCAN_RESPONSE_BYTES,SCANNER_BASE_IMAGE_DIGEST} from '../../../packages/marketing/private-scan';
import {digest} from '../../../packages/auth/crypto';

interface ScannerEnv{
 ENGINE:DurableObjectNamespace<ClamAvContainer>;
 SCANNER_SIGNING_PRIVATE_KEY:string;
 SCANNER_SOURCE_SHA:string;
}
const engineJson=async(response:Response)=>JSON.parse(new TextDecoder().decode(await boundedScanBody(response.body,MAX_SCAN_RESPONSE_BYTES)));
/** The only allowed network egress is public antivirus definition downloads. */
export class SignatureDownloads extends WorkerEntrypoint<ScannerEnv>{
 async fetch(request:Request){
  const url=new URL(request.url);
  if(url.hostname!=='database.clamav.net'||url.search||url.username||url.password||
   !['GET','HEAD'].includes(request.method)||!/^\/(?:daily|main|bytecode)(?:-\d{1,8})?\.(?:cvd|cld|cdiff)$/.test(url.pathname))
   return new Response('Forbidden',{status:403});
  const headers=new Headers({'User-Agent':'ProInspect-private-ClamAV-updater','Accept-Encoding':'identity'});
  const range=request.headers.get('Range');if(range&&/^bytes=\d{1,12}-\d{0,12}$/.test(range))headers.set('Range',range);
  return fetch('https://database.clamav.net'+url.pathname,{method:request.method,headers,redirect:'manual'});
 }
}
/** One bounded engine per environment; no application records or file storage. */
export class ClamAvContainer extends DurableObject<ScannerEnv>{
 private starting?:Promise<void>;
 private async ready(){
  const container=this.ctx.container;if(!container)throw Error('SCANNER_CONTAINER_MISSING');
  if(!this.starting)this.starting=(async()=>{
   if(container.running&&(await container.inspect())?.image!==container.images.base)await container.destroy();
   if(!container.running){
    const downloads=(this.ctx.exports as unknown as {SignatureDownloads:Fetcher}).SignatureDownloads;
    await container.interceptOutboundHttp('database.clamav.net',downloads);
    await container.interceptOutboundHttps('database.clamav.net',downloads);
    container.start({image:container.images.base,instance:'standard-1',enableInternet:false});
    this.ctx.waitUntil(container.monitor().catch(()=>{console.error(JSON.stringify({event:'scanner.container_stopped'}));}));
   }
   await container.setInactivityTimeout(60000);
   const until=Date.now()+110000;
   while(Date.now()<until){
    try{const response=await container.getTcpPort(8080).fetch('http://engine/health',{signal:AbortSignal.timeout(3000)});
     if(response.ok&&freshScanEngine(engineHealth.parse(await engineJson(response))))return;
    }catch{/* A cold engine remains unavailable until current definitions load. */}
    await new Promise(resolve=>setTimeout(resolve,500));
   }
   throw Error('SCANNER_NOT_READY');
  })().catch(error=>{this.starting=undefined;throw error;});
  await this.starting;
 }
 async fetch(request:Request){
  await this.ready();
  const container=this.ctx.container;if(!container)throw Error('SCANNER_CONTAINER_MISSING');
  if(!container.running){this.starting=undefined;await this.ready();}
  await container.setInactivityTimeout(60000);
  return container.getTcpPort(8080).fetch(request,{signal:AbortSignal.timeout(45000)});
 }
}
async function signed(env:ScannerEnv,value:Record<string,unknown>){
 const jwk=JSON.parse(env.SCANNER_SIGNING_PRIVATE_KEY);
 const publicKey={kty:jwk.kty,crv:jwk.crv,x:jwk.x,y:jwk.y};
 const raw=JSON.stringify({...value,protocol:PRIVATE_SCAN_PROTOCOL,sourceSha:env.SCANNER_SOURCE_SHA,baseImageDigest:SCANNER_BASE_IMAGE_DIGEST,keyId:await scanKeyId(publicKey),eventId:crypto.randomUUID(),checkedAt:new Date().toISOString()});
 const timestamp=Math.floor(Date.now()/1000).toString();
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const bytes=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(timestamp+'.'+raw)));
 const signature=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
 return new Response(raw,{headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-ProInspect-Scan-Time':timestamp,'X-ProInspect-Scan-Signature':signature}});
}
export default {
 async fetch(request:Request,env:ScannerEnv):Promise<Response>{
  try{
   const path=new URL(request.url).pathname;
   if(!env.SCANNER_SIGNING_PRIVATE_KEY||!/^[a-f0-9]{40}$/.test(env.SCANNER_SOURCE_SHA??''))return new Response('Unavailable',{status:503});
   const nonce=request.headers.get('X-ProInspect-Scan-Nonce')??'';
   if(!/^[a-f0-9-]{36}$/i.test(nonce))return new Response('Invalid request',{status:400});
   const engine=env.ENGINE.getByName('private-clamav-v1');
   if(path==='/health'&&request.method==='GET'){
    const response=await engine.fetch('http://engine/health');
    if(!response.ok)throw Error('ENGINE_UNAVAILABLE');
    const health=engineHealth.parse(await engineJson(response));if(!freshScanEngine(health))throw Error('SIGNATURES_STALE');
    return signed(env,{kind:'health',nonce,engine:health});
   }
   if(path!=='/scan'||request.method!=='POST')return new Response('Not found',{status:404});
   const encoded=request.headers.get('X-ProInspect-Scan-Metadata')??'';
   if(encoded.length>2048)return new Response('Invalid metadata',{status:400});
   const meta=scanMetadata.parse(JSON.parse(atob(encoded)));
   if(meta.nonce!==nonce)return new Response('Invalid nonce',{status:400});
   const bytes=await boundedScanBody(request.body,MAX_DOCUMENT_BYTES);
   if(bytes.length!==meta.sizeBytes||await digest(bytes.buffer)!==meta.sha256)return new Response('Digest mismatch',{status:400});
   const response=await engine.fetch(new Request('http://engine/scan',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Expected-SHA256':meta.sha256},body:bytes}));
   if(!response.ok)throw Error('ENGINE_UNAVAILABLE');
   const result=await engineJson(response) as {engine:unknown;verdict:string;complete:boolean;sha256:string};
   const health=engineHealth.parse(result.engine);
   if(!freshScanEngine(health)||result.sha256!==meta.sha256||!['clean','unsafe','error'].includes(result.verdict)||result.verdict==='clean'&&result.complete!==true)throw Error('ENGINE_ATTESTATION_INVALID');
   return signed(env,{kind:'scan',nonce,documentId:meta.documentId,sha256:meta.sha256,verdict:result.verdict,complete:result.complete===true,engine:health});
  }catch{
   console.error(JSON.stringify({event:'scanner.request_failed',code:'SCANNER_UNAVAILABLE'}));
   return new Response('Scanner unavailable',{status:503,headers:{'Cache-Control':'no-store'}});
  }
 }
} satisfies ExportedHandler<ScannerEnv>;
