import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PRIMARY_INSPECTIONS,INSPECTION_SOURCE_PRICES,orderBookingServices,
  cashInvoiceDueAt,cashInvoicePeriod,cashPeriodIsClosed,cashInvoiceDueForServicePeriod,bookingIntakeSchema,
  bookingFingerprintFields,inspectionIntakeKind} from '../packages/booking/inspection-checkout.ts';
test('three canonical core inspections are first in required order',()=>{
 const input=[{id:'z-service',name:'ZZZ'},{id:'routine-inspection',name:'Routine'},
 {id:'final-exit-inspection',name:'Final'},{id:'property-condition-report',name:'PCR'}];
 assert.deepEqual(orderBookingServices(input).slice(0,3).map(v=>v.id),[...PRIMARY_INSPECTIONS]);
 assert.equal(input[0].id,'z-service');
});
test('source rates retain provenance without tax or currency ambiguity',()=>{
 assert.equal(INSPECTION_SOURCE_PRICES['property-condition-report'].centsExGst,20000);
 assert.equal(INSPECTION_SOURCE_PRICES['final-exit-inspection'].centsExGst,10000);
 assert.equal(INSPECTION_SOURCE_PRICES['routine-inspection'].centsExGst,6000);
});
test('terms respect Perth end-of-month calendar boundaries',()=>{
 assert.equal(cashInvoiceDueAt('2026-11-21T04:00:00.000Z','net_7'),'2026-11-28T04:00:00.000Z');
 assert.equal(cashInvoiceDueAt('2026-11-21T04:00:00.000Z','eom_7'),'2026-12-07T15:59:59.000Z');
 assert.equal(cashInvoiceDueAt('2026-11-21T04:00:00.000Z','upon_booking'),null);
 assert.equal(cashInvoicePeriod('2026-11-30T17:00:00Z','eom_7'),'2026-12');
 assert.equal(cashPeriodIsClosed('2026-11','2026-11-30T15:59:59Z'),false);
 assert.equal(cashPeriodIsClosed('2026-11','2026-11-30T16:00:00Z'),true);
});
test('inspection intake validates usable operational details',()=>{
 const valid={contactPhone:'0400 111 222',reason:'Entry inspection',occupancyStatus:'vacant'};
 assert.equal(bookingIntakeSchema.parse(valid).occupancyStatus,'vacant');
 assert.equal(bookingIntakeSchema.safeParse({...valid,contactPhone:''}).success,false);
});
test('end-of-month credit due dates follow the service period, not delayed issue month',()=>{
 assert.equal(cashInvoiceDueForServicePeriod('eom_7','2026-11','2026-12-01T02:00:00Z'),
  '2026-12-07T15:59:59.000Z');
 assert.throws(()=>cashInvoiceDueForServicePeriod('eom_7','2026-11','2026-12-08T00:00:00Z'));
 assert.equal(cashInvoiceDueForServicePeriod('net_7','booking:bkg_1','2026-11-21T04:00:00Z'),
  '2026-11-28T04:00:00.000Z');
});

test('legacy booking fingerprint is byte-compatible while inspection details are immutable',()=>{
 const legacy={propertyId:'prop_a',serviceId:'property-condition-report',
  startsAt:'2026-12-10T10:00:00+08:00',
  access:{method:'owner',instructions:'Meet at gate',noticeConfirmed:false}};
 const expected={propertyId:'prop_a',serviceId:'property-condition-report',
  startsAt:'2026-12-10T02:00:00.000Z',access:legacy.access,
  recurringPlanId:null,planDue:null};
 assert.deepEqual(bookingFingerprintFields(legacy),expected);
 const intake={contactPhone:'0400 111 222',reason:'New tenancy',occupancyStatus:'vacant'};
 assert.deepEqual(bookingFingerprintFields({...legacy,intake}),{...expected,intake});
 assert.notEqual(
  JSON.stringify(bookingFingerprintFields({...legacy,intake})),
  JSON.stringify(bookingFingerprintFields({...legacy,intake:{...intake,reason:'Exit instead'}})),
 );
});
test('the three inspection kinds are isolated from legacy service booking',()=>{
 assert.equal(inspectionIntakeKind('property-condition-report'),'pcr');
 assert.equal(inspectionIntakeKind('final-exit-inspection'),'exit');
 assert.equal(inspectionIntakeKind('routine-inspection'),'routine');
 assert.equal(inspectionIntakeKind('maintenance-visit'),'general');
});
