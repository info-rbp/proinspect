#!/usr/bin/env node
/** User-driven production authentication observation. Never reads email,
 * handles a magic token, saves browser storage, or alters account permissions.
 * Requires a real operator at a headed local browser with mailbox access. */
import { createInterface } from 'node:readline/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ROLE_ALIASES, requireProductionOrigin, validateSessionObservation } from './acceptance-manifest.mjs';
import { pathToFileURL } from 'node:url';
const denial = {
  landlord:'/api/w/property-manager/cli_pi_test_agency',
  property_manager:'/api/w/landlord/cli_pi_test_landlord',
  commercial:'/api/w/landlord/cli_pi_test_landlord',
  strata_manager:'/api/w/landlord/cli_pi_test_landlord',
  tenant:'/api/w/landlord/cli_pi_test_landlord',
  building:'/api/w/strata-council/scheme_pi_test',
  council:'/api/w/building/scheme_pi_test',
  staff:'/api/w/strata-council/scheme_pi_test',
};
export const UNRELATED_API = Object.freeze(denial);
export function identityObservation({ role, sourceSha, session, negativeStatus, beforeStatus, afterStatus,
  humanConfirmed, observedAt }) {
  const sessionResult = validateSessionObservation(role, session?.user?.email,
    session?.workspaces, session?.status);
  const result = {
    role, sourceSha, observedAt, environment:'production',
    initialAnonymous:beforeStatus===401,
    authenticated:sessionResult.confirmed,
    expectedWorkspacePresent:sessionResult.confirmed,
    unrelatedWorkspaceDenied:[401,403,404].includes(negativeStatus),
    signoutRevokedSession:afterStatus===401,
    humanTurnstileAndEmailLinkConfirmed:humanConfirmed===true,
    accessRevocationChecked:false, // Sign-out is not an ended/withdrawn membership.
    hostedAcceptable:false, // Requires independently reviewed AT-01 and revoked-member tests.
  };
  result.sessionJourneyObserved = result.initialAnonymous && result.authenticated &&
    result.unrelatedWorkspaceDenied && result.signoutRevokedSession && result.humanTurnstileAndEmailLinkConfirmed;
  return result;
}
async function main() {
  const role=process.argv[2], expectedSha=process.argv[3];
  if (!Object.hasOwn(ROLE_ALIASES,role)|| !/^[a-f0-9]{40}$/.test(expectedSha||''))
    throw new Error('Usage: node scripts/portal-testing/hosted-auth-exercise.mjs <role> <deployed-40-character-SHA>');
  if (!process.stdin.isTTY || process.env.CI) throw new Error('Requires an interactive authorised mailbox holder; CI cannot redeem real login links');
  const origin=requireProductionOrigin('https://proinspect.systems/');
  const {chromium}=await import('@playwright/test');
  const browser=await chromium.launch({headless:false});
  const context=await browser.newContext({baseURL:origin,acceptDownloads:false});
  const page=await context.newPage();
  const prompt=createInterface({input:process.stdin,output:process.stdout});
  try {
    const healthResponse=await context.request.get('/api/health');
    const health=healthResponse.ok()?await healthResponse.json():{};
    if(health.source!==expectedSha)throw new Error('Worker SHA differs from approved test SHA; stop before signing in');
    const initial=await context.request.get('/api/session');
    if(initial.status()!==401)throw new Error('New browser context was already authenticated');
    console.log(`Role: ${role} — the mailbox holder must sign in with ${ROLE_ALIASES[role]}.`);
    console.log('Use real Turnstile and the one-time emailed link. Never paste the link or session cookie into the terminal.');
    await page.goto('/signin',{waitUntil:'domcontentloaded'});
    await prompt.question('Complete sign-in and open /workspaces in the browser, then press Enter here. ');
    const sessionResponse=await context.request.get('/api/session');
    const session=sessionResponse.status()===200?await sessionResponse.json():{};
    const negative=await context.request.get(denial[role]);
    console.log('Unrelated scope status:',negative.status());
    const approved=(await prompt.question('Did you personally complete the real Turnstile and emailed one-time link? Type CONFIRM (anything else is NO): ')).trim()==='CONFIRM';
    // Real logout via the application action, without reading cookies or links.
    const signout=await context.request.post('/signout',{headers:{Origin:origin},maxRedirects:0});
    if(![302,303].includes(signout.status()))throw new Error('Sign-out handler did not redirect');
    const after=await context.request.get('/api/session');
    const result=identityObservation({role,sourceSha:expectedSha,
      session:{...session,status:sessionResponse.status()},beforeStatus:initial.status(),
      negativeStatus:negative.status(),afterStatus:after.status(),humanConfirmed:approved,
      observedAt:new Date().toISOString()});
    mkdirSync('artifacts/portal-acceptance/identities',{recursive:true});
    writeFileSync(`artifacts/portal-acceptance/identities/${role}.json`,JSON.stringify(result,null,2)+'\n');
    console.log(result.sessionJourneyObserved?'Observed session and denial; independent review still required':'NO GO: incomplete login or permission observation');
    if(!result.sessionJourneyObserved)process.exitCode=1;
  } finally {await context.close();await browser.close();prompt.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error('NO GO:',e.message);process.exitCode=1});
