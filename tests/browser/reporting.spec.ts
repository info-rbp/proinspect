import {test,expect,type BrowserContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
const origin='http://127.0.0.1:5173';
async function post(c:BrowserContext,path:string,data:unknown){
 const r=await c.request.post(path,{headers:{Origin:origin},data});
 const v=await r.json();expect(r.ok(),JSON.stringify(v)).toBe(true);return v as any;
}
async function login(c:BrowserContext,email:string){
 const s=await post(c,'/api/auth/start',{email});
 await post(c,'/api/auth/complete',{email,token:new URL(s.localSignInUrl).searchParams.get('token')});
}
test('Staff reporting register is accessible and mobile-safe within the unified ProInspect portal',async({browser})=>{
 const c=await browser.newContext({baseURL:origin});
 try{
  await login(c,'review-staff@proinspect.test');
  const p=await c.newPage();await p.setViewportSize({width:390,height:844});
  await p.goto('/w/staff/operations/reports');
  await expect(p.getByRole('heading',{name:'Inspection reporting'})).toBeVisible();
  await expect(p.getByRole('heading',{name:'Start a Work Order report'})).toBeVisible();
  await expect(p.getByRole('heading',{name:'Reporting register'})).toBeVisible();
  expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  mkdirSync('artifacts/screenshots',{recursive:true});
  await p.screenshot({path:'artifacts/screenshots/report-register-staff-mobile.png',fullPage:true});
 }finally{await c.close();}
});
test('customer reporting routes disclose no Staff draft creation or private Work Order controls',async({browser})=>{
 const c=await browser.newContext({baseURL:origin});
 try{
  const email='report-browser-owner-'+randomUUID()+'@proinspect.test';
  await login(c,email);
  const owner=await post(c,'/api/onboarding',{displayName:'Browser Report Owner',clientName:'Browser Property Owner'});
  const page=await c.newPage();await page.goto('/w/landlord/'+owner.clientId+'/reports');
  await expect(page.getByRole('heading',{name:'Issued inspection reports'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Available reports'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Start a Work Order report'})).toHaveCount(0);
  await expect(page.getByText('No reports yet')).toBeVisible();
  expect((await c.request.get('/api/w/landlord/'+owner.clientId+'/reports')).status()).toBe(200);
  expect((await c.request.post('/api/w/landlord/'+owner.clientId+'/reports/create',{
   headers:{Origin:origin},data:{workOrderId:'fake-work-order'}})).status()).toBe(403);
 }finally{await c.close();}
});

test('mobile inspector captures reviewed evidence without horizontal overflow',async({browser})=>{
 const ownerCtx=await browser.newContext({baseURL:origin});
 const staffCtx=await browser.newContext({baseURL:origin,viewport:{width:390,height:844}});
 try{
  const email='field-owner-'+randomUUID()+'@proinspect.test';
  await login(ownerCtx,email);
  const account=await post(ownerCtx,'/api/onboarding',{displayName:'Field fixture',clientName:'Field fixture owner'});
  const base='/api/w/landlord/'+account.clientId;
  const property=await post(ownerCtx,base+'/properties',{address:'37 Field Inspection Road '+randomUUID().slice(0,4),suburb:'Perth',postcode:'6000',propertyType:'House',selfManaged:true});
  const date=new Date(Date.now()+14*86400000);
  while([0,6].includes(date.getUTCDay()))date.setUTCDate(date.getUTCDate()+1);
  const slots=await ownerCtx.request.get(base+'/availability?service=routine-inspection&date='+date.toISOString().slice(0,10)+'&property='+property.propertyId);
  expect(slots.ok()).toBe(true);
  const available=(await slots.json()).slots;
  expect(available.length).toBeGreaterThan(0);
  const booking=await post(ownerCtx,base+'/bookings',{propertyId:property.propertyId,serviceId:'routine-inspection',
   startsAt:available[0].start,requestKey:randomUUID().replaceAll('-',''),
   access:{method:'owner',instructions:'Synthetic browser field report test',noticeConfirmed:true}});
  await login(staffCtx,'review-staff@proinspect.test');
  const report=await post(staffCtx,'/api/w/staff/operations/reports/create',{workOrderId:booking.workOrderId});
  const page=await staffCtx.newPage();
  await page.goto('/w/staff/operations/reports/'+report.id);
  await expect(page.getByRole('region',{name:'Mobile field inspection'})).toBeVisible();
  await expect(page.getByRole('progressbar',{name:'Inspection assessment progress'})).toBeVisible();
  await page.getByRole('button',{name:'Intact'}).click();
  await page.getByLabel('Observation and context').fill('Synthetic observation for responsive field capture.');
  await page.getByRole('button',{name:/Save draft/}).click();
  await expect(page.getByText(/Report action completed/)).toBeVisible();
  const photo=page.getByLabel('Take or select evidence photo');
  await photo.setInputFiles('tests/fixtures/report-photo.jpg');
  await expect(page.getByText('Photo uploaded and awaiting review.')).toBeVisible();
  const evidence=await staffCtx.request.get('/api/w/staff/operations/reports/'+report.id);
  expect(evidence.ok()).toBe(true);
  const current=await evidence.json();
  expect(current.evidence.length).toBe(1);
  expect(current.evidence[0].status).toBe('pending');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  mkdirSync('artifacts/screenshots',{recursive:true});
  await page.screenshot({path:'artifacts/screenshots/field-inspector-mobile.png',fullPage:true});
 }finally{await ownerCtx.close();await staffCtx.close();}
});
