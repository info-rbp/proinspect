import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';
import {assessStage6Launch,EXPECTED_SCHEMA,STAGE6_GATES,type Stage6Inputs} from '../packages/operations/stage6-launch.ts';
import {WORKSPACES} from '../packages/domain/index.ts';

function fixture():Stage6Inputs{
 return {
  environment:'production',source:'a'.repeat(40),
  bindings:{database:true,documents:true,restrictedDocuments:true,queue:true,scheduler:true},
  migration:{available:true,count:53,latest:'0053_account_first_free_registration.sql'},
  catalogue:{available:true,count:23},
  features:[{name:'residential_live',configured:false,approved:false}],
  providers:[{provider:'Stripe live residential',state:'acceptance_required'}],
  operations:[{code:'mail_failed',state:'clear',count:0}],
 };
}
test('Stage 6 baseline matches exactly 53 numbered migrations, 23 services and all nine distinct workspace identities',()=>{
 const all=readdirSync('database/migrations').filter(x=>/^\d{4}_.+\.sql$/.test(x)).sort();
 assert.equal(all.length,EXPECTED_SCHEMA.count);
 assert.equal(all.at(-1),EXPECTED_SCHEMA.latest);
 assert.equal(EXPECTED_SCHEMA.catalogueServices,23);
 assert.equal(Object.keys(WORKSPACES).length,9);
 assert.ok(Object.hasOwn(WORKSPACES,'building-manager'));
 // The nine-role hosted acceptance script is independently checked by portal-execution.test.mjs.
});
test('passing source, bindings and migration count never implies market launch accepted',()=>{
 const outcome=assessStage6Launch(fixture());
 assert.equal(outcome.decision,'NO_GO');
 assert.equal(outcome.gates.length,STAGE6_GATES.length);
 assert.deepEqual(outcome.gates.map(x=>x.gate),[...STAGE6_GATES]);
 assert.equal(outcome.gates.find(x=>x.gate==='deployment')?.status,'technical_preflight');
 assert.equal(outcome.gates.find(x=>x.gate==='database')?.status,'technical_preflight');
 assert.equal(outcome.gates.find(x=>x.gate==='nine_portals')?.status,'requires_external_evidence');
 assert.equal(outcome.gates.find(x=>x.gate==='commercial_approval')?.status,'requires_external_evidence');
 assert.equal(outcome.gates.find(x=>x.gate==='final_activation')?.status,'requires_external_evidence');
});
test('wrong migration target, missing binding, incomplete catalogue and configured unapproved features block preflight',()=>{
 const f=fixture();
 f.migration={available:true,count:52,latest:'0052_rental_tenancy_handover.sql'};
 f.catalogue.count=22;
 f.bindings.restrictedDocuments=false;
 f.features=[{name:'residential_live',configured:true,approved:false}];
 const out=assessStage6Launch(f);
 assert.deepEqual(out.blocked,['deployment','database','customer_journeys','final_activation']);
 assert.equal(out.decision,'NO_GO');
 assert.ok(out.gates.find(g=>g.gate==='final_activation')?.detail.includes('residential_live'));
});
test('operational alert and missing schema are not mistaken for a safe deployment',()=>{
 const f=fixture();
 f.migration={available:false,count:null,latest:null};
 f.operations=[{code:'mail_failed',state:'attention',count:5}];
 const out=assessStage6Launch(f);
 assert.ok(out.blocked.includes('database'));
 assert.ok(out.blocked.includes('operational_readiness'));
});
test('acceptance cannot be inferred from no active features, clean signals or apparently accepted provider configuration',()=>{
 const f=fixture();
 f.features=[];f.providers=[{provider:'Stripe live residential',state:'acceptance_verified'}];
 const out=assessStage6Launch(f);
 assert.equal(out.decision,'NO_GO');
 assert.equal(out.externalEvidenceRequired.includes('source_freeze'),true);
 assert.equal(out.externalEvidenceRequired.includes('nine_portals'),true);
});
