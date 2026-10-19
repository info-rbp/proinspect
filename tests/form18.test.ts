import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIELDS, FORM18_STEPS, ANSWER_STEPS, FORM18_VERSION, applicationSettingsSchema,
 cleanSection, stepComplete, allDetailsComplete,initialAnswers } from '../packages/marketing/form18.ts';
const example={identity:{fullName:'Example Applicant',mobile:'0412345678',dateOfBirth:'1994-05-12',
 currentAddress:'12 Sample Street Perth 6000',idType:'Passport'},
 rental:{hasRentalHistory:'No'},employment:{employmentType:'Student'},references:{}};
test('digital Form 18 follows the uploaded form sections for each applicant',()=>{
 assert.deepEqual(FORM18_STEPS.map(x=>x.id),['identity','rental','employment','references','documents','review']);
 assert.ok(FORM18_VERSION.startsWith('form18-digital-'));
 assert.ok(FIELDS.identity.some(f=>f.key==='dateOfBirth'));
 assert.ok(FIELDS.rental.some(f=>f.key==='reasonLeaving'));
 assert.ok(FIELDS.employment.some(f=>f.key==='netIncome'));
 assert.ok(FIELDS.references.some(f=>f.key==='emergencyAddress'));
 for(const step of ANSWER_STEPS)assert.ok(Array.isArray(FIELDS[step]));
});
test('conditional rental/employment supports people without a rental history or employer',()=>{
 assert.equal(allDetailsComplete(example),true);
 assert.equal(stepComplete(example,'identity'),true);
 assert.equal(stepComplete({...example,rental:{hasRentalHistory:'Yes'}},'rental'),false);
 assert.equal(stepComplete({...example,employment:{employmentType:'Employed'}},'employment'),false);
 const rental={hasRentalHistory:'Yes',previousAddress:'21 Previous Road, Perth',rentPaidTo:'Example Agency'};
 assert.equal(stepComplete({...example,rental},'rental'),true);
 const employ={employmentType:'Employed',occupation:'Analyst',employer:'Employer Co'};
 assert.equal(stepComplete({...example,employment:employ},'employment'),true);
});
test('personal fields are bounded and date of birth cannot be in future',()=>{
 assert.throws(()=>cleanSection('identity',{...example.identity,dateOfBirth:'2099-01-01'}));
 assert.throws(()=>cleanSection('identity',{...example.identity,mobile:''}));
 assert.throws(()=>cleanSection('identity',{...example.identity,idType:'Unrecognised'}));
 assert.equal(initialAnswers('Example Applicant','example@example.test').identity.email,'example@example.test');
});
test('external applications require HTTPS, internal applications require client authority and notices',()=>{
 const external={applicationMode:'external',applicationUrl:'https://agency.example/property-1'};
 assert.equal(applicationSettingsSchema.safeParse(external).success,true);
 assert.equal(applicationSettingsSchema.safeParse({...external,applicationUrl:'http://agency.example'}).success,false);
 const internal={applicationMode:'proinspect',applicationAuthorityReference:'SIGNED-123',applicationRecipientEmail:'agent@example.test',
  tenancyDatabaseNoticeMode:'not_used',tenancyDatabaseNotices:[]};
 assert.equal(applicationSettingsSchema.safeParse(internal).success,true);
 assert.equal(applicationSettingsSchema.safeParse({...internal,applicationAuthorityReference:''}).success,false);
 assert.equal(applicationSettingsSchema.safeParse({...internal,tenancyDatabaseNoticeMode:'unconfigured'}).success,false);
 assert.equal(applicationSettingsSchema.safeParse({...internal,tenancyDatabaseNoticeMode:'configured'}).success,false);
 assert.equal(applicationSettingsSchema.safeParse({...internal,tenancyDatabaseNoticeMode:'configured',
  tenancyDatabaseNotices:[{name:'Database',operatorContact:'Operator helpline',accessInstructions:'Contact the operator'}]}).success,true);
});
test('applicant access is separate from public listing, restricted R2 is used, production remains disabled',()=>{
 const read=(p:string)=>readFileSync(p,'utf8');
 const server=read('apps/platform/worker/features/rental-applications.server.ts');
 const migration=read('database/migrations/0008_rental_applications.sql');
 const wrapper=read('apps/platform/wrangler.jsonc');
 assert.match(server,/RESTRICTED_DOCUMENTS\.put/);
 assert.match(server,/rental_applicants/);
 assert.match(server,/access_token_hash/);
 assert.match(server,/state='complete'/);
 assert.match(migration,/quarantined/);
 assert.match(migration,/rental_application_events/);
 assert.match(migration,/IMMUTABLE/);
 assert.equal(JSON.parse(wrapper).env.connected.vars.RENTAL_APPLICATIONS_ENABLED,'false');
});
