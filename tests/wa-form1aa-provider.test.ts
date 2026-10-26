import test from 'node:test';
import assert from 'node:assert/strict';
import {FORM_1AA_FIELDS} from '../packages/wa-residential/form1aa.ts';
import {OFFICIAL_FORM_1AA_2026_URL,validateOfficialMap} from '../packages/wa-residential/form1aa-official-map.ts';
import {buildForm1AADraft,createSandboxDraft} from '../packages/wa-residential/docusign-sandbox.ts';
const baseMap=()=>({
 formCode:'WA_FORM_1AA' as const,sourceUrl:OFFICIAL_FORM_1AA_2026_URL,sourceEdition:'2026-04',
 sourceDocxSha256:'a'.repeat(64),convertedPdfSha256:'b'.repeat(64),pageCount:15,
 reviewedBy:'independent-legal-review',reviewedAt:'2026-10-26T08:00:00Z',
 placements:FORM_1AA_FIELDS.filter(f=>f.required).map((f,i)=>({key:f.key,page:1+(i%12),x:20,y:120,width:100,height:20,sourcePageLabel:'page '+(i%12+1)})),
 tenantSignaturePlacements:[{signerOrdinal:1,page:12,x:100,y:200},{signerOrdinal:2,page:12,x:110,y:290}],
 lessorSignaturePlacement:{page:13,x:100,y:200}
});
const people=[{userId:'tenant-one',name:'Tenant One',email:'tenant1@example.test',role:'tenant' as const},
 {userId:'tenant-two',name:'Tenant Two',email:'tenant2@example.test',role:'tenant' as const},
 {userId:'lessor',name:'Lessor Name',email:'lessor@example.test',role:'lessor' as const}];
const bytes='A'.repeat(180);
test('2026 official mapping does not silently approve missing or legacy PDF placements',()=>{
 const m=baseMap();
 assert.equal(validateOfficialMap(m,2).length,0);
 assert.ok(validateOfficialMap({...m,sourceUrl:'https://legacy.example/old.pdf'},2).length>0);
 assert.ok(validateOfficialMap({...m,sourceDocxSha256:''},2).length>0);
 assert.ok(validateOfficialMap({...m,placements:m.placements.slice(1)},2).some(x=>x.includes('required field')));
 assert.ok(validateOfficialMap({...m,tenantSignaturePlacements:m.tenantSignaturePlacements.slice(1)},2).length>0);
 assert.ok(validateOfficialMap({...m,lessorSignaturePlacement:null},2).length>0);
 assert.ok(validateOfficialMap({...m,pageCount:0},2).length>0);
});
test('separate lessor and two tenant signing tabs are bound to the reviewed source PDF',()=>{
 const m=baseMap(),draft=buildForm1AADraft({map:m,signers:people,sourcePdfBase64:bytes,sourceSha256:m.convertedPdfSha256,caseId:'wa_case_synthetic'});
 assert.equal(draft.status,'created');assert.equal(draft.recipients.signers.length,3);
 assert.deepEqual(draft.recipients.signers.map(s=>s.tabs.signHereTabs[0].pageNumber),['12','12','13']);
 assert.equal(draft.documents[0].documentBase64,bytes);
 assert.throws(()=>buildForm1AADraft({map:m,signers:people,sourcePdfBase64:bytes,sourceSha256:'c'.repeat(64),caseId:'x'}),/MISMATCH/);
 assert.throws(()=>buildForm1AADraft({map:m,signers:[people[0],people[0],people[2]],sourcePdfBase64:bytes,sourceSha256:m.convertedPdfSha256,caseId:'x'}),/INVALID/);
});
test('sandbox draft never sends, rejects production host and never leaks bearer tokens',async()=>{
 const m=baseMap(),draft=buildForm1AADraft({map:m,signers:people,sourcePdfBase64:bytes,sourceSha256:m.convertedPdfSha256,caseId:'case'});
 let called=false;
 const result=await createSandboxDraft({baseUrl:'https://demo.docusign.net/',accountId:'synthetic-account',accessToken:'synthetic-token',sandbox:true},draft,async (req,init)=>{
  called=true;assert.match(String(req),/demo\.docusign\.net\/restapi\/v2\.1\/accounts/);
  const sent=JSON.parse(String(init?.body));
  assert.equal(sent.status,'created');
  assert.equal(init?.headers?.Authorization,'Bearer synthetic-token');
  return Response.json({envelopeId:'demo-envelope',status:'created'}, {status:201});
 });
 assert.equal(called,true);assert.equal(result.status,'created');
 await assert.rejects(()=>createSandboxDraft({baseUrl:'https://api.docusign.net/',accountId:'synthetic-account',accessToken:'token',sandbox:true},draft,async()=>Response.json({})),/DEMO_HOST/);
 await assert.rejects(()=>createSandboxDraft({baseUrl:'https://demo.docusign.net/',accountId:'synthetic-account',accessToken:'token',sandbox:false},draft),/ONLY_SANDBOX/);
});
