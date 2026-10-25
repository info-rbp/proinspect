import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
const roles=['landlord','property_manager','commercial','strata_manager','tenant','building','council','staff'];
const gates=['identities','onboarding','portal_journeys','connected_handoffs','isolation','revocation','private_documents','transaction_reliability','provider_delivery','accessibility','defect_review','deployment_recovery'];
const cases=Array.from({length:12},(_,i)=>'AT-'+String(i+1).padStart(2,'0'));
const sha=x=>typeof x==='string'&&/^[0-9a-f]{40}$/.test(x);
const date=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const artifact=x=>typeof x==='string'&&(/^(artifacts\/[a-zA-Z0-9_./-]+)$/.test(x)||/^https:\/\/github\.com\/info-rbp\/proinspect\/actions\/runs\/\d+$/.test(x));
const secret=x=>/(?:sk_(?:test|live)_[a-z0-9]{8,}|whsec_[a-z0-9]{8,}|-----BEGIN (?:RSA )?PRIVATE KEY-----|[?&](?:token|code|session)=|cookie\s*:|authorization\s*:)/i.test(JSON.stringify(x));
export function assess(e,expected,clock=Date.now()){
 if(!e||typeof e!=='object'||Array.isArray(e))throw Error('Evidence object required');
 if(!sha(expected)||e.sourceSha!==expected)throw Error('Source mismatch');
 if(secret(e))throw Error('Evidence must never contain credentials or authentication links');
 if(e.schema!==1||e.environment!=='production'||e.dataMode!=='approved-synthetic')throw Error('Invalid environment or schema');
 if(!date(e.observedAt)||clock-Date.parse(e.observedAt)<0||clock-Date.parse(e.observedAt)>86400000)throw Error('Stale evidence');
 const result={},scenarios={};
 for(const id of gates){
  const x=e.criteria?.[id];
  const valid=x&&['pass','fail','blocked'].includes(x.status)&&date(x.observedAt)&&clock-Date.parse(x.observedAt)>=0&&clock-Date.parse(x.observedAt)<=86400000&&artifact(x.evidenceRef)&&Array.isArray(x.caseIds)&&x.caseIds.length>0&&x.caseIds.every(k=>cases.includes(k));
  result[id]={status:valid?x.status:'blocked',reason:valid?null:'Missing, stale or invalid evidence'};
 }
 const unique=new Set();
 for(const role of roles){
  const x=e.identities?.[role];
  if(!x||x.authenticated!==true||x.authorisedScope!==true||x.accessRevocationChecked!==true||!artifact(x.evidenceRef)||!date(x.observedAt)||!x.identityRef||unique.has(x.identityRef)){result.identities.status='blocked';break;}
  unique.add(x.identityRef);
 }
 if(unique.size!==roles.length)result.identities.status='blocked';
 for(const id of cases){
  const x=e.cases?.[id];scenarios[id]=x?.status==='pass'&&artifact(x.evidenceRef)&&date(x.observedAt)?'pass':'blocked';
 }
 if(!Array.isArray(e.defects)||e.defects.some(x=>['critical','high'].includes(x.severity)&&x.status!=='resolved'))result.defect_review.status='blocked';
 if(e.deployment?.workerSha!==expected||e.deployment?.recoveryVerified!==true)result.deployment_recovery.status='blocked';
 const counts={criteriaPassed:Object.values(result).filter(x=>x.status==='pass').length,criteriaTotal:gates.length,casesPassed:Object.values(scenarios).filter(x=>x==='pass').length,casesTotal:cases.length};
 return {schema:1,sourceSha:expected,acceptedForProduction:counts.criteriaPassed===gates.length&&counts.casesPassed===cases.length,criteria:result,cases:scenarios,counts};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href&&process.argv[2]){
 try{
  const result=assess(JSON.parse(readFileSync(process.argv[2],'utf8')),process.argv[3]||process.env.EXPECTED_SOURCE_SHA);
  mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/portal-acceptance-result.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result.counts));
  if(!result.acceptedForProduction){console.error('NO GO: hosted portal acceptance is incomplete');process.exitCode=1}
 }catch(error){console.error('NO GO: '+error.message);process.exitCode=1}
}