#!/usr/bin/env node
/** Final GO gate: schema + physical redacted proofs + independent environment
 * approval. This never performs provider actions or production data writes. */
import { readFileSync, existsSync, lstatSync, realpathSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assess, CASES, ROLES } from './acceptance-gate.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const safe = x => typeof x === 'string' && /^artifacts\/portal-acceptance\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:json|png|jpg|pdf)$/.test(x) && !x.includes('..');
const secrets = /(?:sk_(?:test|live)_[a-z0-9]{8,}|whsec_[a-z0-9]{8,}|-----BEGIN (?:RSA )?PRIVATE KEY-----|[?&](?:token|code|session|secret|password)=|(?:cookie|authorization|set-cookie)\s*:)/i;
export function verifyFiles(evidence, cwd = process.cwd()) {
  const refs = new Set();
  const cases = new Set();
  const identities = new Set();
  for (const role of ROLES) {
    const ref=evidence.identities?.[role]?.evidenceRef;
    if(!safe(ref)||identities.has(ref))throw new Error(`Distinct redacted identity evidence required: ${role}`);
    refs.add(ref);identities.add(ref);
  }
  for (const id of CASES) {
    const ref=evidence.cases?.[id]?.evidenceRef;
    if(!safe(ref)||cases.has(ref))throw new Error(`Distinct redacted case evidence required: ${id}`);
    refs.add(ref);cases.add(ref);
  }
  for (const x of Object.values(evidence.criteria||{}))refs.add(x.evidenceRef);
  refs.add(evidence.deployment?.evidenceRef);refs.add(evidence.releaseReview?.evidenceRef);
  const digests=evidence.evidenceDigests;
  if(!digests||typeof digests!=='object'||Array.isArray(digests))throw new Error('Evidence digests required');
  const root=resolve(cwd,'artifacts/portal-acceptance');
  for(const ref of refs){
    if(!safe(ref))throw new Error(`Unsafe or unsupported evidence reference: ${ref}`);
    const absolute=resolve(cwd,ref);
    if(!absolute.startsWith(root+sep) || !existsSync(absolute))throw new Error(`Missing evidence file: ${ref}`);
    const meta=lstatSync(absolute);
    if(!meta.isFile()||meta.isSymbolicLink()||meta.size>4*1024*1024||meta.size<2)
      throw new Error(`Invalid evidence file: ${ref}`);
    const real=realpathSync(absolute);
    if(!real.startsWith(realpathSync(root)+sep))throw new Error(`Evidence escapes approved directory: ${ref}`);
    const body=readFileSync(absolute);
    if(!/^[a-f0-9]{64}$/.test(digests[ref]||'')||hash(body)!==digests[ref])
      throw new Error(`Evidence digest mismatch: ${ref}`);
    if(ref.endsWith('.json')){
      const text=body.toString('utf8');
      if(secrets.test(text))throw new Error(`Secret-shaped content in evidence file: ${ref}`);
      JSON.parse(text);
    }
  }
  for (const id of CASES) {
    const x=JSON.parse(readFileSync(resolve(cwd,evidence.cases[id].evidenceRef),'utf8'));
    if (x.caseId!==id || x.sourceSha!==evidence.sourceSha || x.environment!=='production' ||
      x.dataMode!=='approved-synthetic' || x.positiveAccessChecked!==true ||
      x.negativeAccessChecked!==true || x.cleanupConfirmed!==true || x.executionComplete!==true ||
      x.reviewStatus!=='approved-independent-review')throw new Error(`Incomplete or unapproved hosted case proof: ${id}`);
  }
  for (const role of ROLES) {
    const x=JSON.parse(readFileSync(resolve(cwd,evidence.identities[role].evidenceRef),'utf8'));
    if (x.role!==role || x.sourceSha!==evidence.sourceSha || x.sessionJourneyObserved!==true ||
      x.initialAnonymous!==true || x.authenticated!==true ||
      x.unrelatedWorkspaceDenied!==true || x.signoutRevokedSession!==true ||
      x.humanTurnstileAndEmailLinkConfirmed!==true)
      throw new Error(`Incomplete real hosted sign-in proof: ${role}`);
  }
  return {validatedEvidenceFiles:refs.size,identityFiles:identities.size,caseFiles:cases.size};
}
export function judgeLaunch(evidence, expectedSha, { cwd=process.cwd(), protectedReview=false, now=Date.now() } = {}) {
  const schema=assess(evidence,expectedSha,now);
  if(!schema.acceptedForProduction)throw new Error(`NO GO: ${schema.counts.criteriaPassed}/12 criteria, ${schema.counts.casesPassed}/12 cases, ${schema.counts.identitiesPassed}/8 identity proofs`);
  if(!protectedReview)throw new Error('NO GO: independently protected production-acceptance environment approval required');
  const identityRefs=new Set(ROLES.map(role=>evidence.identities[role].identityRef));
  if(identityRefs.has(evidence.releaseReview.reviewerRef))throw new Error('NO GO: release reviewer must be independent from tested identities');
  const verified=verifyFiles(evidence,cwd);
  return {...verified,sourceSha:expectedSha,acceptedForProduction:true,observedAt:new Date(now).toISOString()};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const input=process.argv[2],sha=process.argv[3];
  if(!input||!/^[a-f0-9]{40}$/.test(sha||''))throw new Error('Usage: verify-launch-evidence.mjs evidence.json <deployed-40-char-sha>');
  const evidence=JSON.parse(readFileSync(input,'utf8'));
  const decision=judgeLaunch(evidence,sha,{protectedReview:process.env.PROINSPECT_PROTECTED_REVIEW_APPROVED==='true'});
  mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/eight-portal-launch-decision.json',JSON.stringify(decision,null,2)+'\n');
  console.log('GO: independently reviewed and bound acceptance evidence:',decision.validatedEvidenceFiles,'files');
 }catch(error){
  mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/eight-portal-launch-decision.json',JSON.stringify({acceptedForProduction:false,reason:String(error.message||error)},null,2)+'\n');
  console.error('NO GO:',error.message);process.exitCode=1;
 }
}
