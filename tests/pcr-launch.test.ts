import test from 'node:test';
import assert from 'node:assert/strict';
import { pcrAppointmentPrice, pcrCustomerPrice, PCR_ROUTINE_DISCOUNT_BPS, PCR_ROUTINE_DISCOUNT_USES } from '../packages/marketing/pcr-campaign.ts';
test('PCR weekend rates include the appropriate loading and optional collection',()=>{
 assert.equal(pcrCustomerPrice('weekday'),10000);
 assert.equal(pcrCustomerPrice('saturday'),12500);
 assert.equal(pcrCustomerPrice('sunday'),15000);
 assert.equal(pcrCustomerPrice('sunday',true),16000);
 assert.equal(PCR_ROUTINE_DISCOUNT_BPS,2000);
 assert.equal(PCR_ROUTINE_DISCOUNT_USES,4);
});
test('Perth appointment date, not the browser-selected day, sets the charge',()=>{
 const tue=pcrAppointmentPrice('2026-10-27T09:00:00+08:00',60);
 const sat=pcrAppointmentPrice('2026-10-31T09:00:00+08:00',60);
 const sun=pcrAppointmentPrice('2026-11-01T16:00:00+08:00',60,true);
 assert.equal(tue.totalCents,10000);assert.equal(tue.priceExGstCents+tue.gstCents,10000);
 assert.equal(sat.totalCents,12500);
 assert.equal(sun.totalCents,16000);
});
test('PCR offer rejects slots outside 9 am to 5 pm Perth time',()=>{
 assert.throws(()=>pcrAppointmentPrice('2026-10-27T08:45:00+08:00',60),RangeError);
 assert.throws(()=>pcrAppointmentPrice('2026-11-01T16:30:00+08:00',60),RangeError);
});
