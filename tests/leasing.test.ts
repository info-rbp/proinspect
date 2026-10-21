import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { listingInput,leadInput,safeApplicationUrl,propertyUrl,displayPrice,handoffDisclaimer } from '../packages/marketing/leasing.ts';
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
