import test from 'node:test';
import assert from 'node:assert/strict';
import {FORM_1AA_FIELDS,FORM_1AA_SECTIONS,validateForm1AA} from '../packages/wa-residential/form1aa.ts';
import {WA_FORM_SPECIFICATIONS,specFor} from '../packages/wa-residential/form-specifications.ts';
import {WA_RESIDENTIAL_FORMS,waAvailableForms} from '../packages/wa-residential/forms.ts';
test('every registered ordinary form has an explicit non-activating handling contract',()=>{
 assert.equal(WA_FORM_SPECIFICATIONS.length,WA_RESIDENTIAL_FORMS.length);
 for(const x of WA_RESIDENTIAL_FORMS){
  const spec=specFor(x.code);
  assert.ok(spec,x.code);assert.equal(spec.issuerEnabled,false);
  assert.equal(spec.stage,x.stage);
  assert.ok(spec.releaseChecks.length>=4);
  assert.ok(spec.templateUrl.startsWith('https://www.consumerprotection.wa.gov.au/'));
 }
 assert.equal(specFor('WA_FORM_2'),undefined);
 assert.equal(specFor('WA_FORM_1AA')?.route,'both_parties');
 assert.equal(specFor('WA_FORM_25')?.route,'tenant_request');
 assert.equal(specFor('WA_FORM_28')?.route,'tenant_response');
 assert.equal(specFor('WA_BOND_RELEASE')?.route,'physical_or_government');
 assert.ok(!waAvailableForms('landlord').some(x=>x.code==='WA_BOND_DISPOSAL'));
});
test('Form 1AA models parties, rent, bond, terms, service and attachments',()=>{
 assert.equal(FORM_1AA_SECTIONS.length,6);
 assert.equal(new Set(FORM_1AA_FIELDS.map(f=>f.key)).size,FORM_1AA_FIELDS.length);
 for(const k of ['lessorName','tenantNames','tenantElectronicNoticeConsent','premisesAddress','maximumOccupants','agreementType','startsAt','rentAmount','rentFirstDueAt','rentPaymentMethod','bondAmount','petBondAmount','waterUsageArrangement','strataBylawsProvided','specialTerms','reviewReference'])
  assert.ok(FORM_1AA_FIELDS.some(f=>f.key===k),k);
});
test('Form 1AA cannot activate signing with missing fields, wrong tenancy or invalid rent',()=>{
 const v:Record<string,unknown>={};
 for(const x of FORM_1AA_FIELDS.filter(x=>x.required))v[x.key]=x.type==='number'?100:x.type==='date'?'2026-10-30':'synthetic';
 v.agreementType='periodic';v.lessorElectronicNoticeConsent='yes';v.maximumOccupants=2;v.rentAmount=600;
 assert.deepEqual(validateForm1AA(v,2),[]);
 assert.ok(validateForm1AA({...v,agreementType:'fixed'},2).includes('Fixed-term end'));
 assert.ok(validateForm1AA({...v,maximumOccupants:1},2).some(x=>x.includes('Maximum occupants')));
 assert.ok(validateForm1AA({...v,rentAmount:0},2).includes('Positive rent'));
 assert.ok(validateForm1AA(v,0).some(x=>x.includes('verified tenant')));
 assert.ok(validateForm1AA({...v,lessorName:''},2).includes('Legal lessor name'));
});
