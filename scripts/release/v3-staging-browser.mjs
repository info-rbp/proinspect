import { isApprovedStagingPreview } from '../deploy/staging-preview.mjs';
/**
 * Hosted staging-only browser acceptance, deliberately unauthenticated and read-only.
 * Validates real assets/hydration, navigation, responsive layout and non-indexing.
 * Does not create customer records, send emails, or modify provider state.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium,expect} from '@playwright/test';

const ORIGIN='https://proinspect-v3-staging.delicate-dream-e4c9.workers.dev';
const pr01Preview=isApprovedStagingPreview(process.env);
if(process.env.GITHUB_REF!=='refs/heads/version-3-enhancements'&&!pr01Preview)
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
  await page.locator('nav[aria-label="Primary navigation"] a[href="/residential"]').click();
  await page.waitForURL('**/residential',{timeout:12000});
  assert.equal(new URL(page.url()).pathname,'/residential');
  await expect(page.getByRole('heading',{level:1})).toHaveText(/^(Residential|More clarity\. Less chasing\. A better cared-for property\.|Practical support for every stage of your rental property\.)$/);
  await expect(page.locator('main a[href="/client"]').first()).toBeVisible();
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
  await menu.locator('a[href="/residential"]').first().click();
  await page.waitForURL('**/residential',{timeout:12000});
  await expect(page.getByRole('heading',{level:1})).toHaveText(/^(Residential|More clarity\. Less chasing\. A better cared-for property\.|Practical support for every stage of your rental property\.)$/);
  await expect(menu).not.toHaveAttribute('open','');
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
 await check('sign-in and role-aware sign-up retain service and invitation context without sending mail',async()=>{
  const token='a'.repeat(64);
  const destination='/invitations/accept?token='+token;
  const response=await page.goto(ORIGIN+'/signin?returnTo='+encodeURIComponent(destination),{waitUntil:'networkidle',timeout:25000});
  assert.equal(response.status(),200);
  assert.match(response.headers()['x-robots-tag']??'',/noindex/i);
  await expect(page.getByRole('heading',{name:'Welcome back to ProInspect.'})).toBeVisible();
  await page.getByRole('link',{name:'Create a free account'}).click();
  await expect(page.getByRole('heading',{name:'Create your free account',exact:true})).toBeVisible();
  await expect(page.locator('input[name="returnTo"]')).toHaveValue(destination);
  await expect(page.getByRole('group',{name:'What brings you to ProInspect?'})).toHaveCount(0);
  await page.goto(ORIGIN+'/signup?service=routine-inspection',{waitUntil:'networkidle',timeout:25000});
  const choices=page.getByRole('group',{name:'What brings you to ProInspect?'});
  await expect(choices).toBeVisible();
  assert.equal(await choices.getByRole('radio').count(),4);
  await choices.getByRole('radio',{name:/I own a residential property/}).check();
  await expect(page.locator('input[name="returnTo"]')).toHaveValue('/start?service=routine-inspection');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+2));
  await page.screenshot({path:'artifacts/v3-hosted-signup-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:900});
  await page.screenshot({path:'artifacts/v3-hosted-signup-desktop.png',fullPage:true});
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
