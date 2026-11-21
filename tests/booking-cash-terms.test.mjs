import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PRIMARY_INSPECTIONS,INSPECTION_SOURCE_PRICES,orderBookingServices,
  cashInvoiceDueAt,cashInvoicePeriod,cashPeriodIsClosed,bookingIntakeSchema} from '../packages/booking/inspection-checkout.ts';
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
