#!/usr/bin/env node
/** CI-only traceability. Never interprets local/Miniflare results as hosted acceptance. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { SCENARIOS } from './acceptance-manifest.mjs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
// The pre-pivot manifest remains available for its archived multi-sector release.
const residentialCases = [
  ['Registration and scope', ['unrelated tenants and clients cannot enumerate any newly added management endpoint'], ['new Landlord registration is free and can consider a subscription later']],
  ['Owner and tenant maintenance', ['request attachments quarantine, release and download respect requester and manager relationships','internal operational comments are absent from tenant and landlord views'], ['tenant evidence, reviewed PCR and cost approval connect to the self-managing landlord']],
  ['Residential bookings', ['residential agency books an included service with a Staff-visible work order','cancellation releases capacity atomically with work order and rejects stale writes'], ['professional booking creates a job and scoped full record browsing opens it']],
  ['Agency portfolio', ['agency staff see only assigned properties and an ended membership loses workspace access','agency approval escalation reaches only the verified owner and returns the decision to the work order'], ['agency imports a portfolio, manages a recurring plan and keeps the portfolio private']],
  ['Inspections and reports', ['reviewed tenancy PDF is inaccessible until explicitly issued and PCR response is tenant scoped','document revisions preserve old files and reject unrelated client recipients'], ['mobile inspector captures reviewed evidence without horizontal overflow']],
  ['Tenant forms', ['WA residential form catalogue, private draft, review, delivery evidence and commercial denial'], ['WA Residential Forms Centre creates an authorised pet request without exposing commercial or confidential forms']],
  ['Staff enquiries', ['signed marketing enquiry persists encrypted contact data without granting an account'], ['public enquiry reaches authorised Staff triage and a recorded email reply']],
  ['Retired acquisition', ['historical commercial workspace is scoped and cannot invite new occupants','retired professional acquisitions cannot create an application or workspace'], ['a retired booking link cannot open account setup or issue a paid entitlement','retired scheme acquisition gives no property or council access']],
  ['Historical notices', ['historical council notices stay within their authorised audience','due historical jobs and previously queued mail cannot fan out or send'], ['Staff cannot create a building broadcast from the retired scheme workflow']],
].map(([id,isolated,browser])=>({id,isolated,browser}));
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function browserResults(report) {
  const titles = new Set();
  const visit = suite => {
    for (const spec of suite.specs ?? []) {
      const results = (spec.tests ?? []).flatMap(t => t.results ?? []);
      if (results.some(r => r.status === 'passed') && !results.some(r => r.status === 'failed' || r.status === 'timedOut'))
        titles.add(spec.title);
    }
    for (const s of suite.suites ?? []) visit(s);
  };
  for (const suite of report.suites ?? []) visit(suite);
  return titles;
}
export function auditIsolatedCoverage(connected, communication, browsers, sourceSha, scenarios = SCENARIOS) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error('Expected exact source SHA');
  const integration = new Set([...(connected?.checks ?? []), ...(communication?.checks ?? [])]);
  const titles = browserResults(browsers);
  const cases = {};
  for (const scenario of scenarios) {
    const connectedChecks = scenario.isolated.filter(n => integration.has(n));
    const browserChecks = scenario.browser.filter(n => titles.has(n));
    cases[scenario.id] = {
      isolatedCoverage: connectedChecks.length === scenario.isolated.length && browserChecks.length === scenario.browser.length ? 'covered' : 'missing',
      connectedChecks, browserChecks,
      missingChecks: scenario.isolated.filter(n => !integration.has(n)),
      missingBrowserTests: scenario.browser.filter(n => !titles.has(n)),
      productionAcceptance: 'not_executed',
    };
  }
  return {
    schema: 1, sourceSha, environment: 'isolated-local-ci',
    externalProviderEvidence: 'not_observed',
    cases, covered: Object.values(cases).filter(x => x.isolatedCoverage === 'covered').length,
    total: scenarios.length,
    acceptedForProduction: false,
    note: 'Passing mapped isolated tests never attests to real Turnstile, mailbox delivery, live transactions or hosted negative permissions.',
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const sha = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
    const scenarios = process.argv.includes('--residential') ? residentialCases : SCENARIOS;
    const result = auditIsolatedCoverage(readJson('artifacts/connected-results.json'),
      readJson('artifacts/communications-results.json'), readJson('artifacts/browser-results.json'), sha, scenarios);
    mkdirSync('artifacts', { recursive: true });
    writeFileSync('artifacts/portal-scenario-coverage.json', JSON.stringify(result, null, 2) + '\n');
    console.log(`Isolated AT scenario coverage: ${result.covered}/${result.total}; production acceptance NOT EXECUTED`);
    if (result.covered !== result.total) process.exitCode = 1;
  } catch (error) { console.error('Isolated coverage audit failed: ' + error.message); process.exitCode = 1; }
}
