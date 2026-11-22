import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const origin='http://127.0.0.1:5173';
async function post(request:any,path:string,body:unknown){
  const res=await request.post(path,{headers:{Origin:origin},data:body});
  const payload=await res.json();
  expect(res.ok(),path+': '+JSON.stringify(payload)).toBeTruthy();
  return payload;
}
test('Co-Living owner enquiry and six-stage onboarding guide are property-scoped, free and mobile readable',async({page})=>{
  const email='coliving-portal-'+randomUUID()+'@proinspect.test';
  const started=await post(page.request,'/api/auth/start',{email});
  await post(page.request,'/api/auth/complete',{
    email,token:new URL(started.localSignInUrl).searchParams.get('token'),
  });
  const account=await post(page.request,'/api/onboarding',{
    displayName:'Co-Living Portal Owner',clientName:'Synthetic Co-Living Client',
    landlordType:'residential',
  });
  const property=await post(page.request,'/api/w/landlord/'+account.clientId+'/properties',{
    address:randomUUID().slice(0,8)+' Synthetic Co-Living Street',
    suburb:'Perth',postcode:'6000',propertyType:'House',selfManaged:true,
  });
  const base='/w/landlord/'+account.clientId;
  await page.goto(base+'/co-living-onboardings');
  await expect(page.getByRole('heading',{name:'Co-Living property onboarding'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Your six-stage Co-Living journey'})).toBeVisible();
  for(const stage of ['Enquiry','Site Visit','Proposal','Implementation','Advertising','Tenanted']){
    await expect(page.getByRole('heading',{name:stage,exact:true})).toBeVisible();
  }
  await page.getByLabel('Residential property').selectOption(property.propertyId);
  await page.getByLabel('What would you like to achieve with the property?')
    .fill('Please assess the property as a furnished and independently approved Co-Living home.');
  await expect(page.getByRole('button',{name:'Submit Co-Living enquiry'})).toBeEnabled();
  await page.getByRole('button',{name:'Submit Co-Living enquiry'}).click();
  await expect(page).toHaveURL(new RegExp(base+'/co-living-onboardings/clop_[a-z0-9]+$'));
  await expect(page.getByRole('heading',{name:'Your Co-Living establishment journey'})).toBeVisible();
  await expect(page.getByText('Stage 1 of 6')).toBeVisible();
  await expect(page.getByText('What we need from you:',{exact:false})).toBeVisible();
  const state=await (await page.request.get('/api'+base+'/co-living-onboardings')).json();
  expect(state.projects).toHaveLength(1);
  expect(state.projects[0]).toMatchObject({
    property_id:property.propertyId,client_id:account.clientId,
    stage:'enquiry',status:'active',
  });
  const billing=await (await page.request.get('/api/account')).json();
  // Free property registration creates an account/property relationship record,
  // not a paid Stripe subscription. Inspect the actual financial state.
  expect(billing.billingAvailable).toBe(false);
  const plan=(billing.propertyPlans??[]).find((row:any)=>row.property_id===property.propertyId);
  expect(plan).toBeDefined();
  expect(plan.subscription_intent).toBe('none');
  expect(['none','grandfathered']).toContain(plan.subscription_status);
  expect(plan.stripe_subscription_recorded).toBe(0);
  await page.setViewportSize({width:390,height:844});
  await page.reload();
  await expect(page.getByRole('heading',{name:'Your Co-Living establishment journey'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);
});
