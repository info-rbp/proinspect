import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { listingInput,leadInput,safeApplicationUrl,propertyUrl,displayPrice,handoffDisclaimer,listingApplicationAction } from '../packages/marketing/leasing.ts';
const text=(p:string)=>readFileSync(p,'utf8');
test('leasing is marketing-only, with separated residential/commercial public routes',()=>{
 const routes=text('apps/platform/app/routes.ts');
 for(const frag of ["properties-for-lease/:kind","properties-for-lease/:kind/:slug","leasing-index.tsx","leasing-sector.tsx","leasing-property.tsx"])assert.ok(routes.includes(frag));
 const layout=text('apps/platform/app/routes/public-layout.tsx');
 assert.ok(layout.includes('MarketingHeader'));
 const chrome=text('apps/marketing/app/components/site-chrome.tsx');
 assert.ok(chrome.includes('to="/properties-for-lease"'));
 const site=text('apps/platform/app/lib/public-routes.ts');
 assert.ok(site.includes('properties-for-lease'));
 assert.ok(site.includes('cancel'));
});
test('property claims distinguish ProInspect from leasing representatives',()=>{
 assert.match(handoffDisclaimer,/on behalf of/i);
 assert.match(handoffDisclaimer,/not the leasing agent/i);
 assert.match(handoffDisclaimer,/not.*landlord|landlord.*not/i);
 assert.equal(propertyUrl('residential','sample-unit'),'/properties-for-lease/residential/sample-unit');
 assert.equal(displayPrice(65000,'week'),'$650 / week');
});
test('external application URLs are HTTPS-only',()=>{
 assert.equal(safeApplicationUrl('javascript:alert(1)'),null);
 assert.equal(safeApplicationUrl('http://example.org/apply'),null);
 assert.equal(safeApplicationUrl('https://u:p@example.org/apply'),null);
 assert.equal(safeApplicationUrl('https://example.org/apply'),'https://example.org/apply');
});
test('leasing validation enforces representative, suburb, listing kind, and contact consent',()=>{
 const draft={propertyId:'prop_abc',instructedByClientId:'cli_abc',kind:'residential',slug:'test-house',
 title:'Rental house in Perth',description:'An example rental listing description that exceeds fifty characters.',displayAddress:'1 Test Street',suburb:'Perth',postcode:'6000',agentName:'Example Leasing Agency',agentRole:'leasing_agent' as const,applicationUrl:'https://example.org/apply'};
 assert.equal(listingInput.safeParse(draft).success,true);
 assert.equal(listingInput.safeParse({...draft,postcode:'wrong'}).success,false);
 assert.equal(listingInput.safeParse({...draft,kind:'strata'}).success,false);
 assert.equal(listingInput.safeParse({...draft,agentRole:'proinspect'}).success,false);
 const lead={requestKey:'00000000-0000-4000-8000-000000000001',listingId:'lst_abc',kind:'interest',sessionId:null,name:'Example Person',email:'TEST@example.org',phone:'0412 345 678',consent:true,message:''};
 assert.equal(leadInput.safeParse(lead).success,true);
 assert.equal(leadInput.safeParse({...lead,consent:false}).success,false);
 assert.equal(leadInput.safeParse({...lead,kind:'inspection',sessionId:null}).success,false);
 assert.equal(leadInput.safeParse({...lead,kind:'inspection',sessionId:'lsn_abc'}).success,true);
});
test('future Google Apps Script email events remain inert',()=>{
 const sql=text('database/migrations/0009_leasing.sql');
 assert.match(sql,/pending_integration/);
 for(const kind of ['registration.received','interest.received','registration.cancelled','session.updated','session.cancelled','session.reminder'])assert.ok(sql.includes(kind));
 const api=text('apps/platform/worker/api.ts');
 assert.ok(api.includes('/api/public/leasing'));
 assert.ok(api.includes('staffLeasing(env,user,request'));
 assert.ok(!api.includes('/api/integrations/leasing-google-script'));
});


test('public listing CTAs enforce the exact applicant release gate and avoid unusable application links',()=>{
 const base={kind:'residential',slug:'unit-6-273-fulham-street-cloverdale',applicationMode:'proinspect',applicationUrl:null};
 assert.deepEqual(listingApplicationAction({...base,rentalReady:false}),{type:'interest',href:'#leasing-enquiry'});
 assert.deepEqual(listingApplicationAction({...base,rentalReady:true}),{type:'proinspect',href:'/properties-for-lease/residential/unit-6-273-fulham-street-cloverdale/apply'});
 assert.deepEqual(listingApplicationAction({...base,applicationMode:'unavailable',rentalReady:true}),{type:'interest',href:'#leasing-enquiry'});
 assert.deepEqual(listingApplicationAction({...base,kind:'commercial',rentalReady:true}),{type:'interest',href:'#leasing-enquiry'});
 assert.deepEqual(listingApplicationAction({...base,applicationMode:'external',applicationUrl:'https://example.test/approved',rentalReady:false}),{type:'external',href:'https://example.test/approved'});
 assert.deepEqual(listingApplicationAction({...base,applicationMode:'external',applicationUrl:'javascript:alert(1)',rentalReady:false}),{type:'interest',href:'#leasing-enquiry'});
 const page=text('apps/marketing/app/routes/leasing-property.tsx');
 assert.match(page,/releaseFeatureReady\(env,'rental'\)/);
 assert.match(page,/leasing-gallery--single/);
 assert.match(page,/id="leasing-enquiry"/);
 assert.match(page,/id="leasing-application"/);
 assert.match(page,/Register your interest/);
 assert.match(page,/Start or resume application/);
 assert.match(text('packages\/ui\/leasing.css'),/leasing-gallery--single img:first-child/);
 const server=text('apps/platform/worker/features/rental-applications.server.ts');
 assert.match(server,/enabled:rentalEnabled\(env\)&&await releaseFeatureReady\(env,'rental'\)/);
});

test('unavailable published property application URLs show a safe enquiry fallback instead of a 500',()=>{
 const page=text('apps/marketing/app/routes/rental-start.tsx');
 assert.match(page,/publicListing\(env,'residential',slug\)/);
 assert.match(page,/if\(!published\)throw new Response\('Property not found'/);
 assert.match(page,/l\.application_mode!=='proinspect'/);
 assert.match(page,/return data\(unavailable,\{headers\}\)/);
 assert.match(page,/unavailable\?<div role="status"/);
 assert.match(page,/Online applications not yet available/);
 assert.match(page,/\#leasing-enquiry/);
 assert.match(page,/if\(!page.enabled\)return fail/);
 assert.match(page,/X-Robots-Tag/);
});

test('Perth inspection time conversion rejects malformed or rollover values',async()=>{
 const {perthLocalToUtc,perthUtcToLocal,futureInspectionWindow}=await import('../packages/marketing/leasing-operations.ts');
 assert.equal(perthLocalToUtc('2026-12-12T09:00'),'2026-12-12T01:00:00.000Z');
 assert.equal(perthUtcToLocal('2026-12-12T01:00:00.000Z'),'2026-12-12T09:00');
 assert.throws(()=>perthLocalToUtc('2026-02-30T09:00'));
 assert.throws(()=>perthLocalToUtc('2026-12-12T99:00'));
 assert.throws(()=>perthLocalToUtc('2026-12-12'));
 assert.equal(futureInspectionWindow('2026-12-12T01:00:00.000Z','2026-12-12T02:00:00.000Z',Date.parse('2026-12-10T00:00:00Z')),true);
 assert.equal(futureInspectionWindow('2026-12-12T01:00:00.000Z','2026-12-12T01:00:00.000Z',Date.parse('2026-12-10T00:00:00Z')),false);
 assert.equal(futureInspectionWindow('2026-12-12T01:00:00.000Z','2026-12-12T02:00:00.000Z',Date.parse('2026-12-13T00:00:00Z')),false);
});
test('per-property readiness fails closed on provider release flags and independent approval',async()=>{
 const {residentialApplicationReadiness}=await import('../packages/marketing/leasing-operations.ts');
 const base={listingKind:'residential',listingStatus:'published',applicationMode:'proinspect',authorityReference:'AUTH-123',recipientVerifiedAt:'2026-11-01T00:00:00Z',approvalState:'approved',noticeMode:'not_used',noticeCount:0,retentionConfigured:true,
 scannerConfigured:true,handoffConfigured:true,intakeReleaseApproved:true,scannerReleaseApproved:true,handoffReleaseApproved:true};
 assert.equal(residentialApplicationReadiness(base).technicalReady,true);
 for(const field of ['retentionConfigured','scannerConfigured','handoffConfigured','intakeReleaseApproved','scannerReleaseApproved','handoffReleaseApproved'] as const){
  const result=residentialApplicationReadiness({...base,[field]:false});
  assert.equal(result.technicalReady,false);
  assert.equal(result.checks.some(x=>!x.passed),true);
 }
 assert.equal(residentialApplicationReadiness({...base,recipientVerifiedAt:null}).technicalReady,false);
 assert.equal(residentialApplicationReadiness({...base,applicationMode:'external'}).technicalReady,false);
});
test('staff leasing supports per-listing inspection scheduling and safe application readiness',()=>{
 const ui=text('apps/platform/app/routes/leasing-administration.tsx');
 for(const fragment of ['ListingInspectionManagement','Schedule a new inspection','session-edit/','session-status/','Application release checklist','perthLocalToUtc','View restricted registrations'])assert.ok(ui.includes(fragment),fragment);
 const backend=text('apps/platform/worker/features/leasing.server.ts');
 assert.match(backend,/residentialApplicationReadiness/);
 assert.match(backend,/releaseFeatureReady\(env,'rental_scanner'\)/);
 assert.match(backend,/releaseFeatureReady\(env,'rental_script'\)/);
 assert.match(backend,/futureInspectionWindow\(d.startsAt,d.endsAt\)/);
 assert.match(backend,/SESSION_NOT_STARTED/);
});

test('staff rental application queue filtering and agency-decision handover preserve role and approval boundaries',()=>{
 const list=text('apps/platform/app/routes/rental-applications.tsx');
 const backend=text('apps/platform/worker/features/rental-review.server.ts');
 const detail=text('apps/platform/app/routes/rental-application-detail.tsx');
 const leasing=text('apps/platform/app/routes/leasing-administration.tsx');
 assert.match(list,/searchParams\.get\('listingId'\)/);
 assert.match(backend,/staff\(user\);/);
 assert.match(backend,/rental_application_outcomes WHERE application_id/);
 assert.match(detail,/d\.outcome\.outcome==='successful'/);
 assert.match(detail,/does not make an offer or automatically create a tenancy/);
 assert.match(detail,/Open tenancy creation and invitation/);
 assert.match(leasing,/View this property.s rental application queue/);
 const tenancy=text('apps/platform/worker/api.ts');
 assert.match(tenancy,/TENANCY_REVIEW_REQUIRED/);
 assert.match(tenancy,/MANAGER_REQUIRED/);
});
