import assert from 'node:assert/strict';
import test from 'node:test';
import { WA_RESIDENTIAL_FORMS, waAvailableForms, waForm } from '../packages/wa-residential/forms.ts';
import {
  responseDeadline, entryNoticeAdvisory, preIssueDependencies,
  WA_ADVISORY_RULE_VERSION,
} from '../packages/wa-residential/rules.ts';

test('WA prescribed forms registry includes all stages while excluding confidential Form 2 and legacy bond disposal',()=>{
 const stages=new Set(WA_RESIDENTIAL_FORMS.map(f=>f.stage));
 assert.deepEqual([...stages].sort(),['active','bond','breach','commencement','ending']);
 assert.equal(waForm('WA_FORM_2'),undefined);
 assert.equal(waAvailableForms('commercial').length,0);
 assert.equal(waAvailableForms('building').length,0);
 assert.ok(waAvailableForms('tenant').some(f=>f.code==='WA_FORM_25'));
 assert.ok(!waAvailableForms('tenant').some(f=>f.code==='WA_FORM_19'));
 assert.ok(!waAvailableForms('landlord').some(f=>f.code==='WA_BOND_DISPOSAL'));
 assert.equal(waAvailableForms('staff').some(f=>f.code==='WA_FORM_2'),false);
});

test('Form 25/26 response clock is advisory and anchored to verified receipt, never automatic approval',()=>{
 const receipt='2026-10-05T11:30:00+08:00';
 for(const code of ['WA_FORM_25','WA_FORM_26']){
  const deadline=responseDeadline(code,receipt);
  assert.equal(deadline?.dueAt,'2026-10-19T03:30:00.000Z');
  assert.equal(deadline?.legallyVerified,false);
  assert.equal(deadline?.ruleVersion,WA_ADVISORY_RULE_VERSION);
 }
 assert.equal(responseDeadline('WA_FORM_19',receipt),null);
});

test('Form 19 routine and repair published time windows are checked separately from legal service',()=>{
 const receipt='2026-10-01T09:00:00+08:00';
 const within=entryNoticeAdvisory('routine',receipt,'2026-10-08T09:00:00+08:00');
 assert.equal(within.withinPublishedWindow,true);
 assert.equal(within.legallyVerified,false);
 assert.equal(entryNoticeAdvisory('routine',receipt,'2026-10-07T09:00:00+08:00').withinPublishedWindow,false);
 assert.equal(entryNoticeAdvisory('routine',receipt,'2026-10-16T09:00:00+08:00').withinPublishedWindow,false);
 assert.equal(entryNoticeAdvisory('repairs',receipt,'2026-10-04T09:00:00+08:00').withinPublishedWindow,true);
 assert.equal(entryNoticeAdvisory('repairs',receipt,'2026-10-03T09:00:00+08:00').withinPublishedWindow,false);
 assert.equal(entryNoticeAdvisory('other',receipt,'2026-10-15T09:00:00+08:00').withinPublishedWindow,false);
});

test('Termination and rent-related forms explicitly declare human legal-evidence dependencies',()=>{
 assert.ok(preIssueDependencies('WA_FORM_1A').includes('verified_prior_form_21'));
 assert.ok(preIssueDependencies('WA_FORM_1B').includes('verified_rent_ledger'));
 assert.ok(preIssueDependencies('WA_FORM_19').includes('matching_booking'));
 assert.ok(preIssueDependencies('WA_FORM_1').includes('issued_pcr_report'));
 assert.ok(preIssueDependencies('WA_BOND_RELEASE').includes('external_authority_confirmation'));
});
