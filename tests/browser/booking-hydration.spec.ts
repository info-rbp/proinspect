import {test,expect,type BrowserContext} from '@playwright/test';
import {randomUUID} from 'node:crypto';
const origin='http://127.0.0.1:5173';
async function post(context:BrowserContext,path:string,data:unknown){
 const response=await context.request.post(path,{headers:{Origin:origin},data});
 const value=await response.json();expect(response.ok(),JSON.stringify(value)).toBe(true);return value;
}
async function login(context:BrowserContext,email:string){
 // Only the isolated local fixture provider returns localSignInUrl.
 const started=await post(context,'/api/auth/start',{email});
 expect(new URL(started.localSignInUrl).origin).toBe(origin);
 await post(context,'/api/auth/complete',{email,token:new URL(started.localSignInUrl).searchParams.get('token')});
}
test('server-rendered booking fields stay disabled until the client can retain input',async({browser})=>{
 const noScripts=await browser.newContext({baseURL:origin,javaScriptEnabled:false});
 try{
  await login(noScripts,`hydration-${randomUUID()}@proinspect.test`);
  const owner=await post(noScripts,'/api/onboarding',{
   displayName:'Synthetic Hydration Owner',clientName:'Hydration portfolio '+randomUUID().slice(0,8),landlordType:'residential',
  });
  const base=`/w/landlord/${owner.clientId}`;
  const property=await post(noScripts,'/api'+base+'/properties',{
   address:randomUUID().slice(0,8)+' Hydration Street',suburb:'Perth',postcode:'6000',
   propertyType:'House',selfManaged:true,
  });
  const page=await noScripts.newPage();
  await page.goto(base+`/book/routine-inspection?property=${property.propertyId}`);
  await expect(page.getByRole('heading',{name:'Arrange your next property visit.'})).toBeVisible();
  for(const label of ['Property','Service','How will access be provided?','Access instructions','Preferred date']){
   await expect(page.getByLabel(label,{exact:true})).toBeDisabled();
  }
  await expect(page.getByRole('button',{name:'Confirm booking',exact:true})).toBeDisabled();
  await expect(page.getByText('Preparing the booking form. JavaScript is required to check appointment availability and book a service.')).toBeVisible();
 }finally{await noScripts.close();}
});
