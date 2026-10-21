/**
 * Hosted staging-only browser acceptance, deliberately unauthenticated and read-only.
 * Validates real assets/hydration, navigation, responsive layout and non-indexing.
 * Does not create customer records, send emails, or modify provider state.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium} from '@playwright/test';

const ORIGIN='https://proinspect-v3-staging.delicate-dream-e4c9.workers.dev';
if(process.env.GITHUB_REF!=='refs/heads/version-3-enhancements')
 throw new Error('Refusing browser UAT outside V3 integration branch.');
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const report={
 sourceSha:sha,stagingOrigin:ORIGIN,readOnly:true,
 customerDataUsed:false,providerInteractions:false,
 authenticatedPortalAcceptance:false,checks:[],status:'FAIL',at:new Date().toISOString()
};
mkdirSync('artifacts',{recursive:true});
let browser;
async function check(name,action){await action();report.checks.push(name);console.log('PASS '+name);}
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.setDefaultTimeout(12000);
 await check('homepage SSR and client link navigation',async()=>{
  const home=await page.goto(ORIGIN+'/',{waitUntil:'networkidle',timeout:25000});
  assert.equal(home.status(),200);
  assert.equal(page.url(),ORIGIN+'/');
  await page.locator('nav[aria-label="Primary navigation"] a[href="/services"]').click();
  await page.waitForURL('**/services',{timeout:12000});
  assert.equal(new URL(page.url()).pathname,'/services');
  assert((await page.locator('h1').first().innerText()).trim().length>12,'Services page must have a meaningful heading');
  assert(await page.locator('main a[href^="/services/"]').count()>0,'Services page must retain service navigation');
 });
 await check('service category route and marketing link hydration',async()=>{
  const s=await page.goto(ORIGIN+'/services/category/inspections',{waitUntil:'networkidle',timeout:25000});
  assert.equal(s.status(),200);
  assert((await page.locator('body').innerText()).toLowerCase().includes('inspection'));
  const q=await page.goto(ORIGIN+'/properties-for-lease',{waitUntil:'networkidle',timeout:25000});
  assert.equal(q.status(),200);
 });
 await page.screenshot({path:'artifacts/v3-hosted-desktop.png',fullPage:false});
 await check('Open Home check-in SSR contains no unauthorised contact data',async()=>{
  const r=await page.goto(ORIGIN+'/open-home/check-in',{waitUntil:'networkidle',timeout:25000});
  assert.equal(r.status(),200);
  assert((await page.locator('body').innerText()).toLowerCase().includes('open home'));
  assert(!(await page.locator('body').innerText()).includes('Synthetic Visitor'));
 });
 await check('mobile menu and hydrated route transitions',async()=>{
  await page.setViewportSize({width:390,height:844});
  const r=await page.goto(ORIGIN+'/',{waitUntil:'networkidle',timeout:25000});
  assert.equal(r.status(),200);
  const menu=page.locator('details.marketing-menu');
  await menu.locator('summary').click();
  assert.equal(await menu.getAttribute('open'),'');
  await menu.locator('a[href="/services"]').first().click();
  await page.waitForURL('**/services',{timeout:12000});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+2));
 });
 await page.screenshot({path:'artifacts/v3-hosted-mobile.png',fullPage:false});
 await check('staging legal drafts not indexed by search engines',async()=>{
  const response=await page.request.get(ORIGIN+'/privacy');
  assert.equal(response.status(),200);
  assert.match(response.headers()['x-robots-tag']??'',/noindex/i);
 });
 await check('protected staff API returns anonymous 401',async()=>{
  const response=await page.request.get(ORIGIN+'/api/staff/open-home-checkins?listingId=lst_synthetic');
  assert.equal(response.status(),401);
 });
 report.status='PASS';
}catch(e){
 report.failure=e instanceof Error?e.message:'Unknown browser failure';
 console.error('Staging browser acceptance failed: '+report.failure);
 process.exitCode=1;
}finally{
 await browser?.close();
 writeFileSync('artifacts/v3-staging-browser.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}
