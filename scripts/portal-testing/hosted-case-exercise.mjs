#!/usr/bin/env node
/** Human-operated hosted case execution. NO CI login bypass or synthetic
 * production mutations. Only approved fixtures may be used in the real UI. */
import { createInterface } from 'node:readline/promises';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SCENARIOS, ROLE_ALIASES, validateSessionObservation } from './acceptance-manifest.mjs';
export function safeEvidenceFile(path) {
  if (typeof path !== 'string' || !/^artifacts\/portal-acceptance\/[a-zA-Z0-9_./-]+\.(?:json|png|jpg|pdf)$/.test(path) ||
    path.includes('..') || path.includes('//')) throw new Error('Only redacted acceptance evidence files under artifacts/portal-acceptance are permitted');
  const root = resolve('artifacts/portal-acceptance'), location = resolve(path);
  if (!location.startsWith(root + sep) || !existsSync(location) || lstatSync(location).isSymbolicLink() ||
    !lstatSync(location).isFile() || lstatSync(location).size > 4194304) throw new Error('Missing, linked, unsafe or oversized evidence file');
  const bytes=readFileSync(location);
  return {ref:path,sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length};
}
async function main() {
  const scenario = SCENARIOS.find(x=>x.id===process.argv[2]);
  const expectedSha=process.argv[3];
  if (!scenario || !/^[a-f0-9]{40}$/.test(expectedSha||''))
    throw new Error('Usage: node scripts/portal-testing/hosted-case-exercise.mjs AT-01..AT-12 <deployed-40-char-sha>');
  if (!process.stdin.isTTY || process.env.CI)
    throw new Error('Human-controlled genuine hosted mailbox login is required; CI never signs into production');
  const {chromium}=await import('@playwright/test');
  const browser=await chromium.launch({headless:false});
  const readline=createInterface({input:process.stdin,output:process.stdout});
  const contexts=[];
  const origin='https://proinspect.systems';
  try {
    const approved=(await readline.question('Are ALL fixtures synthetic and formally owner-approved? Type APPROVED-FIXTURES: ')).trim();
    if (approved !== 'APPROVED-FIXTURES') throw new Error('Production fixture approval not attested; no case executed');
    const responses=[];
    for (const role of scenario.actors) {
      const context=await browser.newContext({baseURL:origin,acceptDownloads:false});contexts.push(context);
      const page=await context.newPage();
      const health=await (await context.request.get('/api/health')).json();
      if (health.source!==expectedSha) throw new Error('Worker source changed. Stop and repeat approval for the new SHA.');
      if ((await context.request.get('/api/session')).status()!==401)throw new Error('A fresh actor unexpectedly has an existing session');
      await page.goto('/signin',{waitUntil:'domcontentloaded'});
      console.log(`${scenario.id}: ${role} — sign in using ${ROLE_ALIASES[role]} and the real emailed link and Turnstile.`);
      await readline.question('After signing in, press Enter (no tokens or cookies should be pasted). ');
      const sessionResponse=await context.request.get('/api/session');
      const session=sessionResponse.status()===200?await sessionResponse.json():{};
      const verified=validateSessionObservation(role,session.user?.email,session.workspaces,sessionResponse.status());
      if(!verified.confirmed) throw new Error(`Required ${role} identity/workspace not verified: ${verified.reason}`);
      responses.push({role,authenticated:true,sourceSha:expectedSha});
    }
    console.log(`\n${scenario.id} POSITIVE: ${scenario.success}\nNEGATIVE: ${scenario.denial}\nCLEANUP: ${scenario.cleanup}`);
    await readline.question('Perform the approved synthetic case in the open browser windows; press Enter after completing both positive and negative checks. ');
    const positive=(await readline.question('Were the expected POSITIVE transactions observed? Type PASS: ')).trim()==='PASS';
    const negative=(await readline.question('Were the expected NEGATIVE denials observed? Type DENIED: ')).trim()==='DENIED';
    const cleanup=(await readline.question('Were synthetic changes cleaned up/retained according to policy? Type CLEAN: ')).trim()==='CLEAN';
    console.log('Attach REDACTED proof only; do not upload authentication links, cookies or personal data.');
    const path=(await readline.question('Relative path to redacted local evidence file: ')).trim();
    const artifact=safeEvidenceFile(path);
    const result={schema:1,caseId:scenario.id,sourceSha:expectedSha,environment:'production',dataMode:'approved-synthetic',
      observedAt:new Date().toISOString(),actors:responses.map(x=>x.role),
      positiveAccessChecked:positive,negativeAccessChecked:negative,cleanupConfirmed:cleanup,
      evidenceRef:artifact.ref,evidenceSha256:artifact.sha256,
      executionComplete:positive&&negative&&cleanup,reviewStatus:'pending-independent-review',
      acceptedForProduction:false};
    mkdirSync('artifacts/portal-acceptance/cases',{recursive:true});
    writeFileSync(`artifacts/portal-acceptance/cases/${scenario.id}.json`,JSON.stringify(result,null,2)+'\n');
    console.log(result.executionComplete?'Case observations captured; independent review STILL REQUIRED':'NO GO: one or more case observations are missing');
    if(!result.executionComplete)process.exitCode=1;
  } finally {for(const context of contexts)await context.close();await browser.close();readline.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error('NO GO:',e.message);process.exitCode=1});
