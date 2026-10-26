import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SERVICE_SEEDS } from '../packages/service-catalogue/index.ts';
import { SERVICE_SCOPE_DETAILS } from '../packages/marketing/service-scopes.ts';
import { PUBLICATION_REGISTER, assertPublicationRegisterIntegrity, isPublicationApproved } from '../packages/marketing/publication-register.ts';
import { PUBLIC_LEGAL_APPROVAL } from '../packages/marketing/legal-drafts.ts';
test('every service has usable, distinct indicative scope guidance', () => {
  assert.equal(SERVICE_SEEDS.length,23);
  assert.deepEqual(Object.keys(SERVICE_SCOPE_DETAILS).sort(), SERVICE_SEEDS.map(x=>x.id).sort());
  for(const service of SERVICE_SEEDS) {
    const s=SERVICE_SCOPE_DETAILS[service.id];
    for(const list of [s.included,s.excluded,s.deliverables]){
      assert.ok(list.length>=2,service.id);
      assert.ok(list.every(text=>text.trim().length>=20),service.id);
    }
  }
});
test('publication approvals are evidence-based and fail closed',()=>{
  assert.doesNotThrow(assertPublicationRegisterIntegrity);
  assert.equal(PUBLICATION_REGISTER.filter(r=>r.category==='service').length,23);
  assert.ok(PUBLICATION_REGISTER.every(r=>!isPublicationApproved(r)));
  assert.equal(PUBLIC_LEGAL_APPROVAL.privacy.approved,false);
  assert.equal(PUBLIC_LEGAL_APPROVAL.terms.approved,false);
  const sample=PUBLICATION_REGISTER[0];
  assert.equal(isPublicationApproved({...sample,status:'approved'}),false);
  assert.equal(isPublicationApproved({...sample,status:'approved',reviewer:'Approved reviewer',approvedAt:'2026-10-25',evidenceReference:'release/approval-123'}),true);
});
