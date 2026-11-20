import test from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_PLANS, INSPECTION_ONLY_SERVICES, INSPECTION_ONLY_SCOPE, MAINTENANCE_APPROVAL } from '../packages/marketing/public-facts.ts';
import { PUBLIC_LEGAL_APPROVAL, PUBLIC_LEGAL_DRAFTS } from '../packages/marketing/legal-drafts.ts';
import { ENGAGEMENTS } from '../packages/marketing/content.ts';
import { SECTOR_OVERVIEWS } from '../packages/marketing/sector-overviews.ts';
import { permittedExperienceSections, effectiveExperienceLabels } from '../packages/domain/portal-experience.ts';

test('workbook offer distinguishes room and commercial-unit pricing without adding subscriptions', () => {
  assert.deepEqual(PUBLIC_PLANS.map(p=>[p.id,p.monthlyExGst,p.billingBasis]),[
    ['residential-inspection-only',20,'residential-property-or-room'],
    ['residential-all-inclusive',150,'residential-property-or-room'],
    ['commercial-all-inclusive',150,'commercial-unit'],
  ]);
  assert.deepEqual(INSPECTION_ONLY_SERVICES,[
    'Quarterly routine inspection','Incoming Property Condition Report','Exit inspection',
    'Report generated on the ProInspect Platform','Tenant communication',
  ]);
  assert.match(INSPECTION_ONLY_SCOPE,/rolling 12 months/);
  assert.match(INSPECTION_ONLY_SCOPE,/no carry-over/);
  assert.match(INSPECTION_ONLY_SCOPE,/schedule confirms PCR and exit allowances/);
  assert.match(MAINTENANCE_APPROVAL,/approve the quote before expenditure/);
});
test('public descriptions separate confirmed service types from unfinished commercial schedules', () => {
  const inspection=ENGAGEMENTS['inspection-plans'];
  for(const name of INSPECTION_ONLY_SERVICES)assert.ok(inspection.sections.some(s=>s[1].includes(name)));
  assert.match(SECTOR_OVERVIEWS.commercial.description,/per commercial unit/);
  assert.doesNotMatch(JSON.stringify(SECTOR_OVERVIEWS.commercial),/quarterly|65.hours|two inspections|four inspections|\$250/i);
  assert.ok(Object.values(PUBLIC_LEGAL_APPROVAL).every(v=>!v.approved));
  assert.match(JSON.stringify(PUBLIC_LEGAL_DRAFTS['subscription-terms']),/remain unapproved/);
  assert.doesNotMatch(JSON.stringify(PUBLIC_LEGAL_DRAFTS['booking-policy']),/may order without an account/);
});
test('commercial occupants keep narrow preference destinations when branches are combined', () => {
  const w={kind:'commercial-occupant' as const,scopeId:'occ_test',name:'Premises',role:'occupant',href:'/w/commercial-occupant/occ_test',experienceTags:['co_living']};
  assert.deepEqual(permittedExperienceSections(w),['overview','occupant-premises','occupant-requests']);
  assert.equal(effectiveExperienceLabels(w)[0],'Commercial occupant');
  assert.ok(!permittedExperienceSections(w).includes('finance'));
  assert.ok(!permittedExperienceSections(w).includes('co-living'));
});
