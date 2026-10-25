#!/usr/bin/env node
/** Generate a NO GO template. There is intentionally no --all-pass command. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { SCENARIOS, ROLE_ALIASES } from './acceptance-manifest.mjs';
import { ROLES, REQUIRED_CASES } from './acceptance-gate.mjs';
const sourceSha = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(sourceSha || '')) {
  console.error('Usage: node scripts/portal-testing/acceptance-evidence-template.mjs <deployed-40-character-sha>');
  process.exit(1);
}
const identities = Object.fromEntries(ROLES.map(role => [role, {status:'blocked',
  identityRef:null, authenticated:false, emailLinkRedeemed:false, turnstileChecked:false,
  authorisedScope:false, accessRevocationChecked:false, sourceSha,
  observedAt:null, evidenceRef:null }]));
const cases = Object.fromEntries(SCENARIOS.map(({id,actors,success,denial,cleanup}) => [id, {
  status:'blocked', actors, positiveExpected:success, negativeExpected:denial, cleanup,
  positiveAccessChecked:false,negativeAccessChecked:false,sourceSha,observedAt:null,evidenceRef:null,
}]));
const criteria = Object.fromEntries(Object.entries(REQUIRED_CASES).map(([id,caseIds])=>[id, {
  status:'blocked',sourceSha,observedAt:null,evidenceRef:null,caseIds,
}]));
const template = {schema:2,sourceSha,environment:'production',dataMode:'approved-synthetic',
  observedAt:null,identities,cases,criteria,defects:[],
  deployment:{workerSha:null,recoveryVerified:false,observedAt:null,evidenceRef:null},
  releaseReview:{decision:'pending',reviewerRef:null,observedAt:null,evidenceRef:null},
  operatorNotes:'NO GO template. Fill only after real hosted evidence and independent review. Never record session cookies or magic links.'};
mkdirSync('artifacts/portal-acceptance',{recursive:true});
const path='artifacts/portal-acceptance/hosted-evidence-template.json';
writeFileSync(path,JSON.stringify(template,null,2)+'\n');
console.log('Created NO GO template: '+path+' (all '+Object.keys(identities).length+' identities and '+SCENARIOS.length+' cases blocked)');
