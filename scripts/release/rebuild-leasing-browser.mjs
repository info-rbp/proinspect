import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { build } from 'esbuild';

const origin='https://proinspect-rebuild.delicate-dream-e4c9.workers.dev';
assert.equal(process.env.GITHUB_REPOSITORY,'info-rbp/proinspect');
assert.equal(process.env.GITHUB_REF,'refs/heads/proinspect-rebuild');
const mode=process.argv[2]||'final';
const out='artifacts/rebuild-navigation';
mkdirSync(out,{recursive:true});
const types=[['','All types'],['residential','Residential'],['commercial','Commercial'],['co-living','Co-Living'],['co-working','Co-Working'],['other','Other']];
const sample='/properties-for-lease/residential/residential-browser-test';
const browser=await chromium.launch();
const report={mode,source:null,filters:[],screens:[],accessibility:[],performance:[],gallery:[],errors:[]};
const axeScript=process.env.AXE_SCRIPT?readFileSync(process.env.AXE_SCRIPT,'utf8'):null;
async function axe(page,label,width,strict=true){
 assert.ok(axeScript,'axe-core missing');
 await page.evaluate(axeScript);
 const result=await page.evaluate(async()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}));
 const row={label,width,passed:result.passes.length,violations:result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:result.incomplete.map(v=>({id:v.id,nodes:v.nodes.length}))};
 report.accessibility.push(row);
 if(strict)assert.equal(row.violations.length,0,JSON.stringify(row));
}
async function noOverflow(page,label){
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),label+' horizontal overflow');
}
async function screenshot(page,name){
 for(const img of await page.locator('main img:visible').all()){
   await img.scrollIntoViewIfNeeded();
   await expect.poll(()=>img.evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true);
   await img.evaluate(el=>el.decode());
 }
 await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 await page.screenshot({path:out+'/'+name+'.png',fullPage:true});
}
async function verifyFilters(page,width){
 await page.goto(origin+'/leasing',{waitUntil:'networkidle'});
 const form=page.getByRole('form',{name:'Search properties for lease'});
 const select=form.getByLabel('Property type'),q=form.getByLabel('Search property location');
 assert.deepEqual(await select.locator('option').evaluateAll(els=>els.map(el=>[el.value,el.textContent.trim()])),types);
 const live=page.locator('.pi-listing-card:not(.pi-leasing-demo-card)'),demo=page.locator('.pi-leasing-demo-card');
 const liveCount=await live.count(),demoCount=await demo.count();
 await expect(page.locator('.pi-results-count')).toContainText(liveCount+' '+(liveCount===1?'property':'properties')+' available');
 for(const [value,label] of types.slice(1)){
   await select.selectOption(value);
   await form.getByRole('button',{name:'Search properties'}).click();
   await expect.poll(()=>new URL(page.url()).searchParams.get('type')).toBe(value);
   await expect(select).toHaveValue(value);
   await expect(live).toHaveCount(value==='residential'?liveCount:0);
   await expect(demo).toHaveCount(value==='residential'?demoCount:0);
   if(!await live.count()){
     await expect(page.getByRole('heading',{name:'No properties currently match.'})).toBeVisible();
     await expect(page.locator('.pi-leasing-empty')).toContainText(label);
   }
   await expect(form.getByRole('link',{name:'Clear filters'})).toBeVisible();
   report.filters.push({width,value,live:await live.count(),demo:await demo.count()});
 }
 await form.getByRole('link',{name:'Clear filters'}).click();
 await expect(select).toHaveValue('');
 await expect(q).toHaveValue('');
 await expect(live).toHaveCount(liveCount);
 await expect(demo).toHaveCount(demoCount);
 await select.selectOption('residential');
 await q.fill('no-match-synthetic-location');
 await form.getByRole('button',{name:'Search properties'}).click();
 await expect.poll(()=>new URL(page.url()).searchParams.get('q')).toBe('no-match-synthetic-location');
 await expect(live).toHaveCount(0);await expect(demo).toHaveCount(0);
 await form.getByRole('link',{name:'Clear filters'}).click();
 await expect(q).toHaveValue('');await expect(select).toHaveValue('');
 await expect(page.locator('.pi-listing-card a')).toHaveCount(liveCount+demoCount);
 await noOverflow(page,'Leasing directory '+width);
 await axe(page,'directory',width);
 await screenshot(page,'leasing-final-'+width);
 report.screens.push({width,live:liveCount,demo:demoCount});
 if(demoCount){
   await select.selectOption('residential');await q.fill('Perth');
   await form.getByRole('button',{name:'Search properties'}).click();
   await expect(demo.first()).toBeVisible();
   const link=demo.first().getByRole('link');
   await expect(link).toHaveAttribute('href',/type=residential.*q=Perth/);
   await expect(demo.first().locator('img')).toHaveCount(0);
   await expect(demo.first()).toContainText('Not available to rent');
   await link.focus();await expect(link).toBeFocused();await page.keyboard.press('Enter');
   await expect.poll(()=>new URL(page.url()).pathname).toBe(sample);
   await expect(page.locator('main h1')).toBeVisible();
   await expect(page.locator('.pi-leasing-demo-label')).toContainText('Not available to rent');
   await expect(page.locator('main form')).toHaveCount(0);
   await expect(page.locator('a[href="#leasing-gallery"]')).toHaveCount(0);
   await expect(page.locator('.pi-leasing-gallery-empty')).toContainText('Property photos not yet available');
   await expect(page.locator('main')).toContainText('does not accept applications, enquiries or inspection registrations');
   await noOverflow(page,'Property detail '+width);
   await axe(page,'demo property',width);
   await screenshot(page,'leasing-property-final-'+width);
   await page.getByRole('link',{name:'Back to search results'}).click();
   await expect(select).toHaveValue('residential');await expect(q).toHaveValue('Perth');
   await expect.poll(()=>new URL(page.url()).hash).toBe('#available-properties');
 }else {
   // Absence of the seeded example is not a reason to create or publish a new property.
   report.screens.push({width,propertyReview:'No demonstration listing available'});
 }
}
async function performance(profile,path){
 const mobile=profile==='mobile';
 const ctx=await browser.newContext({viewport:{width:mobile?390:1440,height:900},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile,bypassCSP:true});
 const page=await ctx.newPage();
 const cdp=await ctx.newCDPSession(page);
 await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 if(mobile){await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750});await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});}
 const failures=[],errors=[];
 page.on('response',r=>{if(r.request().resourceType()==='image'&&r.status()>=400)failures.push({url:new URL(r.url()).pathname,status:r.status()});});
 page.on('requestfailed',r=>{if(r.resourceType()==='image')failures.push({url:new URL(r.url()).pathname,error:r.failure()?.errorText});});
 page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{
   window.__leaseAudit={lcp:0,cls:0,first:0,last:0,value:0};
   try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__leaseAudit.lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true})}catch{}
   try{new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput){const a=window.__leaseAudit;if(!a.first||e.startTime-a.last>1000||e.startTime-a.first>5000){a.first=e.startTime;a.value=0}a.last=e.startTime;a.value+=e.value;a.cls=Math.max(a.cls,a.value)}}).observe({type:'layout-shift',buffered:true})}catch{}
 });
 try{
  const res=await page.goto(origin+path,{waitUntil:'load',timeout:60000});
  if(!res?.ok()){report.performance.push({profile,path,status:res?.status()});return;}
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1300);
  const metrics=await page.evaluate(()=>{
    const n=performance.getEntriesByType('navigation')[0],r=performance.getEntriesByType('resource');
    return {ttfb:Math.round(n.responseStart),fcp:Math.round(performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint')?.startTime??0),lcp:Math.round(window.__leaseAudit.lcp),cls:Math.round(window.__leaseAudit.cls*1000)/1000,transferBytes:n.transferSize+r.reduce((a,x)=>a+x.transferSize,0),imageBytes:r.filter(x=>x.initiatorType==='img').reduce((a,x)=>a+x.transferSize,0),height:document.documentElement.scrollHeight,requests:r.length};
  });
  report.performance.push({profile,path,status:res.status(),...metrics,failures,errors});
  if(mode==='final'){
   assert.ok(metrics.lcp>0,'Missing LCP');
   assert.equal(errors.length,0,JSON.stringify(errors));
   assert.equal(failures.length,0,JSON.stringify(failures));
   await noOverflow(page,'Performance page '+path);
  }
 }finally{await ctx.close()}
}
// Test the actual gallery React component in an isolated browser fixture.
// Synthetic test SVGs are served solely by Playwright interception, never by
// the public Worker, and no listing records, uploads, or registrations are made.
async function verifyGallery(){
 const result=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {LeasingGallery} from './apps/marketing/app/components/leasing-gallery';const count=Number(new URL(location.href).searchParams.get('count')||0);createRoot(document.getElementById('root')).render(<LeasingGallery photos={Array.from({length:count},(_,i)=>({id:'fixture-'+i,alt_text:'Test photograph '+(i+1)}))}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'}});
 const script=result.outputFiles[0].text;
 const css=readFileSync('packages/ui/leasing.css','utf8');
 const ctx=await browser.newContext({bypassCSP:true});
 await ctx.route('https://leasing-fixture.invalid/**',async route=>{
   const u=new URL(route.request().url());
   if(u.pathname==='/fixture.js')return route.fulfill({status:200,contentType:'application/javascript',body:script});
   if(u.pathname==='/fixture.css')return route.fulfill({status:200,contentType:'text/css',body:css});
   if(u.pathname.startsWith('/api/public/leasing/photos/')){
     if(u.pathname.endsWith('fixture-3'))return route.fulfill({status:404,body:''});
     return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#b8cfc3"/><rect x="120" y="100" width="660" height="400" fill="#426c6c"/></svg>'});
   }
   return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html lang="en-AU"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gallery test fixture</title><link rel="stylesheet" href="/fixture.css"><style>*{box-sizing:border-box}body{margin:0;font:16px Arial,sans-serif;color:#142f38}.site-container{width:92%;max-width:1240px;margin:auto}.button{padding:10px 15px;font:inherit}.small{font-size:14px}</style></head><body class="site"><main id="root"></main><script src="/fixture.js"></script></body></html>'});
 });
 const page=await ctx.newPage();
 try{
  for(const width of [1440,768,390,320]){
   await page.setViewportSize({width,height:900});
   await page.goto('https://leasing-fixture.invalid/?count=0');
   await expect(page.locator('.pi-leasing-gallery-empty')).toContainText('Property photos not yet available');
   await expect(page.getByRole('button')).toHaveCount(0);
   for(const count of [1,2,3,4,6]){
    await page.goto('https://leasing-fixture.invalid/?count='+count);
    await expect(page.locator('.pi-leasing-gallery-thumb')).toHaveCount(Math.min(count,5));
    await noOverflow(page,'Gallery fixture '+width+' '+count);
    const trigger=page.locator('.pi-leasing-gallery-thumb').first();
    await trigger.focus();await page.keyboard.press('Enter');
    const dialog=page.getByRole('dialog',{name:'Property photographs'});
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button',{name:'Close'})).toBeFocused();
    await expect(dialog.getByRole('status')).toHaveText('Photo 1 of '+count);
    if(count>1){
      await page.keyboard.press('ArrowRight');
      await expect(dialog.getByRole('status')).toHaveText('Photo 2 of '+count);
      await page.keyboard.press('ArrowLeft');
      await expect(dialog.getByRole('status')).toHaveText('Photo 1 of '+count);
    }else await expect(dialog.getByRole('button',{name:'Next photo'})).toBeDisabled();
    if(count===6){
      await dialog.getByRole('button',{name:'Previous photo'}).click();
      await expect(dialog.getByRole('status')).toHaveText('Photo 6 of 6');
      await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowLeft');
      await expect(dialog.getByRole('status')).toHaveText('Photo 4 of 6');
      await expect(dialog.locator('.pi-leasing-photo-placeholder')).toContainText('Property photo currently unavailable');
      await axe(page,'isolated gallery dialog',width);
      await page.screenshot({path:out+'/leasing-gallery-fixture-'+width+'.png'});
    }
    await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();
    report.gallery.push({width,count,keyboard:'passed'});
   }
  }
 }finally{await ctx.close()}
}
try {
 const health=await fetch(origin+'/api/health');assert.ok(health.ok);
 report.source=(await health.json()).source;
 if(mode==='final')assert.equal(report.source,process.env.GITHUB_SHA);
 for(const profile of ['desktop','mobile'])for(const path of ['/leasing',sample])await performance(profile,path);
 if(mode==='final'){
  const context=await browser.newContext({bypassCSP:true});
  const page=await context.newPage();
  for(const width of [1440,768,390,320]){
   await page.setViewportSize({width,height:900});await verifyFilters(page,width);
  }
  const res=await page.request.get(origin+'/properties-for-lease/residential');
  assert.equal(res.status(),200);assert.ok(res.url().includes('/leasing?type=residential'));
  assert.equal((await page.request.get(origin+'/properties-for-lease/commercial')).status(),410);
  if((await page.request.get(origin+sample)).status()===200){
   assert.equal((await page.request.get(origin+'/api/public/leasing/photos/lst_pr115_demo/cover')).status(),404);
   // Safe negative test: no contact data, no token, no real registration.
   const rejected=await page.request.post(origin+sample,{headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},data:''});
   assert.equal(rejected.status(),409,'Demo must reject registration before any write');
  }
  await context.close();
  await verifyGallery();
 }
} catch(e){report.errors.push(String(e));throw e}
finally{
 writeFileSync(out+'/leasing-verification-'+mode+'.json',JSON.stringify(report,null,2)+'\n');
 console.log('LEASING_VERIFICATION '+JSON.stringify(report));
 await browser.close();
}
