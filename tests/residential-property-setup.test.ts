import test from 'node:test';
import assert from 'node:assert/strict';
import { residentialPropertyOnboardingSchema, residentialPropertyUpdateSchema } from '../packages/validation/index.ts';

const initial = {
 address:'18 Bonnard Crescent',suburb:'Ashby',postcode:'6065',
 propertyType:'House',selfManaged:true,
 profile:{bedrooms:4,bathrooms:2,ensuites:1,separateToilets:1,carSpaces:2,
  furnishing:'unfurnished'},
 tenancy:{occupancyStatus:'tenanted',leaseType:'fixed',startsOn:'2026-12-01',
  endsOn:'2027-11-30',tenants:[{name:'Alex Example',email:'alex@example.test',phone:'0400 000 001'},
    {name:'Taylor Example',email:'taylor@example.test'}]},
 notes:'Private backyard and shed',
};
test('four-step owner setup validates room counts, car spaces and multiple tenants',()=>{
 const parsed=residentialPropertyOnboardingSchema.parse(initial);
 assert.equal(parsed.profile.carSpaces,2);
 assert.equal(parsed.tenancy.tenants.length,2);
 assert.equal(parsed.tenancy.leaseType,'fixed');
 assert.equal(parsed.tenancy.endsOn,'2027-11-30');
});
test('rejects en-suite counts above bathrooms and out-of-range car spaces',()=>{
 assert.equal(residentialPropertyOnboardingSchema.safeParse({
  ...initial,profile:{...initial.profile,ensuites:3},
 }).success,false);
 assert.equal(residentialPropertyOnboardingSchema.safeParse({
  ...initial,profile:{...initial.profile,carSpaces:41},
 }).success,false);
});
test('tenancy contacts must not be silently attached to vacant property',()=>{
 const invalid={...initial,tenancy:{...initial.tenancy,occupancyStatus:'vacant'}};
 assert.equal(residentialPropertyOnboardingSchema.safeParse(invalid).success,false);
 const vacant=residentialPropertyOnboardingSchema.parse({
  ...initial,tenancy:{occupancyStatus:'vacant',tenants:[]},
 });
 assert.equal(vacant.tenancy.leaseType,null);
 assert.equal(vacant.tenancy.startsOn,null);
});
test('periodic lease has no fixed end and dates are checked',()=>{
 assert.equal(residentialPropertyOnboardingSchema.safeParse({...initial,
  tenancy:{...initial.tenancy,leaseType:'periodic',endsOn:'2027-11-30'},
 }).success,false);
 assert.equal(residentialPropertyOnboardingSchema.safeParse({...initial,
  tenancy:{...initial.tenancy,endsOn:'2026-11-30'},
 }).success,false);
 assert.equal(residentialPropertyOnboardingSchema.safeParse({...initial,
  tenancy:{...initial.tenancy,startsOn:'2026-02-31'},
 }).success,false);
});
test('existing property edits require optimistic profile version',()=>{
 const update={profile:initial.profile,tenancy:initial.tenancy,notes:initial.notes,
   expectedVersion:2};
 assert.equal(residentialPropertyUpdateSchema.parse(update).expectedVersion,2);
 assert.equal(residentialPropertyUpdateSchema.safeParse({...update,expectedVersion:-1}).success,false);
});
