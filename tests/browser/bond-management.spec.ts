import { test, expect, type BrowserContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const origin='http://127.0.0.1:5173';
async function post(c:BrowserContext,path:string,input:unknown){
 const response=await c.request.post(path,{headers:{Origin:origin},data:input});
 const data=await response.json();
 expect(response.ok(),path+' '+JSON.stringify(data)).toBe(true);
 return data as any;
}
async function login(c:BrowserContext,email:string){
 const started=await post(c,'/api/auth/start',{email});
 await post(c,'/api/auth/complete',{email,token:new URL(started.localSignInUrl).searchParams.get('token')});
}
test('new residential Landlord can prepare a bond, and invited tenant only sees permitted actions',async({browser})=>{
 const owner=await browser.newContext({baseURL:origin}),tenant=await browser.newContext({baseURL:origin});
 try{
  const unique=randomUUID().slice(0,12);
  await login(owner,'bond-owner-'+unique+'@proinspect.test');
  const account=await post(owner,'/api/onboarding',{
    displayName:'Browser Bond Landlord',clientName:'Browser Bond Test'});
  const base='/api/w/landlord/'+account.clientId,href='/w/landlord/'+account.clientId;
  const property=await post(owner,base+'/properties',{
    address:unique+' Bond Acceptance Street',suburb:'Perth',postcode:'6000',
    propertyType:'House',selfManaged:true});
  const tenantEmail='bond-tenant-'+unique+'@proinspect.test';
  const tenancy=await post(owner,base+'/tenancies',{
    propertyId:property.propertyId,email:tenantEmail,
    startsAt:new Date(Date.now()-86400000).toISOString()});
  const bond=await post(owner,base+'/bonds',{
    tenancyId:tenancy.id,weeklyRentCents:50000,generalCents:200000,petCents:0,
    requestKey:randomUUID()});
  const page=await owner.newPage();
  const response=await page.goto(href+'/tenancies/'+tenancy.id+'/bonds');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading',{level:1,name:'Bond management'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Bond register'})).toBeVisible();
  await expect(page.getByText('Not confirmed',{exact:true})).toBeVisible();
  const wf=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Start a bond workflow',exact:true})});
  await wf.getByLabel('Workflow').selectOption('B01');
  await wf.getByLabel('Instructions, context and evidence required').fill('Synthetic manual initial lodgement worksheet');
  await wf.getByRole('button',{name:'Create bond workflow'}).click();
  await expect(page.getByRole('heading',{name:'Official bond preparation checklist'})).toBeVisible();
  const worksheet=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Official bond preparation checklist'})});
  await worksheet.getByLabel(/tenancy start/i).fill('2026-10-01');
  await worksheet.getByLabel(/tenant legal names/i).fill('Synthetic Tenant');
  await worksheet.getByLabel(/landlord legal name/i).fill('Synthetic Landlord');
  await worksheet.getByLabel(/payment date/i).fill('2026-09-30');
  await worksheet.getByRole('button',{name:'Save form preparation checklist'}).click();
  await expect(worksheet.getByText('Worksheet prepared',{exact:false})).toBeVisible();
  const invite=await post(owner,base+'/tenancies/'+tenancy.id+'/invite',{email:tenantEmail});
  await login(tenant,tenantEmail);
  await post(tenant,'/api/invitations/accept',{token:new URL(invite.localInvitationUrl).searchParams.get('token')});
  const tenantPage=await tenant.newPage();
  await tenantPage.goto('/w/tenant/'+tenancy.id+'/tenancies/'+tenancy.id+'/bonds');
  await expect(tenantPage.getByRole('heading',{level:1,name:'Bond management'})).toBeVisible();
  await expect(tenantPage.getByText('WA Bonds manual forms',{exact:false})).toBeVisible();
  await expect(tenantPage.getByRole('button',{name:'Record received payment'})).toHaveCount(0);
  const tenantWorkflow=tenantPage.locator('section.panel').filter({has:tenantPage.getByRole('heading',{name:'Start a bond workflow',exact:true})});
  await expect(tenantWorkflow.getByRole('option',{name:/Tenant-initiated release/})).toHaveCount(1);
  await expect(tenantWorkflow.getByRole('option',{name:/Initial lodgement/})).toHaveCount(0);
  await tenantPage.setViewportSize({width:390,height:844});
  expect(await tenantPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);
 }finally{await owner.close();await tenant.close();}
});
