import {test,expect,type BrowserContext} from '@playwright/test';
import {mkdirSync} from 'node:fs';
const origin='http://127.0.0.1:5173';
async function login(c:BrowserContext,email:string){const a=await c.request.post('/api/auth/start',{headers:{Origin:origin},data:{email}});expect(a.ok()).toBe(true);const t=new URL((await a.json()).localSignInUrl).searchParams.get('token');const r=await c.request.post('/api/auth/complete',{headers:{Origin:origin},data:{email,token:t}});expect(r.ok()).toBe(true);}
test('administrator release, pricing and legal controls render without claiming activation',async({browser})=>{
 const c=await browser.newContext({baseURL:origin});try{await login(c,'release-admin@proinspect.test');const p=await c.newPage();mkdirSync('artifacts/screenshots',{recursive:true});
 for(const [path,title] of [['release-readiness','Release acceptance'],['legal-administration','Legal versions and acceptance'],['pricing-administration','Service price approvals']]){
  const r=await p.goto('/w/staff/operations/'+path);expect(r?.status()).toBe(200);await expect(p.getByRole('heading',{level:1})).toContainText(title);
  for(const width of [390,1440]){await p.setViewportSize({width,height:950});expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),path+' overflow').toBe(true);await p.screenshot({path:`artifacts/screenshots/sprint-${path}-${width}.png`,fullPage:true});}
 }
 await p.goto('/w/staff/operations/release-readiness');await expect(p.getByText('valid source-specific approval missing',{exact:false}).first()).toBeVisible();await expect(p.getByRole('heading',{name:'Provider configuration and remaining evidence'})).toBeVisible();await expect(p.getByText('The DocuSign adapter creates sandbox drafts only.',{exact:false})).toBeVisible();
 }finally{await c.close();}
});
test('operational staff cannot promote themselves through administrator approval APIs',async({browser})=>{
 const c=await browser.newContext({baseURL:origin});try{await login(c,'sprint-ops@proinspect.test');for(const path of ['/api/staff/legal','/api/staff/release-readiness'])expect((await c.request.get(path)).status()).toBe(403);const p=await c.newPage();const r=await p.goto('/w/staff/operations/billing');expect(r?.status()).toBe(200);await expect(p.getByRole('heading',{level:1})).toHaveText('Billing and reconciliation');await expect(p.getByText('No invoices recorded for this workspace.')).toBeVisible();}finally{await c.close();}
});
test('disabled professional facilities show an explicit activation state rather than a broken form',async({browser})=>{
 const c=await browser.newContext({baseURL:origin});try{await login(c,'review-staff@proinspect.test');const p=await c.newPage();const r=await p.goto('/w/staff/operations/facilities');expect(r?.status()).toBe(200);await expect(p.getByRole('heading',{name:'Activation pending'})).toBeVisible();await expect(p.getByRole('button',{name:'Register device'})).toHaveCount(0);}finally{await c.close();}
});
test('versioned legal draft is stored through the actual administration form without approving itself',async({browser})=>{
 const c=await browser.newContext({baseURL:origin});try{await login(c,'release-admin@proinspect.test');const p=await c.newPage();await p.goto('/w/staff/operations/legal-administration');const form=p.getByRole('button',{name:'Save review draft'}).locator('..').locator('..');await form.getByLabel('Document',{exact:true}).selectOption('privacy');await form.getByLabel('Version label').fill('browser-review-'+Date.now());await form.getByLabel('Final document title').fill('Synthetic privacy review - not approved');await form.getByLabel(/Complete reviewed text/).fill('Synthetic testing document for the local browser fixture only. This text does not approve any operational policy or contractual commitments.');await form.getByRole('button',{name:'Save review draft'}).click();await expect(p.getByRole('status').filter({hasText:'Saved.'})).toBeVisible();await expect(p.getByText('Status: draft',{exact:true}).last()).toBeVisible();}finally{await c.close();}
});
