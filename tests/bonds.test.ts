import test from 'node:test';
import assert from 'node:assert/strict';
import {
 WA_BOND_RULES, WA_BOND_FORMS, waResidentialBondLimit, bondWorksheetErrors,
 type BondWorkflowCode,
} from '../packages/validation/wa-bonds.ts';

test('all 23 WA bond scenarios are documented and mapped to a verified route',()=>{
 const codes=Object.keys(WA_BOND_RULES).sort();
 assert.deepEqual(codes,Array.from({length:23},(_,i)=>'B'+String(i+1).padStart(2,'0')));
 for(const code of codes){
  const c=WA_BOND_RULES[code as BondWorkflowCode];
  assert.ok(c.name.length>=8);
  assert.ok(c.notes.length>=25);
  if(['lodgement','variation','release'].includes(c.form))
   assert.ok(WA_BOND_FORMS[c.form as keyof typeof WA_BOND_FORMS].startsWith('https://www.consumerprotection.wa.gov.au/'));
 }
 assert.equal(WA_BOND_RULES.B01.form,'lodgement');
 assert.equal(WA_BOND_RULES.B04.form,'variation');
 assert.equal(WA_BOND_RULES.B12.form,'release');
 assert.equal(WA_BOND_RULES.B13.allowTenantInitiation,true);
 assert.equal(WA_BOND_RULES.B20.form,'restricted');
 assert.equal(WA_BOND_RULES.B23.form,'legacy');
});
test('WA residential bond caps are enforced without inventing the high-rent statutory rule',()=>{
 assert.deepEqual(waResidentialBondLimit(60000,240000,35000),[]);
 assert.match(waResidentialBondLimit(60000,250000,0)[0],/four weeks/);
 assert.match(waResidentialBondLimit(60000,100000,35001)[0],/pet bond/);
 assert.deepEqual(waResidentialBondLimit(125000,520000,0),[]);
 assert.match(waResidentialBondLimit(0,240000,0)[0],/positive/);
});
test('form-specific worksheet prevents missing names, invalid dates and restricted intake',()=>{
 const worksheet={
  tenancyStart:'2026-10-01',tenantLegalNames:'Fixture Tenant',landlordLegalName:'Fixture Landlord',paymentDate:'2026-09-30'
 };
 assert.deepEqual(bondWorksheetErrors('B01',worksheet),[]);
 assert.ok(bondWorksheetErrors('B01',{tenancyStart:'2026-10-01'}).length>=3);
 assert.ok(bondWorksheetErrors('B01',{...worksheet,tenancyStart:'01/10/2026'}).some(x=>x.includes('YYYY-MM-DD')));
 assert.ok(bondWorksheetErrors('B04',{incomingTenantName:'Fixture New Tenant',effectiveDate:'2026-10-01',tenantConsentReference:'VAR-123'}).length===0);
 assert.ok(bondWorksheetErrors('B20',{}).length>0);
 assert.ok(bondWorksheetErrors('B23',{}).length>0);
});
