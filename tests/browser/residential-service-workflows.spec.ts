import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';

async function ownerWithProperty(page: import('@playwright/test').Page) {
 const origin='http://127.0.0.1:5173',email='service-ui-'+randomUUID()+'@proinspect.test';
 const start=await page.request.post('/api/auth/start',{
   headers:{Origin:origin},data:{email}});
 expect(start.ok()).toBe(true);
 const token=new URL((await start.json()).localSignInUrl).searchParams.get('token');
 const complete=await page.request.post('/api/auth/complete',{
   headers:{Origin:origin},data:{email,token}});
 expect(complete.ok()).toBe(true);
 const account=await page.request.post('/api/onboarding',{
   headers:{Origin:origin},
   data:{displayName:'Service Flow Owner',clientName:'Service Flow Account',
     landlordType:'residential'}});
 expect(account.ok()).toBe(true);
 const clientId=(await account.json()).clientId;
 const property=await page.request.post('/api/w/landlord/'+clientId+'/properties',{
   headers:{Origin:origin},data:{address:'29 Synthetic Leasing Way',suburb:'Perth',
     postcode:'6000',propertyType:'House',selfManaged:true}});
 expect(property.ok()).toBe(true);
 return {clientId,propertyId:(await property.json()).propertyId,
   base:'/w/landlord/'+clientId};
}

test('PCR, Routine and Exit add-ons are optional and appear before appointment selection',
  async({page})=>{
 const {base,propertyId}=await ownerWithProperty(page);
 await page.goto(base+'/book/property-condition-report?property='+propertyId);
 await expect(page.getByRole('heading',{name:'What would you like us to do?'})).toBeVisible();
 await expect(page.getByRole('button',{name:/Book an inspection/})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:/Open Homes & leasing/})).toBeVisible();
 await expect(page.getByRole('button',{name:/Keys & access control/})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Optional services'})).toBeVisible();
 await expect(page.getByText('The discounted Inventory Report can be added',{exact:false})).not.toBeVisible();
 await page.getByLabel('Furnishing').selectOption('part_furnished');
 await expect(page.getByText('Property Inventory Report (with PCR)')).toBeVisible();
 await page.getByLabel(/Property Inventory Report \(with PCR\)/).check();
 await expect(page.getByText('Candidate extra fee')).toBeVisible();
 await expect(page.getByText('Not included in the charge or booked price.',{exact:false})).toBeVisible();
 await page.getByLabel('Service',{exact:true}).selectOption('routine-inspection');
 await page.getByLabel('Current occupancy').selectOption('tenanted');
 await expect(page.getByText('ProInspect to prepare and send Form 19')).toBeVisible();
 await page.getByLabel(/ProInspect to prepare and send Form 19/).check();
 await page.getByLabel('Service',{exact:true}).selectOption('final-exit-inspection');
 await page.getByLabel('Will the tenant attend the exit inspection?').selectOption('yes');
 await expect(page.getByText('ProInspect to coordinate tenant attendance')).toBeVisible();
 await page.getByLabel(/ProInspect to coordinate tenant attendance/).check();
 await expect(page.getByLabel("Tenant's name (if known)")).toBeVisible();
 await expect(page.getByLabel("Tenant's email (if known)")).toBeVisible();
});

test('open-home is a grouped scheduling request and maintenance/insurance start from the property',
 async({page})=>{
 const {base,propertyId}=await ownerWithProperty(page);
 await page.goto(base+'/requests?property='+propertyId+'&service=open-home');
 await expect(page.getByRole('heading',{name:'New request'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Open Home — details'})).toBeVisible();
 const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 await page.getByLabel('Preferred Open Home date').fill(day);
 await page.getByLabel('Preferred time frame').selectOption('evening');
 await page.getByLabel(/complimentary social media marketing/).check();
 await page.getByLabel(/Tenant Application Handling/).check();
 await page.getByRole('button',{name:'Request Open Home scheduling'}).click();
 await expect(page.getByText('Your request has been received.')).toBeVisible();
 await page.goto(base+'/properties/'+propertyId);
 await expect(page.getByRole('heading',{name:'Maintenance & Insurance'})).toBeVisible();
 await page.getByRole('link',{name:/Submit insurance request/}).click();
 await expect(page.getByRole('heading',{name:'Insurance Request — details'})).toBeVisible();
 await page.getByLabel('Claim reference (if known)').fill('Synthetic-123');
 await page.getByRole('button',{name:'Submit service request'}).click();
 await expect(page.getByText('Your request has been received.')).toBeVisible();
 await expect(page.getByText('Service type: insurance')).toBeVisible();
});
