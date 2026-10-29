import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore Browser-accessible .mjs model deliberately has no generated TypeScript declaration.
import {calculateResidentialSavings, savingsDefaults} from '../apps/residential-campaign/assets/savings-model.mjs';

test('reference 24-month Perth agency model and ProInspect $55 weekly are exact', () => {
 const result = calculateResidentialSavings();
 assert.equal(result.months,24);
 assert.equal(result.weeks,104);
 assert.equal(result.routineInspections,6);
 assert.equal(result.renewals,1);
 assert.equal(result.annualStatements,2);
 assert.equal(result.rentalIncomeTotalCents,7_800_000);
 assert.equal(result.agencyTotalCents,1_135_200);
 assert.equal(result.subscriptionTotalCents,572_000);
 assert.equal(result.differenceCents,563_200);
 assert.ok(Math.abs(result.differencePercent-49.6124)<.01);
 assert.ok(Math.abs(result.agencyEffectiveRentPercent-14.5538)<.01);
 assert.deepEqual(result.breakdown.map(x=>x.perPropertyCents),
  [772200,165000,44000,22000,66000,27500,22000,16500,0]);
});

test('12, 24 and 36 month agency estimates reproduce source scenarios', () => {
 assert.equal(calculateResidentialSavings({months:12}).agencyTotalCents,680_350);
 assert.equal(calculateResidentialSavings({months:24}).agencyTotalCents,1_135_200);
 assert.equal(calculateResidentialSavings({months:36}).agencyTotalCents,1_590_050);
 const fourYear=calculateResidentialSavings({months:48});
 assert.equal(fourYear.agencyTotalCents,2_044_900);
 assert.equal(fourYear.subscriptionTotalCents,1_144_000);
});

test('fee schedule and commission sensitivity correctly update totals', () => {
 assert.equal(calculateResidentialSavings({commissionPct:8.5}).agencyTotalCents,1_092_300);
 assert.equal(calculateResidentialSavings({commissionPct:10}).agencyTotalCents,1_221_000);
 const renewalIncluded=calculateResidentialSavings({include:{renewal:false}});
 assert.equal(renewalIncluded.agencyTotalCents,1_107_700);
 assert.equal(renewalIncluded.breakdown.find(x=>x.key==='renewal')?.totalCents,0);
 const freeInspections=calculateResidentialSavings({include:{routine:false}});
 assert.equal(freeInspections.agencyTotalCents,1_069_200);
 const optionalAdmin=calculateResidentialSavings({adminMonthlyEx:10});
 assert.equal(optionalAdmin.agencyTotalCents,1_161_600);
});

test('uncovered self-management and keeping an agency never create fictitious savings', () => {
 const extra=calculateResidentialSavings({additionalSelfManagedInc:2500});
 assert.equal(extra.alternativeTotalCents,822_000);
 assert.equal(extra.differenceCents,313_200);
 const retained=calculateResidentialSavings({arrangement:'retain'});
 assert.equal(retained.alternativeTotalCents,1_707_200);
 assert.equal(retained.differenceCents,-572_000);
 const retainedPlusExtra=calculateResidentialSavings({arrangement:'retain',additionalSelfManagedInc:200});
 assert.equal(retainedPlusExtra.differenceCents,-592_000);
});

test('portfolio comparison scales each property independently', () => {
 const result=calculateResidentialSavings({properties:5});
 assert.equal(result.agencyTotalCents,5_676_000);
 assert.equal(result.subscriptionTotalCents,2_860_000);
 assert.equal(result.differenceCents,2_816_000);
 assert.equal(result.rentalIncomeTotalCents,39_000_000);
});

test('model prevents invalid tenancy, fee and WA inspection assumptions', () => {
 assert.throws(()=>calculateResidentialSavings({months:0}),RangeError);
 assert.throws(()=>calculateResidentialSavings({properties:1.3}),RangeError);
 assert.throws(()=>calculateResidentialSavings({commissionPct:-1}),RangeError);
 assert.throws(()=>calculateResidentialSavings({routineVisitsPerYear:5}),RangeError);
 assert.throws(()=>calculateResidentialSavings({weeklyRent:Infinity}),RangeError);
 assert.throws(()=>calculateResidentialSavings({arrangement:'agency-is-free'}),RangeError);
});
