/** Temporary authenticated release probe. Only built-in synthetic fixtures;
 * no arbitrary upload/proxy endpoint and no application or storage bindings.
 * Delete this helper Worker immediately after collecting release evidence. */
import {digest} from '../../packages/auth/crypto';
interface ProbeEnv {PRIVATE_DOCUMENT_SCANNER:Fetcher;PROBE_TOKEN:string;SCANNER_WORKER_NAME:string}
export default {async fetch(request:Request,env:ProbeEnv){
 if(request.method!=='GET'||new URL(request.url).pathname!=='/__probe'||env.PROBE_TOKEN.length<32||request.headers.get('Authorization')!=='Bearer '+env.PROBE_TOKEN)return new Response('Not found',{status:404});
 const evidence:unknown[]=[];
 const capture=async(response:Response,nonce:string,metadata?:unknown)=>{
  const raw=await response.text();if(raw.length>8192)throw Error('PROBE_RESPONSE_SIZE');
  evidence.push({status:response.status,nonce,metadata,raw,timestamp:response.headers.get('X-ProInspect-Scan-Time'),signature:response.headers.get('X-ProInspect-Scan-Signature')});
 };
 try{
  const nonce=crypto.randomUUID();await capture(await env.PRIVATE_DOCUMENT_SCANNER.fetch('https://private-scanner/health',{headers:{'X-ProInspect-Scan-Nonce':nonce}}),nonce);
  const fixtures=['%PDF-1.4\nProInspect synthetic clean scanner release fixture.\n%%EOF\n','X5O!P%@AP[4'+'\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'];
  for(let i=0;i<fixtures.length;i++){
   const bytes=new TextEncoder().encode(fixtures[i]),nonce=crypto.randomUUID();
   const metadata={nonce,documentId:i===0?'probe_clean_fixture':'probe_eicar_fixture',sha256:await digest(bytes.buffer),sizeBytes:bytes.length,contentType:'application/octet-stream'};
   await capture(await env.PRIVATE_DOCUMENT_SCANNER.fetch('https://private-scanner/scan',{method:'POST',headers:{'X-ProInspect-Scan-Nonce':nonce,'X-ProInspect-Scan-Metadata':btoa(JSON.stringify(metadata))},body:bytes}),nonce,metadata);
  }
  const nonceBad=crypto.randomUUID(),metadata={nonce:nonceBad,documentId:'probe_bad_digest',sha256:'0'.repeat(64),sizeBytes:4,contentType:'application/octet-stream'};
  const bad=await env.PRIVATE_DOCUMENT_SCANNER.fetch('https://private-scanner/scan',{method:'POST',headers:{'X-ProInspect-Scan-Nonce':nonceBad,'X-ProInspect-Scan-Metadata':btoa(JSON.stringify(metadata))},body:'test'});
  return Response.json({synthetic:true,scannerWorker:env.SCANNER_WORKER_NAME,collectedAt:new Date().toISOString(),evidence,digestMismatchBlocked:bad.status===400},{headers:{'Cache-Control':'no-store'}});
 }catch{return new Response('Private scanner validation failed',{status:503,headers:{'Cache-Control':'no-store'}});}
}} satisfies ExportedHandler<ProbeEnv>;
