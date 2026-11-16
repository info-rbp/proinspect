/** Read-only production/candidate acceptance. No application or email is created. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';

const origin=process.env.TARGET_ORIGIN??'https://proinspect.systems';
assert(['https://proinspect.systems','https://proinspect-v3-staging.delicate-dream-e4c9.workers.dev'].includes(origin));
const source=process.env.EXPECTED_SOURCE_SHA;assert.match(source??'',/^[a-f0-9]{40}$/);
const phase=process.env.RELEASE_REVIEW_PHASE??'live';assert(['preflight','live'].includes(phase));
const version=process.env.TARGET_VERSION_UUID;if(version)assert.match(version,/^[a-f0-9-]{36}$/);
const headers=version?{'Cloudflare-Workers-Version-Overrides':'proinspect-platform="'+version+'"'}:{};
const temporary=process.env.RENTAL_DOCUMENT_MODE==='temporary';
const folder=(temporary?'artifacts/temporary-document-release/':'artifacts/rental-availability-release/')+phase;mkdirSync(folder,{recursive:true});
const report={at:new Date().toISOString(),source,origin,phase,version:version??null,readOnly:true,checks:[],status:'FAIL'};
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext();
 await context.route('**/*',route=>{
  const request=route.request();
  if(!['GET','HEAD','OPTIONS'].includes(request.method()))return route.abort();
  return route.continue(new URL(request.url()).origin===origin?{headers:{...request.headers(),...headers}}:{});
 });
 const response=await context.request.get(origin+'/api/health',{headers});assert.equal(response.status(),200);
 const health=await response.json();assert.equal(health.source,source);assert.equal(health.ok,true);
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 for(const viewport of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
  await page.setViewportSize({width:viewport.width,height:viewport.height});
  for(const unit of [6,16]){
   const path='/properties-for-lease/residential/unit-'+unit+'-273-fulham-street-cloverdale';
   const property=await page.goto(origin+path,{waitUntil:'networkidle',timeout:45000});assert.equal(property.status(),200);
   await expect(page.getByRole('heading',{name:'Ready to apply?',exact:true})).toBeVisible();
   const hero=page.getByRole('link',{name:'Start rental application',exact:true}),panel=page.getByRole('link',{name:'Start or resume application',exact:true});
   for(const link of [hero,panel]){await expect(link).toHaveAttribute('href',path+'/apply');assert(await link.isVisible());}
   assert(!(await page.locator('main').innerText()).includes('Online applications are not currently available'));
   assert((await page.locator('body').innerText()).includes("ProInspect conducts the advertised open inspection on this representative's behalf. All rental terms and applications are managed by the responsible party."));
   assert(!(await page.locator('body').innerText()).includes('Lighthouse Property Group'));
   await panel.scrollIntoViewIfNeeded();await page.screenshot({path:folder+'/unit-'+unit+'-'+viewport.name+'-application-panel.png',fullPage:false});
   await panel.click();await expect(page).toHaveURL(origin+path+'/apply');
   await expect(page.getByRole('heading',{name:/^Apply for Unit /})).toBeVisible();
   await expect(page.getByRole('button',{name:'Email my secure application link',exact:true})).toBeEnabled();
   assert.equal(await page.locator('input[type=file]').count(),0);
   const text=await page.locator('main').innerText();
   assert(text.includes(temporary?'Temporary document uploads are available.':'No document uploads are required for this intake.'));
   assert(text.includes(temporary?'privacy-managed-temporary-2026-11-16-v3':'privacy-managed-intake-2026-11-15-v1'));
   assert(text.includes('draft 14 days; submitted 90 days; withdrawn 30 days'));
   report.checks.push({unit,viewport:viewport.name,propertyLinksEnabled:true,formEnabled:true,temporaryUploadsAvailable:temporary,uploadsDeferred:!temporary,privacyNotice:true,disclaimerPreserved:true});
  }
 }
 assert.deepEqual(errors,[]);report.status='PASS';
}catch(error){report.error=String(error?.stack??error);process.exitCode=1;}
finally{await browser.close();writeFileSync(folder+'/rental-public-links.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
