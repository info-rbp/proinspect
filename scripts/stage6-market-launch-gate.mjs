#!/usr/bin/env node
/** Stage 6 final evidence validator. A valid artifact is a necessary condition,
 * NOT independently verified proof that a provider performed the claimed action.
 * Run only inside the separately protected production-launch review environment.
 * No test identities, credentials, provider calls or production writes.
 */
import {readFileSync,existsSync,lstatSync,realpathSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const GATES=Object.freeze(['source_freeze','deployment','database','customer_journeys',
 'nine_portals','commercial_approval','operational_readiness','final_activation']);
const SHA=/^[0-9a-f]{40}$/;
const proofRef=x=>typeof x==='string'&&
 /^artifacts\/stage6\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.json$/.test(x)&&!x.includes('..');
const dig=x=>createHash('sha256').update(x).digest('hex');
const suspectedSecrets=x=>/(?:\b(?:sk|rk)_(?:live|test)_[a-zA-Z0-9]{8,}|whsec_[a-zA-Z0-9]{8,}|-----BEGIN (?:RSA )?PRIVATE KEY-----|[?&](?:token|code|session|secret|password)=|(?:cookie|authorization|set-cookie)\s*:)/i.test(x);
const current=(date,now)=>typeof date==='string'&&
 /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(date)&&
 Number.isFinite(Date.parse(date))&&Date.parse(date)>=now-86400000&&Date.parse(date)<=now;
export function verifyStage6Bundle(bundle,expectedSha,{cwd=process.cwd(),clock=Date.now(),protectedReview=false}={}){
 if(!protectedReview)throw Error('NO GO: independent protected production-launch review is required');
 if(!SHA.test(expectedSha||'')||bundle?.schema!==1||bundle.sourceSha!==expectedSha||
   bundle.environment!=='production'||bundle.dataMode!=='approved-real-hosted'||
   !current(bundle.observedAt,clock))throw Error('NO GO: invalid source, environment, evidence mode or observation time');
 const root=resolve(cwd,'artifacts/stage6');
 let gateCount=0;const refs=new Set();
 for(const gate of GATES){
  const review=bundle.reviews?.[gate];
  if(review?.status!=='approved'||review.sourceSha!==expectedSha||
    !current(review.reviewedAt,clock)||typeof review.ownerRef!=='string'||
    typeof review.reviewerRef!=='string'||review.ownerRef===review.reviewerRef||
    !/^[a-zA-Z0-9_.-]{4,100}$/.test(review.ownerRef)||
    !/^[a-zA-Z0-9_.-]{4,100}$/.test(review.reviewerRef)||
    !proofRef(review.evidenceRef)||!SHA.test(review.sourceSha)||
    !/^[a-f0-9]{64}$/.test(review.evidenceDigest||'')||
    refs.has(review.evidenceRef))
    throw Error('NO GO: missing distinct independent review for '+gate);
  refs.add(review.evidenceRef);
  const target=resolve(cwd,review.evidenceRef);
  if(!target.startsWith(root+sep)||!existsSync(target))throw Error('NO GO: evidence missing for '+gate);
  const st=lstatSync(target);
  if(!st.isFile()||st.isSymbolicLink()||st.size<2||st.size>4*1024*1024||
    !realpathSync(target).startsWith(realpathSync(root)+sep))throw Error('NO GO: unsafe evidence file for '+gate);
  const bytes=readFileSync(target),text=bytes.toString('utf8');
  if(dig(bytes)!==review.evidenceDigest||suspectedSecrets(text))throw Error('NO GO: tampered or sensitive evidence for '+gate);
  const evidence=JSON.parse(text);
  if(evidence.gate!==gate||evidence.sourceSha!==expectedSha||
    evidence.environment!=='production'||evidence.outcome!=='approved-independent-review'||
    evidence.reviewerRef!==review.reviewerRef||!current(evidence.observedAt,clock)||
    evidence.executionComplete!==true)
    throw Error('NO GO: unreviewed gate evidence for '+gate);
  gateCount++;
 }
 const role=bundle.hostedPortalAcceptance;
 if(!role||role.acceptedForProduction!==true||role.sourceSha!==expectedSha||
    role.identitiesPassed!==9||role.identitiesTotal!==9||role.casesPassed!==12||
    role.criteriaPassed!==12||!current(role.observedAt,clock)||
    typeof role.protectedReviewRun!=='string'||
    !/^https:\/\/github\.com\/info-rbp\/proinspect\/actions\/runs\/[1-9]\d*$/.test(role.protectedReviewRun))
   throw Error('NO GO: protected nine-portal hosted acceptance evidence is missing');
 if(bundle.defects?.some(x=>['critical','high'].includes(x.severity)&&x.status!=='resolved')||
    !Array.isArray(bundle.defects))throw Error('NO GO: unresolved critical/high defect evidence');
 return {decision:'GO',sourceSha:expectedSha,reviewedGates:gateCount,
  hostedIdentities:9,cases:12,
  caveat:'This is a verified evidence contract in a protected workflow, not a substitute for checking the authenticity of the signed source/provider/recovery proofs.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const input=process.argv[2],sha=process.argv[3]||process.env.EXPECTED_SOURCE_SHA;
 let result;
 try{
  if(!input)throw Error('NO GO: provide a separately captured redacted Stage 6 acceptance bundle');
  result=verifyStage6Bundle(JSON.parse(readFileSync(input,'utf8')),sha,
    {protectedReview:process.env.PROINSPECT_PROTECTED_LAUNCH_REVIEW==='true'});
  console.log('Stage 6 evidence gate GO for exact source '+result.sourceSha);
 }catch(e){result={decision:'NO_GO',reason:String(e.message||e)};
  console.error(result.reason);process.exitCode=1;}
 mkdirSync('artifacts',{recursive:true});
 writeFileSync('artifacts/stage6-market-launch-decision.json',JSON.stringify(result,null,2)+'\n');
}
