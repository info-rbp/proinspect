/** Verify a freshly captured LIVE private-engine proof, then prepare a disabled
 * source-specific D1 release record. Does not modify any hosted resource. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {verifyPrivateScanResponse,SCANNER_BASE_IMAGE_DIGEST,scanKeyId} from '../../packages/marketing/private-scan.ts';
import {MANAGED_RENTAL_POLICY,MANAGED_RENTAL_POLICY_VERSION} from '../../packages/marketing/managed-rental-policy.ts';

const [environment,platformSource,scannerSource,keyPath,proofPath,output]=process.argv.slice(2);
assert(['staging','production'].includes(environment));assert.match(platformSource??'',/^[a-f0-9]{40}$/);assert.match(scannerSource??'',/^[a-f0-9]{40}$/);
assert(output,'Supply the output JSON batch path');
const publicKey=JSON.parse(readFileSync(keyPath,'utf8')),proofRaw=readFileSync(proofPath,'utf8'),proof=JSON.parse(proofRaw);
const registered=JSON.parse(readFileSync(new URL('../../config/private-scanner-public-keys.json',import.meta.url),'utf8'))[environment];
assert.equal(await scanKeyId(publicKey),await scanKeyId(registered.publicJwk),'Use the existing private engine verification key, not a synthetic test key');
assert(proof.synthetic===true&&proof.digestMismatchBlocked===true&&proof.evidence.length===3);
const scannerWorker='proinspect-private-document-scanner'+(environment==='staging'?'-staging':'');assert.equal(proof.scannerWorker,scannerWorker);
assert(Math.abs(Date.now()-Date.parse(proof.collectedAt))<300000,'Collect a fresh LIVE engine proof; CI fixtures are not release evidence');
const release={sourceSha:scannerSource,baseImageDigest:SCANNER_BASE_IMAGE_DIGEST};
for(let i=0;i<proof.evidence.length;i++){
 const record=proof.evidence[i];
 const evidence=await verifyPrivateScanResponse(new Response(record.raw,{status:record.status,headers:{'X-ProInspect-Scan-Time':record.timestamp,'X-ProInspect-Scan-Signature':record.signature}}),publicKey,record.nonce,record.metadata,Date.now(),release);
 assert.equal(evidence.kind,i===0?'health':'scan');if(i>0)assert.equal(evidence.verdict,i===1?'clean':'unsafe');
}
const stamp=new Date().toISOString(),policyHash=createHash('sha256').update(JSON.stringify(MANAGED_RENTAL_POLICY)).digest('hex');
const batch=[{sql:"INSERT INTO managed_rental_document_releases(id,environment,source_sha,policy_version,policy_sha256,intake_mode,scanner_worker_name,scanner_source_sha,scanner_image_digest,scanner_key_id,scanner_public_jwk,scanner_test_sha256,scanner_verified_at,authorized_by,authorization_reference,enabled,created_at) VALUES(?,?,?,?,?,'scanned_documents',?,?,?,?,?,?,?,?,?,0,?)",params:['mdr_'+randomUUID(),environment,platformSource,MANAGED_RENTAL_POLICY_VERSION,policyHash,scannerWorker,scannerSource,SCANNER_BASE_IMAGE_DIGEST,await scanKeyId(publicKey),JSON.stringify(publicKey),createHash('sha256').update(proofRaw).digest('hex'),stamp,'owner:Gianpaulo Coletti','Owner request: private scanning and managed-property supporting-document uploads; no independent review represented',stamp]}];
writeFileSync(output,JSON.stringify({batch},null,2)+'\n',{mode:0o600});console.log('Verified live private-engine proof; prepared disabled release for '+platformSource);
