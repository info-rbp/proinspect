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
