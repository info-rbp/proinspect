import {test,expect,type BrowserContext} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const origin='http://127.0.0.1:5173';
async function login(context:BrowserContext,email:string){
 const first=await context.request.post('/api/auth/start',{headers:{Origin:origin},data:{email}});
 expect(first.ok()).toBe(true);
 const payload=await first.json() as {localSignInUrl:string};
 const token=new URL(payload.localSignInUrl).searchParams.get('token');
 const complete=await context.request.post('/api/auth/complete',{headers:{Origin:origin},data:{email,token}});
 expect(complete.ok()).toBe(true);
}
test('V2 estate, market pack and executive workspaces render and remain staff-only on desktop and mobile',async({browser})=>{
 const staff=await browser.newContext({baseURL:origin,viewport:{width:1280,height:850}});
 const customer=await browser.newContext({baseURL:origin});
 try{
  await login(staff,'review-staff@proinspect.test');
  const page=await staff.newPage();
  const views=[
   {path:'asset-compliance',name:'Asset registers, preventive maintenance and compliance',endpoint:'v2-estates'},
   {path:'market-packs',name:'Specialist market packs',endpoint:'v2-sectors'},
   {path:'enterprise-intelligence',name:'Enterprise operations and capital works',endpoint:'v2-intelligence'}
  ];
  mkdirSync('artifacts/screenshots',{recursive:true});
  for(const view of views){
   const response=await page.goto('/w/staff/operations/'+view.path);
   expect(response?.status()).toBe(200);
   await expect(page.getByRole('heading',{level:1})).toHaveText(view.name);
   await expect(page.getByRole('heading',{level:2}).first()).toBeVisible();
   const result=await staff.request.get('/api/w/staff/operations/'+view.endpoint);
   expect(result.status()).toBe(200);
   await page.screenshot({path:'artifacts/screenshots/v2-'+view.path+'-desktop.png',fullPage:true});
   await page.setViewportSize({width:390,height:844});
   await page.screenshot({path:'artifacts/screenshots/v2-'+view.path+'-mobile.png',fullPage:true});
   const overflows=await page.evaluate(()=>[...document.querySelectorAll('body *')].map(element=>({
      tag:element.tagName, className:typeof element.className==='string'?element.className:'', width:Math.round(element.getBoundingClientRect().width),
      right:Math.round(element.getBoundingClientRect().right)
    })).filter(element=>element.right>window.innerWidth+2).slice(0,8));
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),view.path+' overflow offenders='+JSON.stringify(overflows)).toBe(true);
   await page.setViewportSize({width:1280,height:850});
  }
  await login(customer,'restricted-v2-'+randomUUID()+'@proinspect.test');
  const c=await customer.request.post('/api/onboarding',{headers:{Origin:origin},
    data:{displayName:'Restricted user',clientName:'Restricted portfolio'}});
  expect(c.ok()).toBe(true);
  for(const view of views){
   const x=await customer.request.get('/api/w/landlord/'+(await c.json()).clientId+'/'+view.endpoint);
   expect(x.status(),view.endpoint).toBe(403);
  }
 }finally{await staff.close();await customer.close();}
});
