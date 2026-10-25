#!/usr/bin/env node
/** CI-only traceability. Never interprets local/Miniflare results as hosted acceptance. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { SCENARIOS } from './acceptance-manifest.mjs';
import { pathToFileURL } from 'node:url';
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
export function auditIsolatedCoverage(connected, communication, browsers, sourceSha) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error('Expected exact source SHA');
  const integration = new Set([...(connected?.checks ?? []), ...(communication?.checks ?? [])]);
  const titles = browserResults(browsers);
  const cases = {};
  for (const scenario of SCENARIOS) {
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
    total: SCENARIOS.length,
    acceptedForProduction: false,
    note: 'Passing mapped isolated tests never attests to real Turnstile, mailbox delivery, live transactions or hosted negative permissions.',
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const sha = process.env.GITHUB_SHA || readFileSync('artifacts/source-sha.txt', 'utf8').trim();
    const result = auditIsolatedCoverage(readJson('artifacts/connected-results.json'),
      readJson('artifacts/communications-results.json'), readJson('artifacts/browser-results.json'), sha);
    mkdirSync('artifacts', { recursive: true });
    writeFileSync('artifacts/portal-scenario-coverage.json', JSON.stringify(result, null, 2) + '\n');
    console.log(`Isolated AT scenario coverage: ${result.covered}/${result.total}; production acceptance NOT EXECUTED`);
    if (result.covered !== result.total) process.exitCode = 1;
  } catch (error) { console.error('Isolated coverage audit failed: ' + error.message); process.exitCode = 1; }
}
