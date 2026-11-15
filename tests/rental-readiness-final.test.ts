import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSection,inviteApplicantSchema } from '../packages/marketing/form18.ts';
import { parseRepeater,repeaterSummary } from '../packages/marketing/rental-repeaters.ts';
import { listingApplicationAction } from '../packages/marketing/leasing.ts';
const identity={fullName:'Synthetic Adult',dateOfBirth:'1990-02-03',mobile:'0400000000',email:'adult@example.invalid',currentAddress:'Synthetic address, Perth',idType:'Not yet available',totalOccupants:'3',adultOccupants:'2',minorOccupants:'1',petsProposed:'No'};
test('household counts do not invite minors and adult confirmation is explicit',()=>{
 assert.equal(cleanSection('identity',identity).minorOccupants,'1');
 assert.throws(()=>cleanSection('identity',{...identity,minorOccupants:'2'}),/HOUSEHOLD_COUNTS_INVALID/);
 assert.equal(inviteApplicantSchema.safeParse({name:'Synthetic Adult',email:'other@example.invalid'}).success,false);
 assert.equal(inviteApplicantSchema.safeParse({name:'Synthetic Adult',email:'other@example.invalid',adultConfirmed:true}).success,true);
});
test('repeatable histories validate dates, amounts, contacts or explained alternatives',()=>{
 const row={address:'12 Synthetic Street',rentAmount:'350',rentPeriod:'Week',from:'2024-01-01',to:'2025-01-01',lessor:'Synthetic Agency',contact:'agency@example.invalid',reasonLeaving:'Relocating',alternativeEvidence:''};
 assert.equal(parseRepeater('additionalHistory',JSON.stringify([row,row])).length,2);
 assert.throws(()=>parseRepeater('additionalHistory',JSON.stringify([{...row,to:'2023-01-01'}])),/REPEATER_INVALID/);
 assert.throws(()=>parseRepeater('additionalHistory',JSON.stringify([{...row,rentAmount:'-5'}])),/REPEATER_INVALID/);
 assert.equal(parseRepeater('additionalHistory',JSON.stringify([{...row,rentAmount:'',from:'',alternativeEvidence:'Details unavailable; alternative evidence can be provided.'}])).length,1);
 assert.equal(repeaterSummary('additionalHistory',JSON.stringify([row])).length,1);
});
test('first-time renters and non-employed applicants can provide appropriate alternatives',()=>{
 assert.throws(()=>cleanSection('rental',{hasRentalHistory:'No'}),/NO_HISTORY_REASON_REQUIRED/);
 assert.equal(cleanSection('rental',{hasRentalHistory:'No',noHistoryReason:'First tenancy, family accommodation.'}).additionalHistory,'[]');
 for(const employmentType of ['Student','Retired','Unemployed','Other','Self-employed']){
  const answer=employmentType==='Self-employed'?{occupation:'Consultant',employer:'Synthetic business'}:{};
  assert.equal(cleanSection('employment',{employmentType,...answer}).employmentType,employmentType);
 }
 assert.throws(()=>cleanSection('employment',{employmentType:'Retired',netIncome:'500'}),/INCOME_PERIOD_REQUIRED/);
});
test('extra personal references need contact details and safe approved external URLs take precedence',()=>{
 assert.equal(parseRepeater('additionalReferences',JSON.stringify([{name:'Synthetic Referee',relationship:'Colleague',phone:'',email:'reference@example.invalid'}])).length,1);
 assert.throws(()=>parseRepeater('additionalReferences',JSON.stringify([{name:'Synthetic Referee',relationship:'Colleague',phone:'',email:''}])),/REPEATER_INVALID/);
 assert.deepEqual(listingApplicationAction({kind:'residential',slug:'synthetic',applicationMode:'proinspect',applicationUrl:'https://approved.example.invalid/apply',rentalReady:true}),{type:'external',href:'https://approved.example.invalid/apply'});
});
