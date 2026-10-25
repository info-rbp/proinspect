#!/usr/bin/env node
/**
 * Fail-closed review of external, human-observed hosted acceptance evidence.
 * This never creates identities, sessions, credentials or production transactions.
 * A successful schema check is NOT independent proof that the referenced evidence is true.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const ROLES = Object.freeze([
  'landlord', 'property_manager', 'commercial', 'strata_manager',
  'tenant', 'building', 'council', 'staff',
]);
export const CASES = Object.freeze(Array.from({ length: 12 }, (_, i) =>
  `AT-${String(i + 1).padStart(2, '0')}`));
export const REQUIRED_CASES = Object.freeze({
  identities: ['AT-01'],
  onboarding: ['AT-01', 'AT-12'],
  portal_journeys: CASES,
  connected_handoffs: ['AT-02', 'AT-03', 'AT-04', 'AT-05', 'AT-06', 'AT-07', 'AT-09', 'AT-10', 'AT-11', 'AT-12'],
  isolation: ['AT-01', 'AT-04', 'AT-05', 'AT-08', 'AT-09', 'AT-10', 'AT-12'],
  revocation: ['AT-08', 'AT-10'],
  private_documents: ['AT-09'],
  transaction_reliability: ['AT-03', 'AT-05'],
  provider_delivery: ['AT-01', 'AT-09', 'AT-10', 'AT-11'],
  accessibility: ['AT-01'],
  defect_review: CASES,
  deployment_recovery: ['AT-01'],
});
const validSha = x => typeof x === 'string' && /^[a-f0-9]{40}$/.test(x);
const observed = (value, now, windowStart) => {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) return false;
  const t = Date.parse(value);
  return Number.isFinite(t) && t >= windowStart && t <= now;
};
const artifact = value => typeof value === 'string' && (
  /^https:\/\/github\.com\/info-rbp\/proinspect\/actions\/runs\/[1-9]\d*$/.test(value) ||
  /^artifacts\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(value)
) && !/(?:^|\/)\.\.(?:\/|$)/.test(value);
const containsSecrets = value => /(?:sk_(?:test|live)_[a-z0-9]{8,}|whsec_[a-z0-9]{8,}|-----BEGIN (?:RSA )?PRIVATE KEY-----|[?&](?:token|code|session|secret|password)=|(?:cookie|authorization|set-cookie)\s*:)/i.test(JSON.stringify(value));

export function assess(evidence, expectedSource, clock = Date.now()) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) throw new Error('Evidence object required');
  if (!validSha(expectedSource) || evidence.sourceSha !== expectedSource) throw new Error('Source mismatch');
  if (containsSecrets(evidence)) throw new Error('Evidence must never contain credentials or authentication links');
  if (evidence.schema !== 2 || evidence.environment !== 'production' || evidence.dataMode !== 'approved-synthetic')
    throw new Error('Invalid environment or schema');
  const windowStart = clock - 24 * 60 * 60 * 1000;
  if (!observed(evidence.observedAt, clock, windowStart)) throw new Error('Stale evidence');
  const cases = {};
  for (const id of CASES) {
    const x = evidence.cases?.[id];
    cases[id] = x?.status === 'pass' && x.sourceSha === expectedSource &&
      x.positiveAccessChecked === true && x.negativeAccessChecked === true &&
      observed(x.observedAt, clock, windowStart) && artifact(x.evidenceRef) ? 'pass' : 'blocked';
  }
  const unique = new Set();
  let identitiesValid = true;
  for (const role of ROLES) {
    const x = evidence.identities?.[role];
    if (!x || x.authenticated !== true || x.authorisedScope !== true ||
      x.accessRevocationChecked !== true || x.emailLinkRedeemed !== true || x.turnstileChecked !== true ||
      x.sourceSha !== expectedSource || !observed(x.observedAt, clock, windowStart) || !artifact(x.evidenceRef) ||
      typeof x.identityRef !== 'string' || !/^[a-zA-Z0-9_-]{4,120}$/.test(x.identityRef) || unique.has(x.identityRef)) {
      identitiesValid = false;
      break;
    }
    unique.add(x.identityRef);
  }
  if (unique.size !== ROLES.length) identitiesValid = false;
  const reviewValid = evidence.releaseReview?.decision === 'approved' &&
    /^[a-zA-Z0-9 _.-]{3,100}$/.test(evidence.releaseReview?.reviewerRef ?? '') &&
    artifact(evidence.releaseReview?.evidenceRef) &&
    observed(evidence.releaseReview?.observedAt, clock, windowStart) &&
    Array.isArray(evidence.defects) && !evidence.defects.some(d =>
      ['critical', 'high'].includes(d.severity) && d.status !== 'resolved');
  const deploymentValid = evidence.deployment?.workerSha === expectedSource &&
    evidence.deployment?.recoveryVerified === true && artifact(evidence.deployment?.evidenceRef) &&
    observed(evidence.deployment?.observedAt, clock, windowStart);
  const criteria = {};
  for (const [id, required] of Object.entries(REQUIRED_CASES)) {
    const x = evidence.criteria?.[id];
    const complete = x?.status === 'pass' && x.sourceSha === expectedSource &&
      observed(x.observedAt, clock, windowStart) && artifact(x.evidenceRef) &&
      Array.isArray(x.caseIds) && required.every(caseId => x.caseIds.includes(caseId) && cases[caseId] === 'pass');
    const verified = complete &&
      (id !== 'identities' || identitiesValid) &&
      (id !== 'defect_review' || reviewValid) &&
      (id !== 'deployment_recovery' || deploymentValid);
    criteria[id] = { status: verified ? 'pass' : 'blocked' };
  }
  const counts = {
    criteriaPassed: Object.values(criteria).filter(x => x.status === 'pass').length,
    criteriaTotal: Object.keys(REQUIRED_CASES).length,
    casesPassed: Object.values(cases).filter(x => x === 'pass').length,
    casesTotal: CASES.length,
    identitiesPassed: identitiesValid ? ROLES.length : 0,
    identitiesTotal: ROLES.length,
  };
  return {
    schema: 2, sourceSha: expectedSource,
    acceptedForProduction: counts.criteriaPassed === counts.criteriaTotal &&
      counts.casesPassed === counts.casesTotal && identitiesValid && reviewValid && deploymentValid,
    criteria, cases, counts,
    note: 'The assessor validates the evidence contract only; a human must independently verify artifact authenticity and service delivery.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2]) {
  try {
    const report = assess(JSON.parse(readFileSync(process.argv[2], 'utf8')),
      process.argv[3] || process.env.EXPECTED_SOURCE_SHA);
    mkdirSync('artifacts', { recursive: true });
    writeFileSync('artifacts/portal-acceptance-result.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report.counts));
    if (!report.acceptedForProduction) {
      console.error('NO GO: authenticated eight-portal acceptance is incomplete');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('NO GO: ' + error.message);
    process.exitCode = 1;
  }
}
