import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

const origin='https://proinspect-rebuild.delicate-dream-e4c9.workers.dev';
assert.equal(process.env.GITHUB_REPOSITORY,'info-rbp/proinspect');
assert.equal(process.env.GITHUB_REF,'refs/heads/proinspect-rebuild');
const mode=process.argv[2];
assert.ok(['baseline','final'].includes(mode));
const out='artifacts/rebuild-navigation';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
const report={mode,source:null,runs:[],accessibility:[],keyboard:[],errors:[]};
const round=n=>Math.round(n*100)/100;
const profiles=[
  {name:'desktop',viewport:{width:1440,height:950},deviceScaleFactor:1,isMobile:false,hasTouch:false},
  {name:'mobile',viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true},
];
async function measure(profile){
  const {name,...options}=profile;
  const context=await browser.newContext(options);
  const page=await context.newPage();
  const cdp=await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  // Repeatable laboratory profile, not production field data.
  if(name==='mobile'){
    await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750});
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  }
  const pageErrors=[],badImages=[];
  page.on('pageerror',e=>pageErrors.push(String(e)));
  page.on('requestfailed',r=>{if(r.resourceType()==='image')badImages.push({url:r.url(),reason:r.failure()?.errorText})});
  page.on('response',r=>{if(r.request().resourceType()==='image'&&r.status()>=400)badImages.push({url:r.url(),status:r.status()})});
  await page.addInitScript(()=>{
    window.__homeAudit={lcp:0,cls:0,windowStart:0,lastShift:0,windowValue:0};
    try{new PerformanceObserver(list=>{for(const e of list.getEntries())window.__homeAudit.lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true})}catch{}
    try{new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput){
      const a=window.__homeAudit;
      if(!a.windowStart||e.startTime-a.lastShift>1000||e.startTime-a.windowStart>5000){a.windowStart=e.startTime;a.windowValue=0}
      a.lastShift=e.startTime;a.windowValue+=e.value;a.cls=Math.max(a.cls,a.windowValue);
    }}).observe({type:'layout-shift',buffered:true})}catch{}
  });
  try{
    const response=await page.goto(origin+'/',{waitUntil:'load',timeout:60000});
    assert.equal(response.status(),200);
    const hero=page.locator('.pi-editorial-hero-home img');
    await hero.evaluate(async img=>{await img.decode()});
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForTimeout(1200);
    const first=await page.evaluate(()=>{
      const n=performance.getEntriesByType('navigation')[0];
      const p=performance.getEntriesByType('paint').find(e=>e.name==='first-contentful-paint');
      const r=performance.getEntriesByType('resource');
      return {ttfb:n.responseStart,fcp:p?.startTime??null,lcp:window.__homeAudit.lcp,cls:window.__homeAudit.cls,
        transferBytes:n.transferSize+r.reduce((a,b)=>a+b.transferSize,0),resources:r.length,
        imageBytes:r.filter(x=>x.initiatorType==='img').reduce((a,b)=>a+b.transferSize,0),
        resourceDetails:r.map(x=>({url:new URL(x.name).pathname,type:x.initiatorType,transferBytes:x.transferSize,duration:x.duration}))};
    });
    await page.screenshot({path:out+'/'+mode+'-'+name+'-initial.png'});
    const images=[];
    for(const img of await page.locator('main img').all()){
      await img.scrollIntoViewIfNeeded({timeout:15000});
      try{
        await img.evaluate(async el=>{await el.decode();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
        images.push(await img.evaluate(el=>({alt:el.alt,url:new URL(el.currentSrc).pathname,width:el.naturalWidth,height:el.naturalHeight,displayWidth:Math.round(el.getBoundingClientRect().width),loaded:el.complete&&el.naturalWidth>0})));
      }catch(e){images.push({loaded:false,error:String(e)})}
    }
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    await page.screenshot({path:out+'/'+mode+'-'+name+'-full.png',fullPage:true});
    const full=await page.evaluate(()=>{
      const r=performance.getEntriesByType('resource');
      return {height:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth>innerWidth+2,cls:window.__homeAudit.cls,
        imageBytes:r.filter(x=>x.initiatorType==='img').reduce((a,b)=>a+b.transferSize,0),
        resourceBytes:r.reduce((a,b)=>a+b.transferSize,0)};
    });
    const row={profile:name,first:{...first,ttfb:round(first.ttfb),fcp:first.fcp===null?null:round(first.fcp),lcp:round(first.lcp),cls:round(first.cls)},full:{...full,cls:round(full.cls)},images,pageErrors,badImages};
    report.runs.push(row);
    if(mode==='final'){
      assert.equal(images.length,11,'Expected 11 home image instances');
      assert.ok(images.every(x=>x.loaded&&x.width>0&&x.height>0),'Image decoding failed');
      assert.equal(badImages.length,0,'Image request failed');
      assert.equal(pageErrors.length,0,'Runtime error');
      assert.equal(full.overflow,false,'Horizontal page overflow');
      assert.ok(first.lcp>0,'Missing LCP measurement');
    }
  }finally{await context.close()}
}
async function auditAccessibility(profile){
  const {name,...options}=profile;
  const context=await browser.newContext({...options,bypassCSP:true});
  const page=await context.newPage();
  try{
    await page.goto(origin+'/',{waitUntil:'networkidle'});
    await page.evaluate(readFileSync(process.env.AXE_SCRIPT,'utf8'));
    const axe=async state=>{
      const result=await page.evaluate(async()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}));
      const violations=result.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,helpUrl:v.helpUrl,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));
      report.accessibility.push({profile:name,state,violations,passed:result.passes.length,incomplete:result.incomplete.map(v=>({id:v.id,nodes:v.nodes.length}))});
    };
    await axe('default');
    if(mode==='final'){
      await page.keyboard.press('Tab');
      await expect(page.locator('.skip-link')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('#main')).toBeFocused();
      const header=page.locator('.mkt-header-wrap');
      await expect.poll(()=>page.locator('#main').evaluate(el=>el.getBoundingClientRect().top>=document.querySelector('.mkt-header-wrap').getBoundingClientRect().bottom-2)).toBe(true);
      await page.evaluate(()=>window.scrollTo({top:1300,behavior:'instant'}));
      await expect.poll(()=>header.evaluate(el=>Math.round(el.getBoundingClientRect().top))).toBe(0);
      await expect(header.getByRole('link',{name:'Sign Up / Sign In'})).toBeVisible();
      if(name==='mobile'){
        const menu=header.locator('summary');
        await menu.focus();
        await page.keyboard.press('Enter');
        const nav=header.getByRole('navigation',{name:'Mobile site navigation'});
        await expect(nav).toBeVisible();
        await axe('mobile-menu-open');
        await page.keyboard.press('Tab');
        await expect(nav.getByRole('link').first()).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(menu).toBeFocused();
        await expect(nav).not.toBeVisible();
      }
      const action=page.locator('.pi-home-card-action').first();
      await action.focus();
      await action.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
      await expect(action).toBeFocused();
      const focus=await action.evaluate(el=>{
        const a=el.getBoundingClientRect(),h=document.querySelector('.mkt-header-wrap').getBoundingClientRect();
        const s=getComputedStyle(el.closest('article'));return {visible:a.top>=h.bottom-2&&a.bottom<=innerHeight+2,outline:s.outlineStyle};
      });
      assert.ok(focus.visible&&focus.outline!=='none','Service card focus is obscured or missing');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(origin+'/residential');
      report.keyboard.push({profile:name,skipLink:true,stickyHeader:true,menuKeyboard:name==='mobile'?'passed':'not applicable',cardKeyboard:true});
    }
  }finally{await context.close()}
}
try {
  const res=await fetch(origin+'/api/health');
  assert.ok(res.ok);
  report.source=(await res.json()).source;
  if(mode==='final')assert.equal(report.source,process.env.GITHUB_SHA);
  for(const profile of profiles){try{await measure(profile)}catch(e){report.errors.push({profile:profile.name,check:'performance/images',message:String(e)})}}
  if(process.env.AXE_SCRIPT){
    for(const profile of profiles){try{await auditAccessibility(profile)}catch(e){report.errors.push({profile:profile.name,check:'accessibility/keyboard',message:String(e)})}}
  }else report.errors.push({check:'accessibility',message:'axe-core was not provided'});
} finally {
  writeFileSync(out+'/home-audit-'+mode+'.json',JSON.stringify(report,null,2)+'\n');
  const summary={mode,source:report.source,runs:report.runs.map(({profile,first,full,images,pageErrors,badImages})=>({profile,ttfb:first.ttfb,fcp:first.fcp,lcp:first.lcp,cls:full.cls,initialBytes:first.transferBytes,initialImageBytes:first.imageBytes,fullImageBytes:full.imageBytes,height:full.height,images:images.length,loaded:images.filter(x=>x.loaded).length,pageErrors:pageErrors.length,badImages:badImages.length})),accessibility:report.accessibility.map(x=>({profile:x.profile,state:x.state,passed:x.passed,violations:x.violations,incomplete:x.incomplete})),keyboard:report.keyboard,errors:report.errors};
  console.log('HOME_AUDIT '+JSON.stringify(summary));
  await browser.close();
}
if(mode==='final'){
  assert.equal(report.runs.length,2,'Missing browser performance result');
  assert.equal(report.keyboard.length,2,'Missing keyboard result');
  assert.equal(report.accessibility.length,3,'Missing axe audit result');
  assert.equal(report.errors.length,0,JSON.stringify(report.errors));
  assert.equal(report.accessibility.flatMap(x=>x.violations).length,0,'WCAG automated violations remain; inspect artifact');
}
