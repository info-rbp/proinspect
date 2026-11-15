import {z} from 'zod';
import {digest} from '../auth/crypto.ts';

export const MAX_DOCUMENT_BYTES=8*1024*1024;
export const MAX_SCAN_RESPONSE_BYTES=8192;
export const MAX_SIGNATURE_AGE_MS=72*3600000;
export const PRIVATE_SCAN_PROTOCOL='proinspect-private-scan-v1';
export const SCANNER_BASE_IMAGE_DIGEST='45fe5149fbee5a46509c9848ef20d0c354b7b2323c9369f285939a37cf33422a';
export const scanMetadata=z.object({
 nonce:z.uuid(),documentId:z.string().regex(/^[a-zA-Z0-9_-]{5,100}$/),
 sha256:z.string().regex(/^[a-f0-9]{64}$/),sizeBytes:z.number().int().min(1).max(MAX_DOCUMENT_BYTES),
 contentType:z.enum(['application/pdf','image/jpeg','image/png','image/webp','application/octet-stream'])
}).strict();
export const engineHealth=z.object({
 engineVersion:z.string().regex(/^ClamAV 1\.(?:5|[6-9])\.\d+$/).refine(v=>{
  const [,minor,patch]=v.replace('ClamAV ','').split('.').map(Number);return minor>5||patch>=4;
 }),
 databaseVersion:z.number().int().positive(),definitionsUpdatedAt:z.iso.datetime(),
}).strict();
export const scanEvidence=z.object({
 protocol:z.literal(PRIVATE_SCAN_PROTOCOL),kind:z.enum(['health','scan']),
 sourceSha:z.string().regex(/^[a-f0-9]{40}$/),baseImageDigest:z.literal(SCANNER_BASE_IMAGE_DIGEST),
 nonce:z.uuid(),keyId:z.string().regex(/^[a-f0-9]{64}$/),eventId:z.uuid(),
 checkedAt:z.iso.datetime(),engine:engineHealth,
 documentId:z.string().optional(),sha256:z.string().regex(/^[a-f0-9]{64}$/).optional(),
 verdict:z.enum(['clean','unsafe','error']).optional(),complete:z.boolean().optional(),
}).strict();
export type PrivateScanEvidence=z.infer<typeof scanEvidence>;
export type PrivateScanMetadata=z.infer<typeof scanMetadata>;
export function publicScanKey(key:JsonWebKey):JsonWebKey{
 if(key.kty!=='EC'||key.crv!=='P-256'||!key.x||!key.y||key.d)throw Error('SCAN_PUBLIC_KEY_INVALID');
 return {kty:'EC',crv:'P-256',x:key.x,y:key.y,ext:true,key_ops:['verify']};
}
export const scanKeyId=(key:JsonWebKey)=>digest(JSON.stringify(publicScanKey(key)));
export function freshScanEngine(engine:z.infer<typeof engineHealth>,at=Date.now()){
 const age=at-Date.parse(engine.definitionsUpdatedAt);
 return Number.isFinite(age)&&age>=-300000&&age<=MAX_SIGNATURE_AGE_MS;
}
export async function boundedScanBody(body:ReadableStream<Uint8Array>|null,max:number){
 if(!body)throw Error('SCAN_BODY_MISSING');
 const reader=body.getReader(),parts:Uint8Array[]=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>max){await reader.cancel();throw Error('SCAN_BODY_TOO_LARGE');}parts.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;
}
export async function verifyPrivateScanResponse(response:Response,key:JsonWebKey,nonce:string,expected?:PrivateScanMetadata,at=Date.now(),release?:{sourceSha:string;baseImageDigest:string}){
 if(!response.ok)throw Error('PRIVATE_SCANNER_UNAVAILABLE');
 const bytes=await boundedScanBody(response.body,MAX_SCAN_RESPONSE_BYTES),raw=new TextDecoder().decode(bytes);
 const timestamp=response.headers.get('X-ProInspect-Scan-Time')??'',signature=response.headers.get('X-ProInspect-Scan-Signature')??'';
 if(!/^\d{10}$/.test(timestamp)||Math.abs(at-Number(timestamp)*1000)>300000)throw Error('SCAN_ATTESTATION_EXPIRED');
 if(!/^[A-Za-z0-9_-]{86}$/.test(signature))throw Error('SCAN_ATTESTATION_INVALID');
 const normalized=signature.replaceAll('-','+').replaceAll('_','/'),sig=Uint8Array.from(atob(normalized+'=='),c=>c.charCodeAt(0));
 const publicKey=await crypto.subtle.importKey('jwk',publicScanKey(key),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},publicKey,sig,new TextEncoder().encode(timestamp+'.'+raw)))throw Error('SCAN_ATTESTATION_INVALID');
 const evidence=scanEvidence.parse(JSON.parse(raw));
 if(release&&(evidence.sourceSha!==release.sourceSha||evidence.baseImageDigest!==release.baseImageDigest))throw Error('SCAN_RELEASE_MISMATCH');
 if(evidence.nonce!==nonce||evidence.keyId!==await scanKeyId(key)||Math.abs(at-Date.parse(evidence.checkedAt))>300000||!freshScanEngine(evidence.engine,at))throw Error('SCAN_ATTESTATION_MISMATCH');
 if(expected&&(evidence.kind!=='scan'||evidence.documentId!==expected.documentId||evidence.sha256!==expected.sha256||!evidence.verdict||evidence.complete!==true&&evidence.verdict==='clean'))throw Error('SCAN_DOCUMENT_MISMATCH');
 if(!expected&&evidence.kind!=='health')throw Error('SCAN_HEALTH_INVALID');
 return evidence;
}
