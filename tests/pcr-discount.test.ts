import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';
import {pcrRoutineDiscount} from '../packages/finance/pcr-discount.ts';
import {pcrAppointmentPrice} from '../packages/marketing/pcr-campaign.ts';
test('20 percent is applied once to approved cents and tax remains coherent',()=>{
 for(const [ex,tax] of [[10000,1000],[9091,909],[1,2],[12345,0],[100000000,10000000]]){const d=pcrRoutineDiscount(ex,tax);assert.equal(d.discountCents,Math.round((ex+tax)*0.2));assert.equal(d.totalCents+d.discountCents,ex+tax);assert.equal(d.priceExGstCents+d.gstCents,d.totalCents);}
});
test('negative, fractional, unbounded or unusable amounts cannot enter the ledger',()=>{for(const pair of [[0,0],[-1,0],[1.1,0],[Infinity,0],[100000001,0],[1,-1],[1,0]])assert.throws(()=>pcrRoutineDiscount(pair[0],pair[1]));});
test('appointments require absolute time and integral bounded duration',()=>{for(const [time,duration] of [['2026-10-27T09:00:00',60],['2026-10-27T09:00:00+08:00',60.5],['2026-10-27T09:00:00+08:00',481]] as const)assert.throws(()=>pcrAppointmentPrice(time,duration));});
test('offer, redemption and sample publication are independently default-off',()=>{
 for(const path of ['apps/platform/wrangler.jsonc','apps/marketing/wrangler.jsonc']){const cfg=JSON.parse(readFileSync(path,'utf8'));for(const e of [cfg,...Object.values(cfg.env??{})] as any[])for(const name of ['PCR_LAUNCH_ENABLED','PCR_DISCOUNT_REDEMPTION_ENABLED','PCR_SAMPLE_PUBLICATION_ENABLED'])if(e.vars){const value=e.vars[name];assert.ok(value==='false'||(e.vars.APP_ENV==='production'&&name==='PCR_DISCOUNT_REDEMPTION_ENABLED'&&value===undefined),'PCR campaign must remain explicitly or implicitly disabled');}}
});
test('removed PCR promotional and sample routes cannot publish any public bytes',()=>{for(const name of ['apps/marketing/app/routes/pcr-offer.tsx','apps/marketing/app/routes/pcr-sample.ts','packages/ui/pcr-offer.css'])assert.equal(existsSync(name),false);for(const name of ['apps/platform/app/routes.ts','apps/marketing/app/routes.ts']){const routes=readFileSync(name,'utf8');assert.doesNotMatch(routes,/offers\/pcr-100|offers\/pcr\/sample/);}});
