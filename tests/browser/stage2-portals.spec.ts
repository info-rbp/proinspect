import {test,expect,type Browser,type BrowserContext,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';

const origin='http://127.0.0.1:5173';
const stamp=()=>randomUUID().slice(0,9);
const future=()=>new Date(Date.now()+180*86400000).toISOString();
async function post(c:BrowserContext,path:string,body:unknown={}){
  const res=await c.request.post(path,{headers:{Origin:origin},data:body,timeout:25000});
  const value=await res.json().catch(()=>({}));
  expect(res.ok(),path+': '+JSON.stringify(value)).toBe(true);
  return value as any;
}
async function actor(browser:Browser,email:string){
  const context=await browser.newContext({baseURL:origin,viewport:{width:1440,height:900}});
  const first=await post(context,'/api/auth/start',{email});
  const token=new URL(first.localSignInUrl).searchParams.get('token');
  await post(context,'/api/auth/complete',{email,token});
  const session=await context.request.get('/api/session');
  expect(session.ok()).toBe(true);
  return {context,page:await context.newPage(),session:await session.json() as any,email};
}
async function organisation(c:BrowserContext,staff:BrowserContext,kind:'property-manager'|'strata-manager'){
  const app=await post(c,'/api/organisation-applications',{kind,name:'Stage2 '+kind+' '+stamp(),businessReference:'Stage2 synthetic reviewed authority'});
  return post(staff,'/api/w/staff/operations/organisation-applications/'+app.id+'/review',{decision:'approved',reference:'Independent stage2 browser review'});
}
async function checkPortal(page:Page,kind:string,href:string,title:string){
  const res=await page.goto(href,{waitUntil:'domcontentloaded'});
  expect(res?.status(),kind+' page').toBe(200);
  await expect(page.getByRole('heading',{level:1})).toHaveText(title);
  await expect(page.getByRole('complementary',{name:'Workspace navigation'})).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Breadcrumb'})).toBeVisible();
  const main=page.locator('#main');
  await expect(main).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),kind+' desktop overflow').toBe(true);
  mkdirSync('artifacts/screenshots/stage2',{recursive:true});
  await page.screenshot({path:'artifacts/screenshots/stage2/'+kind+'-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  const toggle=page.getByRole('button',{name:'Open navigation'});
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded','true');
  await expect(page.getByRole('complementary',{name:'Workspace navigation'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Close menu'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded','false');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),kind+' mobile overflow').toBe(true);
  await page.screenshot({path:'artifacts/screenshots/stage2/'+kind+'-mobile.png',fullPage:true});
  await page.setViewportSize({width:320,height:720});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),kind+' 320px overflow').toBe(true);
  await page.setViewportSize({width:1440,height:900});
}

test('Stage 2: nine genuine isolated workspace roles share a responsive accessible shell without crossing permissions',async({browser})=>{
  const people:Awaited<ReturnType<typeof actor>>[]=[];
  const add=async(email:string)=>{const a=await actor(browser,email);people.push(a);return a;};
  try{
    const staff=await add('staff@proinspect.test');
    const reviewer=await add('review-staff@proinspect.test');
    const landlord=await add('stage2-landlord-'+stamp()+'@proinspect.test');
    const commercial=await add('stage2-commercial-'+stamp()+'@proinspect.test');
    const agency=await add('stage2-agency-'+stamp()+'@proinspect.test');
    const strata=await add('stage2-strata-'+stamp()+'@proinspect.test');
    const tenant=await add('stage2-tenant-'+stamp()+'@proinspect.test');
    const resident=await add('stage2-resident-'+stamp()+'@proinspect.test');
    const council=await add('stage2-council-'+stamp()+'@proinspect.test');
    const buildingManager=await add('stage2-building-manager-'+stamp()+'@proinspect.test');

    const landlordClient=await post(landlord.context,'/api/onboarding',{displayName:'Stage2 Landlord',clientName:'Stage2 Home Owner',landlordType:'residential'});
    const commercialClient=await post(commercial.context,'/api/onboarding',{displayName:'Stage2 Commercial',clientName:'Stage2 Commercial Owner',landlordType:'commercial'});
    const agencyClient=await organisation(agency.context,staff.context,'property-manager');
    const strataClient=await organisation(strata.context,staff.context,'strata-manager');
    const landlordBase='/api/w/landlord/'+landlordClient.clientId;
    const property=await post(landlord.context,landlordBase+'/properties',{address:'19 Stage2 '+stamp()+' Street',suburb:'Perth',postcode:'6000',propertyType:'House',selfManaged:true});
    const lease=await post(landlord.context,landlordBase+'/tenancies',{propertyId:property.propertyId,email:'stage2-invite-'+stamp()+'@proinspect.test',startsAt:new Date(Date.now()-86400000).toISOString()});
    const inv=await post(landlord.context,landlordBase+'/tenancies/'+lease.id+'/invite',{email:tenant.email});
    await post(tenant.context,'/api/invitations/accept',{token:new URL(inv.localInvitationUrl).searchParams.get('token')});

    const strataBase='/api/w/strata-manager/'+strataClient.clientId;
    const scheme=await post(strata.context,strataBase+'/schemes',{name:'Stage2 Apartments '+stamp(),schemeNumber:'STAGE2-'+stamp(),address:'39 Stage2 '+stamp()+' Road',suburb:'Perth',postcode:'6000',authorityReference:'Stage2 approved management instruction',validUntil:future()});
    for(const [person,role] of [[resident,'resident'],[council,'council_member']] as const){
      const member=await post(strata.context,strataBase+'/team/invite',{email:person.email,role,schemeId:scheme.id,...(role==='council_member'?{endsAt:future()}:{})});
      await post(person.context,'/api/invitations/accept',{token:new URL(member.localInvitationUrl).searchParams.get('token')});
    }
    const assignment=await post(staff.context,'/api/w/staff/operations/facilities/assignments/request',{
      buildingId:scheme.buildingId,userId:buildingManager.session.user.id,clientId:strataClient.clientId,
      startsAt:new Date(Date.now()-86400000).toISOString(),endsAt:future(),authorityReference:'Stage2 independent building appointment'
    });
    await post(reviewer.context,'/api/w/staff/operations/facilities/assignments/approve',{
      assignmentId:assignment.id,reference:'Stage2 independent review accepted'
    });

    const homes=[
      [staff,'staff','/w/staff/operations','Today'],
      [landlord,'landlord','/w/landlord/'+landlordClient.clientId,'Property overview'],
      [commercial,'commercial','/w/commercial/'+commercialClient.clientId,'Commercial portfolio'],
      [agency,'property-manager','/w/property-manager/'+agencyClient.clientId,'Portfolio overview'],
      [strata,'strata-manager','/w/strata-manager/'+strataClient.clientId,'Scheme operations'],
      [tenant,'tenant','/w/tenant/'+lease.id,'My tenancy'],
      [resident,'building','/w/building/'+scheme.id,'Building overview'],
      [council,'council','/w/council/'+scheme.id,'Council oversight'],
      [buildingManager,'building-manager','/w/building-manager/'+scheme.buildingId,'Building operations'],
    ] as const;
    for(const [person,kind,href,title] of homes){
      await checkPortal(person.page,kind,href,title);
      const nav=person.page.getByRole('complementary',{name:'Workspace navigation'});
      if(kind==='staff'){
        for(const item of ['Today','Schedule','Work orders','Reports','Clients & properties','Finance'])await expect(nav.getByRole('link',{name:item,exact:true})).toBeVisible();
        await expect(person.page.getByRole('heading',{name:'Priority actions',exact:true})).toBeVisible();
        await expect(person.page.getByRole('heading',{name:'Recent activity',exact:true})).toBeVisible();
        await nav.locator('.side-nav-more > summary').click();
        await nav.locator('.pi-nav-group').filter({has:nav.locator('summary').filter({hasText:'Administration & settings'})}).locator('summary').first().click();
        await expect(nav.getByRole('link',{name:'Integrations'})).toBeVisible();
      }
      if(kind==='tenant'||kind==='building'||kind==='council'||kind==='building-manager'){
        await expect(nav.getByRole('link',{name:'Billing & reconciliation'})).toHaveCount(0);
        await expect(nav.getByRole('link',{name:'Legal versions'})).toHaveCount(0);
      }
    }
    expect((await resident.context.request.get('/api/w/council/'+scheme.id)).status()).toBe(403);
    expect((await council.context.request.get('/api/w/building/'+scheme.id)).status()).toBe(403);
    expect((await tenant.context.request.get(landlordBase)).status()).toBe(403);
    expect((await resident.context.request.get('/api/w/building-manager/'+scheme.buildingId)).status()).toBe(403);
  }finally{await Promise.all(people.map(p=>p.context.close()));}
});
