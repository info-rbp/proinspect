/** Exact evidence gates for the 110-task full-scope release. Never certifies CI as acceptance. */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateHandbook} from './handbook-check.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const json=(p)=>JSON.parse(readFileSync(path.join(root,p),'utf8'));
export const RELEASE_WORKSTREAMS=Object.freeze(['WS00','WS01','WS02','WS03','WS04','WS05','WS06','WS07','WS08','WS09']);
export function releaseReadiness(register,traceability,sourceSha,rootDirectory=root){
 const structural=validateHandbook(register,traceability,rootDirectory);
 const fullSha=/^[a-f\d]{40}$/.test(sourceSha??'')?sourceSha:null;
 const tasks=Array.isArray(register.tasks)?register.tasks:[];
 const byWorkstream={};
 for(const key of RELEASE_WORKSTREAMS){
  const subset=tasks.filter(t=>t.workstream===key);
  byWorkstream[key]={total:subset.length,accepted:subset.filter(t=>t.state==='Accepted').length,
   deferred:subset.filter(t=>t.state==='Deferred by decision').length,
   outstanding:subset.filter(t=>t.state!=='Accepted').map(t=>({id:t.id,state:t.state,priority:t.priority,missing:[
     ...(t.implementationOwner?[]:['implementationOwner']),
     ...(t.independentReviewer?[]:['independentReviewer']),
     ...(t.acceptanceOwner?[]:['acceptanceOwner']),
     ...(t.acceptanceDecision?.sourceSha===fullSha?[]:['acceptedExactSource']),
     ...(t.externalEvidence?.some(e=>e.kind==='independent-acceptance'&&e.sourceSha===fullSha&&!e.synthetic)?[]:['independentAcceptanceEvidence'])
   ]}))};
 }
 const defects=tasks.filter(t=>t.state==='Accepted'&&(
  !fullSha||t.acceptanceDecision?.sourceSha!==fullSha||
  !t.externalEvidence?.some(e=>e.kind==='independent-acceptance'&&e.sourceSha===fullSha&&e.environment===t.acceptanceDecision?.environment&&!e.synthetic)
 )).map(t=>t.id);
 const packages=Array.isArray(traceability.packages)?traceability.packages:[];
 const packageBlockers=packages.filter(p=>p.state!=='Accepted'||
  !p.implementationOwner||!p.independentReviewer||!p.acceptanceOwner||
  p.implementationOwner===p.independentReviewer||p.implementationOwner===p.acceptanceOwner||
  p.acceptanceDecision?.sourceSha!==fullSha||!['staging','production'].includes(p.acceptanceDecision?.environment)||
  !p.evidence?.some(e=>e.kind==='independent-acceptance'&&e.sourceSha===fullSha&&e.environment===p.acceptanceDecision?.environment&&!e.synthetic)
 ).map(p=>({id:p.id,state:p.state??'Not accepted',missingCurrentIndependentEvidence:true}));
 const accepted=tasks.filter(t=>t.state==='Accepted').length;
 const remaining=tasks.length-accepted;
 return {sourceSha:fullSha,releaseClass:'full_original_scope',ready:structural.length===0&&Boolean(fullSha)&&remaining===0&&defects.length===0&&packageBlockers.length===0,
  totalTasks:tasks.length,acceptedTasks:accepted,outstandingTasks:remaining,
  structuralErrors:structural,incorrectSourceAcceptance: defects,outstandingPackages:packageBlockers,workstreams:byWorkstream,
  note:'Engineering verified is not provider, business/legal or independent operational acceptance. Formal deferrals require a separately approved limited release; they never satisfy the full original-scope gate.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const sourceSha=process.env.PROINSPECT_RELEASE_SHA||process.argv[2]||'';
 const result=releaseReadiness(json('config/handbook-tasks.json'),json('config/handbook-traceability.json'),sourceSha);
 console.log(JSON.stringify(result,null,2));
 if(!result.ready)process.exitCode=1;
}
