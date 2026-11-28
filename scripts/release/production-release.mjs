/** Controlled activation of an already uploaded production platform version.
 * No build/upload, schema migration, scanner deployment, secrets or resource writes.
 * Only trusted main can use this entrypoint; unknown/mixed runtime changes remain
 * manual operational releases, regardless of whether the public tests pass.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const REPO = 'info-rbp/proinspect';
const ACCOUNT = '8ca23ac6d2cc906d4dd13b8da5ea2b25';
const WORKER = 'proinspect-platform';
const ORIGIN = 'https://proinspect.systems';
const INITIAL_BASE = '71daee8d87109052e10141e2b3a8c01fd2c42de1';
// Owner-approved PR 126 plus the exact corrective test and monitor commit.
// This one-time transition includes the reviewed image build change and the
// private scanner's independent source tree. The scanner Worker is NOT deployed.
const REVIEWED_INITIAL = '9689b6c5c65a980595b05ebd178af8c02175ac4b';
const BOOTSTRAP_FILES = new Set([
  '.github/workflows/production-release.yml',
  '.github/workflows/public-service-pages.yml',
  '.github/workflows/verify.yml',
  'scripts/release/production-release.mjs',
  'tests/production-release.test.mjs',
  'docs/PRODUCTION_RELEASE_POLICY.md',
]);
const PUBLIC_FILES = new Set([
  'apps/marketing/app/routes/home.tsx',
  'apps/marketing/app/routes/tenants.tsx',
  'apps/marketing/app/components/brand-image.tsx',
  'apps/marketing/app/components/editorial.tsx',
  'apps/marketing/app/components/site-chrome.tsx',
  'apps/marketing/app/components/service-page.tsx',
  'apps/marketing/app/components/residential-landing.tsx',
  'apps/marketing/app/components/commercial-landing.tsx',
  'apps/marketing/app/components/co-spaces-landing.tsx',
  'apps/marketing/app/components/co-living-landing.tsx',
  'apps/marketing/app/components/maintenance-landing.tsx',
  'packages/marketing/public-navigation.ts',
  'packages/marketing/residential-categories.ts',
  'packages/ui/marketing-rebuild-home.css',
  'packages/ui/marketing-rebuild-nav.css',
  'packages/ui/marketing-service-pages.css',
]);
const isPresentation = (path) => PUBLIC_FILES.has(path) ||
  /^apps\/marketing\/app\/components\/images\/[a-zA-Z0-9_-]+\.(?:webp|jpg|jpeg|png)$/.test(path);
const isSupport = (path) => /^tests\/browser\/[a-zA-Z0-9_-]+\.spec\.ts$/.test(path) ||
  /^docs\/[a-zA-Z0-9_/-]+\.md$/.test(path);

// A path allowlist identifies eligible low-risk work; it is not a substitute
// for review of trusted main. Deletions, symlinks, shared roots, loaders,
// actions, dependencies, bindings, payments, auth, DB and scanner changes
// default to controlled/manual. The exact initial reviewed snapshot is bounded.
export function classifyPlatformDelta(entries, { bootstrap = false } = {}) {
  const blocked = [];
  for (const entry of entries) {
    const { path, mode, unchangedFromReviewed, initialPolicyFile } = entry;
    if (mode !== '100644') { blocked.push(path); continue; }
    if (bootstrap && (unchangedFromReviewed || initialPolicyFile)) continue;
    if (!isPresentation(path) && !isSupport(path)) blocked.push(path);
  }
  return { lane: blocked.length || !entries.length ? 'controlled' : 'public-platform', blocked, bootstrap };
}
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
function ancestor(a, b) {
  try { execFileSync('git', ['merge-base', '--is-ancestor', a, b], { stdio: 'ignore' }); return true; }
  catch { return false; }
}
const shaOk = (sha) => typeof sha === 'string' && /^[a-f0-9]{40}$/.test(sha);
function changedPaths(base, head) {
  return execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', base, head], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).split('\0').filter(Boolean);
}
function treeEntry(ref, path) {
  const value = git('ls-tree', ref, '--', path);
  if (!value) return null;
  const [mode, type, oid] = value.split(/\s+/, 3);
  return { mode, type, oid };
}
function sameEntry(a, b) { return a?.mode === b?.mode && a?.type === b?.type && a?.oid === b?.oid; }
export function classifyGitDelta(base, head) {
  assert(shaOk(base) && shaOk(head), 'Unverified source SHA');
  assert(ancestor(base, head), 'Live source is not an ancestor of candidate; controlled release required');
  const bootstrap = base === INITIAL_BASE && ancestor(REVIEWED_INITIAL, head);
  const approved = bootstrap ? new Set(changedPaths(base, REVIEWED_INITIAL)) : new Set();
  const entries = changedPaths(base, head).map(path => {
    const next = treeEntry(head, path);
    return {
      path,
      mode: next?.type === 'blob' ? next.mode : null,
      unchangedFromReviewed: bootstrap && approved.has(path) && sameEntry(next, treeEntry(REVIEWED_INITIAL, path)),
      // This first, owner-authorised installation of the release policy may
      // modify its named orchestration files. Subsequent policy edits do not
      // qualify for the routine lane after this initial source is deployed.
      initialPolicyFile: bootstrap && BOOTSTRAP_FILES.has(path),
    };
  });
  return { ...classifyPlatformDelta(entries, { bootstrap }), paths: entries.map(e => e.path) };
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
const equal = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
function bindings(version) {
  const list = version?.resources?.bindings;
  assert(Array.isArray(list) && list.length > 0, 'Version has no visible binding inventory');
  const map = Object.fromEntries(list.map(b => [b.name, b]));
  assert.equal(Object.keys(map).length, list.length, 'Duplicate binding names');
  return map;
}
export function sourceOf(version) { return bindings(version).BUILD_SHA?.text; }
export function assertCompatible(previous, candidate, head) {
  const a = bindings(previous), b = bindings(candidate);
  assert.equal(b.BUILD_SHA?.text, head, 'Candidate source differs from tested head');
  for (const m of [a, b]) {
    assert.equal(m.APP_ENV?.text, 'production', 'Nonproduction environment');
    assert.equal(m.APP_ORIGIN?.text, ORIGIN, 'Wrong production origin');
    for (const key of ['DB','DOCUMENTS','RESTRICTED_DOCUMENTS','SCHEDULER','EVENTS','PRIVATE_DOCUMENT_SCANNER'])
      assert(m[key], 'Required binding missing: ' + key);
  }
  const differences = [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter(k => k !== 'BUILD_SHA' && !equal(a[k], b[k]));
  assert.equal(differences.length, 0, 'Production binding changes: ' + differences.join(', '));
  assert(equal(previous.resources.script_runtime, candidate.resources.script_runtime), 'Worker runtime settings changed');
  return Object.keys(b).length;
}
export function singleActive(deployment) {
  const active = deployment?.versions?.filter(v => v.percentage > 0);
  assert(active?.length === 1 && active[0].percentage === 100, 'Unexpected live traffic split');
  return active[0].version_id;
}
export function evaluateEvidence({ risk, regression, publicPages, scanner, verify, verifyComplete, publicComplete }) {
  if (risk !== 'public-platform') return { ready: false, reason: 'Controlled operational release requires full verification and independent approval' };
  if (!verifyComplete || !publicComplete) return { ready: false, reason: 'Exact-head acceptance is still running or missing' };
  if (regression !== 'success' || publicPages !== 'success') return { ready: false, reason: 'Exact-head full local regression and public acceptance must both pass' };
  // A failed scanner cannot clear documents or approve operational changes.
  // It is independent of an allowlisted platform presentation-only release.
  // Do not admit missing/skipped/cancelled scanner or authoritative gate jobs.
  if (!['success','failure'].includes(scanner)) return { ready: false, reason: 'Actual scanner check must produce a recorded result' };
  if (verify !== (scanner === 'success' ? 'success' : 'failure')) return { ready: false, reason: 'Unexpected authoritative verification outcome' };
  return { ready: true, reason: scanner === 'success' ? 'All acceptance passed' : 'Public-platform checks passed; private scanner remains unaccepted and fail-closed' };
}
async function requestJson(url, headers, method='GET', body) {
  const response = await fetch(url, {
    method, headers: { ...headers, ...(body ? {'Content-Type':'application/json'} : {}) },
    body: body ? JSON.stringify(body) : undefined, redirect:'error', signal:AbortSignal.timeout(30000),
  });
  assert(response.ok, method + ' ' + new URL(url).pathname + ' returned HTTP ' + response.status);
  return response.json();
}
const gh = async (path) => requestJson('https://api.github.com/repos/'+REPO+path, {
  Authorization:'Bearer '+process.env.GH_TOKEN, Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',
});
const cf = async (path, method='GET', body) => {
  const response = await requestJson('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/workers/scripts/'+WORKER+path,
    { Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN }, method, body);
  assert(response.success === true && response.result, 'Cloudflare request was not successful');
  return response.result;
};
const currentDeployment = async () => {
  const result = await cf('/deployments');
  assert(result.deployments?.length, 'No production deployment found');
  return result.deployments[0];
};
const getVersion = (id) => {
  assert(/^[a-f0-9-]{36}$/.test(id), 'Invalid version ID');
  return cf('/versions/'+id);
};
const activate = (id, message) => cf('/deployments','POST',{
  strategy:'percentage', versions:[{version_id:id,percentage:100}], annotations:{'workers/message':message},
});
async function exactRun(file, head) {
  const {workflow_runs:runs} = await gh('/actions/workflows/'+file+'/runs?head_sha='+head+'&branch=main&per_page=20');
  const run = runs.find(r => r.head_sha===head && r.head_branch==='main' && ['push','workflow_dispatch'].includes(r.event) && r.head_repository?.full_name===REPO);
  if (!run) return { complete:false, jobs:{} };
  const result = { complete:run.status==='completed', conclusion:run.conclusion, id:run.id, jobs:{} };
  if (result.complete) {
    const {jobs} = await gh('/actions/runs/'+run.id+'/attempts/'+run.run_attempt+'/jobs?per_page=100');
    result.jobs = Object.fromEntries(jobs.map(j=>[j.name,j.conclusion]));
  }
  return result;
}
async function assertMain(head) {
  const main = await gh('/branches/main');
  assert.equal(main.commit.sha, head, 'Main advanced during release; refusing stale candidate');
}
async function liveGet(path) {
  const url = new URL(path, ORIGIN);
  assert.equal(url.origin,ORIGIN);
  url.searchParams.set('_release_check',Date.now().toString());
  return fetch(url,{redirect:'manual',cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});
}
export async function assertHealthy(expected) {
  const response=await liveGet('/api/health');
  assert.equal(response.status,200,'Production health unavailable');
  const health=await response.json();
  assert(health.ok && health.environment==='production' && health.source===expected, 'Production health/source mismatch');
  assert(health.authenticationConfigured===true, 'Authentication health check failed');
  for(const key of ['database','documents','scheduler','queue']) assert(health.bindings?.[key]===true,'Missing live binding '+key);
  return health.source;
}
async function smoke(head, initial=false) {
  // Version propagation may lag briefly. Do not retry any write.
  let source;
  for(let i=0;i<10;i++){
    try { source=await assertHealthy(head);break; }
    catch(e){ if(i===9)throw e; await delay(3000); }
  }
  const pages=['/','/residential','/commercial','/co-spaces','/maintenance','/tenants','/leasing','/subscriptions','/residential/subscriptions'];
  const headings={
    '/residential':'Your Property. Our Support. Your Peace of Mind.',
    '/commercial':'Commercial Spaces. Practical Solutions.',
    '/co-spaces':'Better Spaces. Better Ways to Live and Work.',
    '/maintenance':'Taking Care of Your Property. Taking Care of the Details.',
    '/tenants':'Supporting You Throughout Your Rental Journey.',
  };
  const verified=[];
  for(const path of pages){
    const response=await liveGet(path);
    assert.equal(response.status,200,'Unexpected public page status: '+path);
    const html=await response.text();
    assert(/<h1(?:\s[^>]*)?>[\s\S]+?<\/h1>/.test(html),'Missing page heading: '+path);
    assert(html.includes('mkt-site-header')&&html.includes('mkt-site-footer'),'Missing site chrome: '+path);
    assert(html.includes('aria-controls="desktop-residential-pages"'),'Missing secondary menu: '+path);
    if(initial&&headings[path])assert(html.includes(headings[path]),'Expected approved heading absent: '+path);
    if(path==='/commercial')assert((response.headers.get('x-robots-tag')??'').includes('noindex'),'Commercial editorial indexing gate changed');
    if(path==='/residential'){
      assert(html.includes('AUD $50 + GST per week per property')&&html.includes('24-month term'),'Residential terms missing');
      assert(html.includes('/residential/subscriptions'),'Residential terms destination missing');
    }
    if(path==='/tenants')assert(html.includes('/open-home/check-in')&&html.includes('/rental-application/recover'),'Tenant destinations missing');
    if(path==='/')assert(/\.webp(?:["\s?,])/.test(html),'WebP brand assets absent');
    verified.push(path);
  }
  for(const path of ['/properties-for-lease/commercial','/commercial-application/session','/construction/new']){
    const response=await liveGet(path);
    assert.equal(response.status,410,'Retired acquisition path reopened: '+path);
  }
  await assertHealthy(head);
  return {source,pages:verified,retiredRoutes:3};
}
// Dependency-injected for tests. Rollback only the deployment this transaction
// created, never a concurrent operator's release. It restores code/traffic,
// not connected data. The public lane admits no migration or binding changes.
export async function promoteAndVerify({head,previous,target,assertCurrentMain,readDeployment,deploy,verify,verifyPrevious,report}){
  await assertCurrentMain(head);
  const before=await readDeployment();
  assert.equal(before.id,previous.deploymentId,'Production deployment changed before activation');
  assert.equal(singleActive(before),previous.versionId,'Production version changed before activation');
  const applied=await deploy(target,'Verified public-platform release '+head);
  assert(applied?.id,'Activation returned no deployment ID');
  report.activation={deploymentId:applied.id,versionId:target};
  try{
    const result=await verify(head);
    const after=await readDeployment();
    assert.equal(after.id,applied.id,'Production changed during verification');
    assert.equal(singleActive(after),target,'Wrong active version after promotion');
    report.live=result; report.status='deployed';
    return report;
  }catch(error){
    report.status='verification-failed';
    report.verificationError=String(error?.message??error);
    const current=await readDeployment();
    if(current.id!==applied.id||singleActive(current)!==target){
      report.rollback={status:'not-attempted-concurrent-deployment'};
      throw new Error('Live verification failed; deployment changed concurrently. Manual recovery required.');
    }
    const restored=await deploy(previous.versionId,'Rollback failed public-platform release '+head);
    report.rollback={status:'activated',deploymentId:restored.id,versionId:previous.versionId};
    await verifyPrevious(previous.source);
    assert.equal(singleActive(await readDeployment()),previous.versionId,'Rollback traffic mismatch');
    report.rollback.status='verified';
    throw new Error('Live verification failed; previous production version restored and verified.');
  }
}
async function findCandidate(head){
  for(let attempt=0;attempt<10;attempt++){
    const versions=(await cf('/versions')).items;
    assert(Array.isArray(versions),'Version inventory unavailable');
    for(const item of versions.slice(0,10)){
      if(item.annotations?.['workers/alias']!=='main')continue;
      const v=await getVersion(item.id);
      if(sourceOf(v)===head)return v;
    }
    await delay(5000);
  }
  throw new Error('No uploaded main Worker version matches the tested commit');
}
export async function main(){
  assert.equal(process.env.GITHUB_REPOSITORY,REPO,'Wrong repository');
  assert.equal(process.env.GITHUB_REF,'refs/heads/main','Production release is main-only');
  assert(process.env.GH_TOKEN,'GitHub Actions read credential unavailable');
  assert(process.env.CLOUDFLARE_API_TOKEN,'Production Cloudflare credential unavailable');
  const head=git('rev-parse','HEAD');
  await assertMain(head);
  const report={source:head,status:'not-deployed'};
  const out='artifacts/production-release';
  mkdirSync(out,{recursive:true});
  try{
    const oldDeployment=await currentDeployment();
    const previousId=singleActive(oldDeployment);
    const old=await getVersion(previousId);
    const base=sourceOf(old);
    report.previous={source:base,versionId:previousId,deploymentId:oldDeployment.id};
    assert(shaOk(base),'Production version does not identify source');
    await assertHealthy(base);
    if(base===head){report.status='already-active';return;}
    const risk=classifyGitDelta(base,head);
    report.classification=risk;
    if(risk.lane!=='public-platform'){report.status='controlled-release-required';return;}
    const [verify,publicPages]=await Promise.all([exactRun('verify.yml',head),exactRun('public-service-pages.yml',head)]);
    report.acceptance={verify,publicPages};
    const acceptance=evaluateEvidence({risk:risk.lane,regression:verify.jobs['local-regression'],publicPages:publicPages.conclusion==='success'?publicPages.jobs['public-pages']:publicPages.conclusion,scanner:verify.jobs['private-scanner'],verify:verify.jobs.verify,verifyComplete:verify.complete,publicComplete:publicPages.complete});
    report.decision=acceptance;
    if(!acceptance.ready){
      report.status='acceptance-not-ready';
      // Missing/running counterpart will trigger another workflow_run.
      if(verify.complete&&publicPages.complete)throw new Error(acceptance.reason);
      return;
    }
    const target=await findCandidate(head);
    report.candidate={versionId:target.id,bindingCount:assertCompatible(old,target,head)};
    await promoteAndVerify({head,previous:report.previous,target:target.id,assertCurrentMain:assertMain,readDeployment:currentDeployment,deploy:activate,verify:sha=>smoke(sha,risk.bootstrap),verifyPrevious:assertHealthy,report});
  }finally{
    writeFileSync(out+'/release.json',JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({status:report.status,source:report.source,previous:report.previous,candidate:report.candidate,decision:report.decision,rollback:report.rollback}));
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
