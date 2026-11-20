import test from 'node:test';
import assert from 'node:assert/strict';
import {scanKeyId,verifyPrivateScanResponse,MAX_SCAN_RESPONSE_BYTES,engineHealth,SCANNER_BASE_IMAGE_DIGEST} from '../packages/marketing/private-scan.ts';

const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const publicKey=await crypto.subtle.exportKey('jwk',pair.publicKey);
const nonce=crypto.randomUUID(),sha256='b'.repeat(64),documentId='rad_synthetic_document';
const expected={nonce,sha256,documentId,sizeBytes:12,contentType:'application/pdf' as const};
const keyId=await scanKeyId(publicKey),clock=Date.now();
async function response(overrides:Record<string,unknown>={},timestamp=Math.floor(clock/1000).toString()){
 const raw=JSON.stringify({protocol:'proinspect-private-scan-v1',kind:'scan',sourceSha:'a'.repeat(40),baseImageDigest:SCANNER_BASE_IMAGE_DIGEST,nonce,keyId,eventId:crypto.randomUUID(),checkedAt:new Date(clock).toISOString(),
  documentId,sha256,verdict:'clean',complete:true,engine:{engineVersion:'ClamAV 1.5.4',databaseVersion:12345,definitionsUpdatedAt:new Date(clock-3600000).toISOString()},...overrides});
 const signature=Buffer.from(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,new TextEncoder().encode(timestamp+'.'+raw))).toString('base64url');
 return new Response(raw,{headers:{'X-ProInspect-Scan-Time':timestamp,'X-ProInspect-Scan-Signature':signature}});
}
test('private scanner accepts exact signed complete clean results and retains unsafe verdicts',async()=>{
 assert.equal((await verifyPrivateScanResponse(await response(),publicKey,nonce,expected,clock)).verdict,'clean');
 assert.equal((await verifyPrivateScanResponse(await response({verdict:'unsafe'}),publicKey,nonce,expected,clock)).verdict,'unsafe');
});
test('forgery, stale signatures, replay for another nonce and another file cannot clear quarantine',async()=>{
 const signed=await response(),headers=new Headers(signed.headers),raw=await signed.text();
 await assert.rejects(()=>verifyPrivateScanResponse(new Response(raw.replace('"clean"','"unsafe"'),{headers}),publicKey,nonce,expected,clock));
 await assert.rejects(async()=>verifyPrivateScanResponse(await response({},String(Math.floor(clock/1000)-301)),publicKey,nonce,expected,clock));
 await assert.rejects(async()=>verifyPrivateScanResponse(await response({nonce:crypto.randomUUID()}),publicKey,nonce,expected,clock));
 for(const changed of [{documentId:'rad_other_document'},{sha256:'c'.repeat(64)},{complete:false},{keyId:'d'.repeat(64)}])
  await assert.rejects(async()=>verifyPrivateScanResponse(await response(changed),publicKey,nonce,expected,clock));
});
test('outdated or stale engines, oversized and unavailable responses fail closed',async()=>{
 assert.equal(engineHealth.safeParse({engineVersion:'ClamAV 1.5.3',databaseVersion:1,definitionsUpdatedAt:new Date(clock).toISOString()}).success,false);
 await assert.rejects(async()=>verifyPrivateScanResponse(await response({engine:{engineVersion:'ClamAV 1.5.4',databaseVersion:1,definitionsUpdatedAt:new Date(clock-73*3600000).toISOString()}}),publicKey,nonce,expected,clock));
 await assert.rejects(()=>verifyPrivateScanResponse(new Response('x'.repeat(MAX_SCAN_RESPONSE_BYTES+1)),publicKey,nonce,expected,clock));
 await assert.rejects(()=>verifyPrivateScanResponse(new Response('unavailable',{status:503}),publicKey,nonce,expected,clock));
 const other=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 await assert.rejects(async()=>verifyPrivateScanResponse(await response(),await crypto.subtle.exportKey('jwk',other.publicKey),nonce,expected,clock));
});
