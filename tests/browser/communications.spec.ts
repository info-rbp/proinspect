import {test,expect,type BrowserContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
const origin='http://127.0.0.1:5173';
async function post(c:BrowserContext,path:string,data:unknown={}){const r=await c.request.post(path,{headers:{Origin:origin},data});const v=await r.json();expect(r.ok(),JSON.stringify(v)).toBe(true);return v as any;}
async function login(c:BrowserContext,email:string){const start=await post(c,'/api/auth/start',{email});await post(c,'/api/auth/complete',{email,token:new URL(start.localSignInUrl).searchParams.get('token')});}
test('public enquiry reaches authorised Staff triage and a recorded email reply',async({page,browser})=>{
 const refName='Enquiry Browser '+randomUUID().slice(0,8);
 await page.goto('http://127.0.0.1:5173/contact?service=routine-inspection');
 await expect(page.getByRole('heading',{level:1})).toHaveText('Let’s talk about your property.');
 await expect(page.getByLabel('Service (optional)',{exact:true})).toHaveValue('routine-inspection');
 await page.getByLabel('Your name',{exact:true}).fill(refName);
 await page.getByLabel('Email address',{exact:true}).fill('browser-'+randomUUID()+'@proinspect.test');
 await page.getByLabel('Organisation (optional)').fill('Synthetic browser portfolio');
 await page.getByLabel('How can ProInspect help?').fill('We would like a recurring inspection arrangement for our self-managed properties.');
 await page.getByRole('checkbox').check();await page.setViewportSize({width:390,height:844});
 mkdirSync('artifacts/screenshots',{recursive:true});await page.screenshot({path:'artifacts/screenshots/marketing-enquiry-mobile.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
 await page.getByRole('button',{name:'Send enquiry',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Your enquiry has been received.'})).toBeVisible();
 const reference=(await page.getByRole('status').innerText()).match(/ENQ-[A-F0-9]{12}/)![0];
 const staff=await browser.newContext({baseURL:origin});
 try{
 await login(staff,'communications-staff@proinspect.test');const p=await staff.newPage();await p.goto('/w/staff/operations/enquiries?q='+reference);
 await expect(p.getByText(refName,{exact:false})).toBeVisible();await p.getByRole('link',{name:reference,exact:true}).click();await expect(p.getByRole('heading',{level:1})).toHaveText(reference);
 const triage=p.locator('section.panel').filter({has:p.getByRole('heading',{name:'Triage and assignment',exact:true})});
 const history=p.locator('section.panel').filter({has:p.getByRole('heading',{name:'Enquiry history',exact:true})});
 await triage.getByLabel('Status',{exact:true}).selectOption('reviewing');await triage.getByLabel('Internal note',{exact:true}).fill('Reviewed the property service requirements; awaiting portfolio details.');
 await triage.getByRole('button',{name:'Save enquiry status'}).click();
 await expect(history.getByText('Reviewed the property service requirements; awaiting portfolio details.',{exact:true})).toBeVisible();
 await expect(p).toHaveURL(/\/enquiries\/enq_[a-zA-Z0-9]+$/);
 const reply=p.locator('section.panel').filter({has:p.getByRole('heading',{name:'Reply to the enquiry',exact:true})});
 await reply.getByLabel('Reply message').fill('Please confirm the number of properties and the preferred inspection period.');
 await reply.getByRole('button',{name:'Queue email reply'}).click();
 await expect(history.getByText('Please confirm the number of properties and the preferred inspection period.',{exact:true})).toBeVisible();
 await expect(triage.getByLabel('Status',{exact:true})).toHaveValue('awaiting_customer');
 await p.screenshot({path:'artifacts/screenshots/staff-enquiry.png',fullPage:true});
 }finally{await staff.close();}
});
test('Staff cannot create a building broadcast from the retired scheme workflow',async({page})=>{
  await login(page.context(),'communications-staff@proinspect.test');
  const response=await page.request.post('/api/w/staff/operations/schemes/historical/notices',{headers:{Origin:origin},data:{title:'Synthetic notice',body:'A synthetic building notice',audience:'residents'}});
  expect(response.status()).toBe(410);
  expect((await response.json()).code).toBe('SECTOR_RETIRED');
  await page.goto('/w/staff/operations/enquiries');
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
});
