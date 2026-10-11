/**
 * Sync pure Report Creation App modules from an exact upstream commit into a
 * reviewable ProInspect PR. Never writes main, publishes releases or deploys.
 * Run on GitHub Actions using workflow_dispatch (or repository_dispatch).
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const lockPath='packages/report-engine/upstream-lock.json';
const lock=JSON.parse(readFileSync(lockPath,'utf8'));
const expectedRepository='info-rbp/ProInspect-Report-Creation-App';
const allowed=['packages/domain/src/inspectionPolicy.ts','packages/domain/src/reportModel.ts','packages/domain/src/reportOperations.ts'];
if(lock.sourceRepository!==expectedRepository||lock.files.length!==allowed.length||
 lock.files.some((entry,i)=>entry.sourcePath!==allowed[i]||entry.targetPath!=='packages/report-engine/upstream/'+allowed[i].split('/').pop()))throw Error('Upstream allowlist changed: manual approval required.');
const token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN;
const headers={'Accept':'application/vnd.github+json','User-Agent':'ProInspect-Report-Sync',...(token?{Authorization:'Bearer '+token}:{})};
const sha=process.env.REPORT_UPSTREAM_SHA||await (async()=>{
 const r=await fetch('https://api.github.com/repos/'+expectedRepository+'/commits/main',{headers});
 if(!r.ok)throw Error('Unable to retrieve upstream main commit: '+r.status);
 return (await r.json()).sha;
})();
if(!/^[a-f0-9]{40}$/.test(sha))throw Error('Only an exact upstream commit SHA may be used.');
if(sha===lock.sourceCommit){console.log('No upstream changes to propose.');process.exit(0);}
function transformed(path,source){
 let s=source;
 if(path.endsWith('reportModel.ts')){
  for(const [anchor,insert] of [
   ['export interface ReportComponentRecord {',`export interface ReportComponentRecord {
  canonicalComponentDefinitionId?: string; canonicalComponentDefinitionVersion?: number;
  canonicalAreaComponentRuleId?: string; canonicalAreaComponentRuleVersion?: number;
  requirementSnapshot?: {
    condition?: 'required'|'optional'; cleanliness?: 'required'|'optional';
    workingStatus?: 'required'|'optional'|'hidden'; commentary?: 'always'|'exception_only'|'optional';
    operationalTest?: 'required'|'recommended'|'optional'|'not_applicable';
    componentPhotoRequired?: boolean; minimumPhotos?: number; exceptionPhotoRequired?: boolean;
    minimumExceptionPhotos?: number; maintenanceEvaluation?: boolean; comparisonPairRequired?: boolean;
  };`],
   ['export interface ReportAreaRecord {',`export interface ReportAreaRecord {
  canonicalAreaDefinitionId?: string; canonicalAreaDefinitionVersion?: number;`],
   ['export interface ReportMetadataRecord {',`export interface ReportMetadataRecord {
  structureResolutionVersion?: number; templateStructureMode?: string;`]
  ]){if(!s.includes(anchor))throw Error('Upstream model refactor needs manual port: '+anchor);s=s.replace(anchor,insert);}
  s=s.replaceAll("'./platform.js'","'./platform.ts'");
 }
 if(path.endsWith('reportOperations.ts'))s=s.replaceAll("'./inspectionPolicy.js'","'./inspectionPolicy.ts'").replaceAll("'./reportModel.js'","'./reportModel.ts'").replaceAll("'./platform.js'","'./platform.ts'");
 return s;
}
for(const file of lock.files){
 const url='https://raw.githubusercontent.com/'+expectedRepository+'/'+sha+'/'+file.sourcePath;
 const r=await fetch(url,{headers:{'User-Agent':'ProInspect-Report-Sync'}});
 if(!r.ok)throw Error('Required upstream file unavailable: '+file.sourcePath+' '+r.status);
 const text=await r.text();if(text.length>150000)throw Error('Unexpectedly large upstream module.');
 const adapted=transformed(file.sourcePath,text);
 writeFileSync(file.targetPath,adapted);
 file.sourceBlobSha=createHash('sha1').update('blob '+Buffer.byteLength(text)).update(Uint8Array.of(0)).update(text).digest('hex');
}
lock.sourceCommit=sha;
lock.lastProposedAt=new Date().toISOString();
lock.transformVersion=1;
writeFileSync(lockPath,JSON.stringify(lock,null,2)+'\n');
const changed=execFileSync('git',['status','--porcelain','packages/report-engine'],{encoding:'utf8'}).trim();
if(!changed){console.log('No file difference from the last accepted engine version.');process.exit(0);}
const branch='sync/report-engine-'+sha.slice(0,12);
if(execFileSync('git',['ls-remote','--heads','origin',branch],{encoding:'utf8'}).trim()){
 console.log('An upstream-update proposal already exists at '+branch+'. Review it before proposing another.');
 process.exit(0);
}
const git=(args)=>execFileSync('git',args,{stdio:'inherit'});
git(['config','user.name','github-actions[bot]']);git(['config','user.email','41898282+github-actions[bot]@users.noreply.github.com']);
git(['switch','-c',branch]);
git(['add','packages/report-engine/upstream','packages/report-engine/upstream-lock.json']);
git(['commit','-m','chore(report): propose upstream reporting engine '+sha.slice(0,12)]);
git(['push','origin',branch]);
const body='Automated proposal from upstream \`'+expectedRepository+'\` at \`'+sha+'\`.\n\n'+
'Allowlisted pure reporting modules only. Source adapters must pass verification; never auto-merge. '+
'Revalidate report templates/QC, cross-portal scopes and evidence/PDF regressions before accepting.';
execFileSync('gh',['pr','create','--repo',process.env.GITHUB_REPOSITORY||'info-rbp/proinspect',
  '--base','integration/report-creation-tool','--head',branch,
  '--title','chore(report): review upstream engine '+sha.slice(0,12),'--body',body],
  {stdio:'inherit',env:{...process.env,GH_TOKEN:token}});
