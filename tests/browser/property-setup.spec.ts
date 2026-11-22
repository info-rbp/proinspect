import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';

test('Residential owner completes four-step setup and sees the property dashboard with private tenancy details',async({page})=>{
  const email='property-wizard-'+randomUUID()+'@proinspect.test';
  const start=await page.request.post('/api/auth/start',{
    headers:{Origin:'http://127.0.0.1:5173'},data:{email},
  });
  expect(start.ok()).toBe(true);
  const login=await page.request.post('/api/auth/complete',{
    headers:{Origin:'http://127.0.0.1:5173'},
    data:{email,token:new URL((await start.json()).localSignInUrl).searchParams.get('token')},
  });
  expect(login.ok()).toBe(true);
  const account=await page.request.post('/api/onboarding',{
    headers:{Origin:'http://127.0.0.1:5173'},
    data:{displayName:'Wizard Owner',clientName:'Wizard Account',landlordType:'residential'},
  });
  expect(account.ok()).toBe(true);
  const clientId=(await account.json()).clientId;
  const base='/w/landlord/'+clientId;
  await page.goto(base+'/properties');
  await expect(page.getByRole('heading',{name:'Add your residential property'})).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Property setup progress'})).toBeVisible();
  await page.getByLabel('Street address, including unit number').fill('75 Synthetic Profile Crescent');
  await page.getByLabel('Suburb',{exact:true}).fill('Ashby');
  await page.getByLabel('WA postcode').fill('6065');
  await page.getByLabel('Property type').selectOption('Townhouse');
  await page.getByRole('button',{name:/Continue/}).click();
  for(const [label,n] of [['Bedrooms',3],['Bathrooms',2],['En-suites',1],['Car spaces',2]] as const) {
    for(let i=0;i<n;i++)await page.getByRole('button',{name:'Add '+label}).click();
  }
  await page.getByLabel('Furnishing').selectOption('part_furnished');
  await page.getByRole('button',{name:/Continue/}).click();
  await page.getByLabel('Current tenancy status').selectOption('tenanted');
  await page.getByLabel('Lease arrangement').selectOption('fixed');
  await page.getByLabel('Lease commencement date (if known)').fill('2026-12-01');
  await page.getByLabel('Fixed-term lease end date (if known)').fill('2027-11-30');
  await page.getByRole('button',{name:/Add a tenant/}).click();
  await page.getByLabel('Tenant 1 full name').fill('Casey Example');
  await page.getByLabel('Tenant 1 email (optional)').fill('casey@example.test');
  await page.getByRole('button',{name:/Continue/}).click();
  await page.getByLabel('Additional information (optional)').fill('Courtyard and one secure storeroom.');
  await expect(page.getByRole('region',{name:'Review property details'})).toBeVisible();
  await page.getByRole('checkbox',{name:/I confirm I own and self-manage/}).check();
  await page.getByRole('button',{name:'Add property'}).click();
  await expect(page).toHaveURL(/\/w\/landlord\/cli_[a-z0-9]+\/properties\/prop_[a-z0-9]+/);
  await expect(page.getByRole('heading',{name:'Property details'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Tenancy information'})).toBeVisible();
  await expect(page.getByText('Casey Example')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Past bookings & inspections'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Maintenance & requests'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Reports & property documents'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Full history'})).toHaveAttribute('href',/records\/bookings\?property=/);
  const id=new URL(page.url()).pathname.split('/').pop();
  const scope=await page.request.get('/api/w/landlord/'+clientId+'/properties/'+id+'/setup');
  expect(scope.ok()).toBe(true);
  expect((await scope.json()).historyCount).toBe(1);
  const workspace=await page.request.get('/api/w/landlord/'+clientId+'/data');
  expect((await workspace.text())).not.toContain('casey@example.test');
  const financial=await page.request.get('/api/account');
  expect((await financial.json()).billingAvailable).toBe(false);
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole('heading',{name:'Property details'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});

test('existing owner can complete a minimal property profile without recreating the address',async({page})=>{
  const email='profile-existing-'+randomUUID()+'@proinspect.test',origin='http://127.0.0.1:5173';
  const start=await page.request.post('/api/auth/start',{headers:{Origin:origin},data:{email}});
  const token=new URL((await start.json()).localSignInUrl).searchParams.get('token');
  await page.request.post('/api/auth/complete',{headers:{Origin:origin},data:{email,token}});
  const account=await page.request.post('/api/onboarding',{headers:{Origin:origin},
    data:{displayName:'Existing Owner',clientName:'Existing Owner Account'}});
  const client=(await account.json()).clientId;
  const created=await page.request.post('/api/w/landlord/'+client+'/properties',{
    headers:{Origin:origin},data:{address:'16 Existing Road',suburb:'Perth',postcode:'6000',
      propertyType:'House',selfManaged:true},
  });
  expect(created.ok()).toBe(true);
  const id=(await created.json()).propertyId;
  await page.goto('/w/landlord/'+client+'/properties/'+id);
  await expect(page.getByText('Room, bathroom and parking details have not been provided yet.')).toBeVisible();
  await page.getByText('Edit property profile and tenancy details').click();
  await page.getByRole('button',{name:/Continue/}).click();
  await page.getByRole('button',{name:'Add Car spaces'}).click();
  await page.getByRole('button',{name:/Continue/}).click();
  await page.getByLabel('Current tenancy status').selectOption('vacant');
  await page.getByRole('button',{name:/Continue/}).click();
  await page.getByRole('button',{name:'Save property details'}).click();
  await expect(page.getByText('Property details saved.',{exact:false})).toBeVisible();
  const setup=await page.request.get('/api/w/landlord/'+client+'/properties/'+id+'/setup');
  const saved=await setup.json();
  expect(saved.profile.carSpaces).toBe(1);
  expect(saved.tenancy.occupancyStatus).toBe('vacant');
  expect(saved.profile.version).toBe(1);
});
