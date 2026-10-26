import {test} from 'node:test';
import assert from 'node:assert/strict';
import {v4Catalogue,v4Service} from '../packages/v4/catalogue.ts';
import {allowedForGuest,fieldsForService,v4Price,requestableStatus,validateAnswers} from '../packages/v4/workflows.ts';
test('174 workbook services and 40 workflow definitions loaded losslessly',async()=>{
 const x=await v4Catalogue();assert.equal(x.services.length,174);assert.equal(x.workflows.length,40);
 assert.equal(x.services.filter(s=>s.sector==='residential').length,54);
 assert.equal(x.services.filter(s=>s.sector==='commercial').length,120);
 assert.equal(new Set(x.services.map(s=>s.id)).size,174);
 assert.equal(x.services.every(s=>s.name&&s.feeText&&s.intakeGuide&&s.staffGuide&&s.deliverable&&s.source),true);
 assert.equal(new Set(x.workflows.map(x=>x.code)).size,40);
 assert.ok(x.services.every(s=>x.workflows.some(w=>w.code===s.workflowCode)));
});
test('PAYG rates reflect uploaded fee schedules, not made-up live Stripe prices',async()=>{
 const get=async(name:string)=>(await v4Catalogue()).services.find(s=>s.name===name)!;
 assert.equal(v4Price(await get('Property Condition Report')).totalExGstCents,20000);
 assert.equal(v4Price(await get('Routine Inspection')).totalExGstCents,6000);
 assert.equal(v4Price(await get('Residential Tenancy Lease Agreement (Form 1AA)')).totalExGstCents,25000);
 assert.equal(v4Price(await get('Commercial Property Condition Report')).totalExGstCents,35000);
 assert.equal(v4Price(await get('Commercial Lease Data Abstraction')).totalExGstCents,25000);
 assert.equal(v4Price(await get('Outgoings Reconciliation Administration')).totalExGstCents,45000);
 const invoice=await get('Invoice Administration');assert.equal(v4Price(invoice,2).totalExGstCents,7500);
 assert.equal(v4Price(invoice,4).totalExGstCents,10000);
 const storage=await get('Off-Site Key Storage');assert.equal(v4Price(storage,3).totalExGstCents,1500);
 assert.equal(v4Price(storage,3).kind,'monthly');
 assert.equal(v4Price(await get('Commercial Portfolio Transfer Administration')).totalExGstCents,null);
});
test('official restricted pathways are not generic public checkout products',async()=>{
 const list=(await v4Catalogue()).services;
 const confidential=list.find(s=>s.workflowCode==='CONFIDENTIAL');assert.ok(confidential);
 assert.equal(allowedForGuest(confidential),false);
 assert.equal(requestableStatus(confidential),'restricted');
 const court=list.find(s=>s.workflowCode==='COURT');assert.ok(court);
 assert.equal(allowedForGuest(court),false);
 assert.equal(list.filter(allowedForGuest).length,list.length-2);
});
test('service-specific answer rules are bounded and validated',async()=>{
 const s=(await v4Service('RES-036'))!;
 const fields=fieldsForService(s);assert.ok(fields.some(f=>f.key==='parties'));
 assert.ok(fields.some(f=>f.key==='termsInstructions'));
 const answers:Record<string,string>={requestPurpose:'Prepare a tenancy agreement',authorityBasis:'Property owner',parties:'Lessor and new tenant',termsInstructions:'Standard approved terms'};
 assert.deepEqual(validateAnswers(s,answers),answers);
 assert.throws(()=>validateAnswers(s,{...answers,arbitrarySensitive:'secret'}));
 assert.throws(()=>validateAnswers(s,{requestPurpose:'Missing parties',authorityBasis:'Property owner'}));
 assert.throws(()=>v4Price(s,0));
});
