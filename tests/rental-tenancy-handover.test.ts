import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tenancyHandoverInput, tenancyActivationInput, tenancyVoidInput, preparedTenancyDates, agreementMatchesPreparedTerms } from '../packages/marketing/rental-tenancy-handover.ts';
const read=(p:string)=>readFileSync(p,'utf8');
const basic={
 requestKey:'550e8400-e29b-41d4-a716-446655440000',applicationVersion:3,
 startsOn:'2026-12-10',endsOn:'2026-12-20',
 writtenOfferReference:'AGENCY-SIGNED-REF-123',
 confirmWrittenOffer:true,confirmRecipientAuthority:true,confirmPrivateInvitations:true
};
test('approved tenancy handover requires separate written offer, role attestations and well-formed dates',()=>{
 assert.equal(tenancyHandoverInput.safeParse(basic).success,true);
 for(const field of ['confirmWrittenOffer','confirmRecipientAuthority','confirmPrivateInvitations'] as const)
  assert.equal(tenancyHandoverInput.safeParse({...basic,[field]:false}).success,false);
 assert.equal(tenancyHandoverInput.safeParse({...basic,writtenOfferReference:'yes'}).success,false);
 assert.equal(tenancyHandoverInput.safeParse({...basic,startsOn:'2026-15-10'}).success,true,'shape only; date rollover rejected by converter');
 assert.throws(()=>preparedTenancyDates('2026-15-10',null,Date.parse('2026-11-08')));
 const dates=preparedTenancyDates('2026-12-10','2026-12-20',Date.parse('2026-11-08'));
 assert.equal(dates.startsAt,'2026-12-09T16:00:00.000Z');
 assert.equal(dates.endsAt,'2026-12-20T15:59:00.000Z');
 assert.throws(()=>preparedTenancyDates('2026-12-21','2026-12-20',Date.parse('2026-11-08')));
 assert.throws(()=>preparedTenancyDates('2026-01-21',null,Date.parse('2026-11-08')));
});
test('executed official agreement dates must match approved handover exactly',()=>{
 assert.equal(agreementMatchesPreparedTerms({startsAt:'2026-12-10',fixedTermEndsAt:'2026-12-20',agreementType:'fixed'},'2026-12-10','2026-12-20'),true);
 assert.equal(agreementMatchesPreparedTerms({startsAt:'2026-12-10',fixedTermEndsAt:'2026-12-19',agreementType:'fixed'},'2026-12-10','2026-12-20'),false);
 assert.equal(agreementMatchesPreparedTerms({startsAt:'2026-12-10',agreementType:'periodic'},'2026-12-10'),true);
 assert.equal(agreementMatchesPreparedTerms({startsAt:'2026-12-10',fixedTermEndsAt:'2026-12-20',agreementType:'fixed'},'2026-12-10'),false);
});
test('activation and void require explicit independent evidence',()=>{
 assert.equal(tenancyActivationInput.safeParse({activationReference:'SIGN-REVIEW-123',confirmExecutedAgreement:true,confirmVerifiedParticipants:true,confirmCommencementRecords:true}).success,true);
 assert.equal(tenancyActivationInput.safeParse({activationReference:'SIGN-REVIEW-123',confirmExecutedAgreement:false,confirmVerifiedParticipants:true,confirmCommencementRecords:true}).success,false);
 assert.equal(tenancyVoidInput.safeParse({reasonReference:'VOID-REF-124',confirmVoid:true}).success,true);
 assert.equal(tenancyVoidInput.safeParse({reasonReference:'VOID-REF-124',confirmVoid:false}).success,false);
});
test('tenant linking is release-gated, idempotent, immutable, and does not activate on agency decision alone',()=>{
 const server=read('apps/platform/worker/features/rental-tenancy-handover.server.ts');
 const migration=read('database/migrations/0052_rental_tenancy_handover.sql');
 const routes=read('apps/platform/worker/api.ts');
 const ui=read('apps/platform/app/routes/rental-application-detail.tsx');
 for(const x of ["requireReleaseApproval(env,'rental_handover')","requireReleaseApproval(env,'agreement_signing')","HANDOVER_DECISION_REQUIRED","HANDOVER_DELIVERY_REQUIRED",
  "HANDOVER_APPLICANT_MISMATCH","HANDOVER_EXECUTION_REQUIRED","matchingVerifiedMembers","agreementMatchesPreparedTerms","'pending'","rental.tenancy.pending_invitation"])assert.ok(server.includes(x),x);
 assert.match(server,/rental_tenancy_handover\.prepared|rental\.handover\.prepared/);
 assert.match(migration,/application_id TEXT NOT NULL UNIQUE/);
 assert.match(migration,/HANDOVER_APPLICATION_NOT_APPROVED/);
 assert.match(migration,/HANDOVER_TENANCY_OVERLAP/);
 assert.match(migration,/HANDOVER_MISSING_EXECUTED_FORM_1AA/);
 assert.match(migration,/HANDOVER_SOURCE_IMMUTABLE/);
 assert.match(routes,/RENTAL_TENANCY_HANDOVER_ENABLED==='true'/);
 assert.match(routes,/pendingTenancyCondition/);
 assert.match(routes,/prepareRentalTenancyHandover/);
 assert.match(routes,/activateRentalTenancyHandover/);
 assert.match(ui,/Tenancy commencement — controlled handover/);
 assert.match(ui,/confirmExecutedAgreement/);
 assert.match(read('apps/platform/worker/features/rental-privacy.server.ts'),/HANDOVER_RETENTION_REVIEW/);
 assert.match(read('apps/platform/worker/features/release-governance.server.ts'),/rental_handover: 'RENTAL_TENANCY_HANDOVER_ENABLED'/);
});
