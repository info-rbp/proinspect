import test from 'node:test';
import assert from 'node:assert/strict';
import {enquirySchema,canTransitionEnquiry,signEnquiry,verifyEnquiry} from '../packages/marketing/enquiry.ts';
test('enquiry transport signatures bind content and expire',async()=>{
 const secret='a'.repeat(64),time=String(Date.now()),body='{"safe":"test"}',signature=await signEnquiry(secret,time,body);
 assert.equal(await verifyEnquiry(secret,time,signature,body),true);
 assert.equal(await verifyEnquiry(secret,time,signature,body+' '),false);
 assert.equal(await verifyEnquiry(secret,time,signature,body,Date.now()+121000),false);
 assert.equal(await verifyEnquiry('wrong',time,signature,body),false);
});
test('enquiry status transitions require explicit reopen and consent',()=>{
 assert.equal(canTransitionEnquiry('closed','qualified'),false);
 assert.equal(canTransitionEnquiry('spam','reviewing'),true);
 assert.equal(canTransitionEnquiry('new','reviewing'),true);
 assert.equal(enquirySchema.safeParse({}).success,false);
});
