import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingIntakeSchema, validateRequestedAddOns, bookingFingerprintFields }
 from '../packages/booking/inspection-checkout.ts';
import { residentialServiceRequestIntakeSchema, assertOpenHomeLead }
 from '../packages/booking/residential-service-requests.ts';

const details = {
 contactPhone:'0400 111 222', reason:'Incoming condition report',
 occupancyStatus:'tenanted' as const,furnishingStatus:'furnished' as const,
};
test('PCR inventory add-on is available only for furnished premises and parent PCR',()=>{
 const input=bookingIntakeSchema.parse({...details,addOns:['inventory_with_pcr']});
 assert.deepEqual(validateRequestedAddOns('property-condition-report',input),
   [{code:'inventory_with_pcr',candidateExGstCents:15000}]);
 assert.throws(()=>validateRequestedAddOns('routine-inspection',input));
 assert.throws(()=>validateRequestedAddOns('property-condition-report',{
   ...input,furnishingStatus:'unfurnished'}));
});
test('Routine and follow-up Form 19 requests require a tenanted property',()=>{
 const intake=bookingIntakeSchema.parse({...details,addOns:['form19_service']});
 for(const service of ['routine-inspection','follow-up-routine-inspection'])
   assert.deepEqual(validateRequestedAddOns(service,intake),
     [{code:'form19_service',candidateExGstCents:4000}]);
 assert.throws(()=>validateRequestedAddOns('routine-inspection',
   {...intake,occupancyStatus:'vacant'}));
});
test('Exit tenant attendance has no surcharge unless coordination was chosen',()=>{
 const noExtra=bookingIntakeSchema.parse({...details,tenantWillAttend:'yes'});
 assert.deepEqual(validateRequestedAddOns('final-exit-inspection',noExtra),[]);
 const requested=bookingIntakeSchema.parse({
   ...details,tenantWillAttend:'yes',tenantAttendeeName:'Test Tenant',
   addOns:['tenant_attendance_coordination'],
 });
 assert.equal(validateRequestedAddOns('final-exit-inspection',requested)[0].candidateExGstCents,4000);
 assert.throws(()=>validateRequestedAddOns('final-exit-inspection',
   {...requested,tenantWillAttend:'no'}));
});
test('intake fingerprint binds selected add-on and tenant contact to idempotency',()=>{
 const input=bookingIntakeSchema.parse({...details,addOns:['inventory_with_pcr']});
 const obj={propertyId:'p',serviceId:'property-condition-report',
   startsAt:'2026-12-14T01:00:00.000Z',access:{method:'owner'},intake:input};
 const first=JSON.stringify(bookingFingerprintFields(obj));
 const second=JSON.stringify(bookingFingerprintFields({...obj,intake:{
   ...input,addOns:[]}}));
 assert.notEqual(first,second);
});
test('72-hour grouped Open Home scheduling is checked from earliest AWST window',()=>{
 const opening=new Date('2026-11-22T08:00:00Z').getTime();
 const selected=residentialServiceRequestIntakeSchema.parse({
   serviceCode:'open-home',preferredDate:'2026-11-26',
   timeFrame:'morning',marketingRequested:true,tenantApplicationRequested:true,
 });
 assert.doesNotThrow(()=>assertOpenHomeLead(selected,opening));
 assert.throws(()=>assertOpenHomeLead({...selected,preferredDate:'2026-11-24'},opening));
 assert.equal(selected.tenantApplicationRequested,true);
 assert.equal(selected.marketingRequested,true);
});
test('private viewing needs an appointment and attendee, video needs valid recipients',()=>{
 assert.equal(residentialServiceRequestIntakeSchema.safeParse({
   serviceCode:'private-open-home',preferredDate:'2026-11-26',preferredTime:'15:00',
 }).success,false);
 assert.equal(residentialServiceRequestIntakeSchema.safeParse({
   serviceCode:'private-open-home',preferredDate:'2026-11-26',preferredTime:'15:00',
   attendeeEmail:'person@example.test',
 }).success,true);
 assert.equal(residentialServiceRequestIntakeSchema.safeParse({
   serviceCode:'video-walkthrough-property',recipients:[],
 }).success,false);
 assert.equal(residentialServiceRequestIntakeSchema.safeParse({
   serviceCode:'video-walkthrough-property',
   recipients:[{name:'Authorised Recipient',email:'recipient@example.test'}],
 }).success,true);
});
test('leasing add-ons cannot be hidden in an unrelated maintenance request',()=>{
 const result=residentialServiceRequestIntakeSchema.safeParse({
   serviceCode:'maintenance',marketingRequested:true,
 });
 assert.equal(result.success,false);
});
