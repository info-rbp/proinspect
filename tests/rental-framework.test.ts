import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rentalApprovalInput,rentalOutcomeInput,rentalReferenceCheckInput,rentalApplicationCc,checkedHttpsEndpoint,nextRetry } from '../packages/marketing/rental-governance.ts';
const read=(p:string)=>readFileSync(p,'utf8');
test('rental approvals require affirmative checks and a substantial written authority statement',()=>{
 const input={version:3,authorityAttestation:'The signed authority was checked against the instructing landlord and was approved.',authorityDocumentReference:'AUTH-ABC-123',privacyNoticeVersion:'privacy-2026-10',confirmAuthority:true,confirmNotice:true,confirmRecipient:true};
 assert.equal(rentalApprovalInput.safeParse(input).success,true);
 assert.equal(rentalApprovalInput.safeParse({...input,confirmRecipient:false}).success,false);
 assert.equal(rentalApprovalInput.safeParse({...input,authorityAttestation:'yes'}).success,false);
});
test('rental outcomes are only externally communicated, documented yes/no decisions',()=>{
 const outcome={version:2,outcome:'successful',authorityReference:'agency-email-321',note:'Decision received from the authorised leasing representative.',notifyApplicants:true};
 assert.equal(rentalOutcomeInput.safeParse(outcome).success,true);
 assert.equal(rentalOutcomeInput.safeParse({...outcome,outcome:'recommended'}).success,false);
});
test('reference checks are consent-gated and require evidence',()=>{
 const record={applicantId:'rap-example-01',target:'personal_1',outcome:'confirmed',method:'phone',evidenceReference:'CALL-2026-123',note:'Reference contacted and confirmed dates of tenancy.'};
 assert.equal(rentalReferenceCheckInput.safeParse(record).success,true);
 assert.equal(rentalReferenceCheckInput.safeParse({...record,evidenceReference:''}).success,false);
 assert.equal(rentalReferenceCheckInput.safeParse({...record,method:'not_contacted'}).success,false);
 assert.equal(rentalReferenceCheckInput.safeParse({...record,outcome:'not_applicable',method:'phone'}).success,false);
 const source=read('apps/platform/worker/features/rental-review.server.ts');
 assert.match(source,/REFERENCE_CONSENT_REQUIRED/);
 assert.match(source,/rental_application_reference_checks/);
 const migration=read('database/migrations/0048_rental_reference_checks.sql');
 assert.match(migration,/rental_reference_check_applicant_guard/);
 assert.match(migration,/rental_reference_check_immutable_delete/);
 assert.match(read('apps/platform/worker/features/rental-privacy.server.ts'),/DELETE FROM rental_application_reference_checks/);
 assert.equal(JSON.parse(read('apps/platform/wrangler.jsonc')).env.connected.vars.RENTAL_APPLICATIONS_ENABLED,'false');
});
test('only independently allowed HTTPS endpoints can receive applicant information',()=>{
 assert.equal(checkedHttpsEndpoint('http://script.google.com/macro','script.google.com'),null);
 assert.equal(checkedHttpsEndpoint('https://other.example/send','script.google.com'),null);
 assert.equal(checkedHttpsEndpoint('https://script.google.com/macros/s/test/exec','script.google.com')?.hostname,'script.google.com');
 assert.equal(checkedHttpsEndpoint('https://person:password@script.google.com/x','script.google.com'),null);
 assert.ok(nextRetry(2,new Date('2026-10-25T00:00:00Z').getTime()).startsWith('2026-10-25T00:04:'));
});
test('public rental intake requires explicit approval and verified recipient',()=>{
 const src=read('apps/platform/worker/features/rental-applications.server.ts');
 assert.match(src,/rental_approval_state==='approved'/);
 assert.match(src,/rental_recipient_verified_at IS NOT NULL/);
 const sql=read('database/migrations/0029_rental_application_completion.sql');
 assert.match(sql,/rental_listing_changes_revoke_approval/);
 assert.match(sql,/rental_recipient_challenge_listing/);
 assert.match(sql,/rental_listing_approval_immutable_update/);
});
test('document scanning remains gated and cannot claim a clean scan without callback attestation',()=>{
 const dispatch=read('apps/platform/worker/features/rental-scan-dispatch.server.ts');
 assert.match(dispatch,/RENTAL_SCANNER_ENABLED!=='true'/);
 assert.match(dispatch,/RESTRICTED_DOCUMENTS\.get/);
 assert.match(dispatch,/scan_status='pending'/);
 const callback=read('apps/platform/worker/features/rental-malware.server.ts');
 assert.match(callback,/verifyScanCallback/);
 assert.match(callback,/crypto\.subtle\.verify/);
});
test('Lighthouse receives a separate ProInspect CC without copying other landlord applications',()=>{
 assert.equal(rentalApplicationCc('cli_lighthouse_property_group_pty_ltd'),'info@proinspect.systems');
 assert.equal(rentalApplicationCc('cli_other_landlord'),null);
 assert.equal(rentalApplicationCc(''),null);
 const dispatch=read('apps/platform/worker/features/rental-script-dispatch.server.ts');
 assert.match(dispatch,/l\.instructed_by_client_id/);
 assert.match(dispatch,/cc:rentalApplicationCc\(h.instructed_by_client_id\)/);
 const appsScript=read('integrations/apps-script/rental-application-handoff.gs');
 assert.match(appsScript,/PROINSPECT_ALLOWED_CC/);
 assert.match(appsScript,/CC_MISMATCH/);
 assert.match(appsScript,/CC_NOT_ALLOWED/);
 assert.match(appsScript,/if\(cc\)mailOptions.cc=cc/);
 assert.match(appsScript,/MailApp\.sendEmail\(mailOptions\)/);
});
test('Apps Script dispatch requires explicit activation, verified receipt, and no unrestricted R2 URLs',()=>{
 const src=read('apps/platform/worker/features/rental-script-dispatch.server.ts');
 assert.match(src,/RENTAL_APPS_SCRIPT_ENABLED!=='true'/);
 assert.match(src,/receipt.accepted===true/);
 assert.doesNotMatch(src,/getSignedUrl|publicObjectUrl/);
 const gs=read('integrations/apps-script/rental-application-handoff.gs');
 assert.match(gs,/computeHmacSha256Signature/);
 assert.match(gs,/PROINSPECT_ALLOWED_RECIPIENTS/);
 assert.match(gs,/SEND_OUTCOME_UNKNOWN/);
});
test('privacy purge handles linked decisions and scanning records before deleting applicants',()=>{
 const src=read('apps/platform/worker/features/rental-privacy.server.ts');
 assert.match(src,/DELETE FROM rental_document_scan_jobs/);
 assert.match(src,/DELETE FROM rental_application_outcomes/);
 assert.match(src,/DELETE FROM rental_handoff_receipts/);
 const app=read('apps/platform/worker/features/rental-applications.server.ts');
 assert.match(app,/recoverRentalAccess/);
 assert.match(app,/recover-email:/);
});
