import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
const origin='https://proinspect-rebuild.delicate-dream-e4c9.workers.dev';
assert.equal(process.env.GITHUB_REPOSITORY,'info-rbp/proinspect');
assert.equal(process.env.GITHUB_REF,'refs/heads/proinspect-rebuild');
const out='artifacts/rebuild-navigation';
mkdirSync(out,{recursive:true});
const types=[['','All types'],['residential','Residential'],['commercial','Commercial'],['co-living','Co-Living'],['co-working','Co-Working'],['other','Other']];
const browser=await chromium.launch();
const report={source:process.env.GITHUB_SHA,filters:[],screens:[],propertyReview:[]};
async function verifyFilter(page,width){
  await page.goto(origin+'/leasing',{waitUntil:'networkidle'});
  const form=page.getByRole('form',{name:'Search properties for lease'});
  const select=form.getByLabel('Property type');
  const q=form.getByLabel('Search property location');
  await expect(form).toBeVisible();
  const actual=await select.locator('option').evaluateAll(els=>els.map(el=>[el.value,el.textContent.trim()]));
  assert.deepEqual(actual,types);
  const cards=page.locator('.pi-listing-card');
  const all=await cards.count();
  for(const [value,label] of types.slice(1)){
    await select.selectOption(value);
    await form.getByRole('button',{name:'Search properties'}).click();
    await expect.poll(()=>new URL(page.url()).searchParams.get('type')).toBe(value);
    await expect(select).toHaveValue(value);
    const count=await cards.count();
    assert.equal(count,value==='residential'?all:0,label+' existing publication policy');
    if(!count){
      await expect(page.getByRole('heading',{name:'No properties currently match.'})).toBeVisible();
      await expect(page.locator('.pi-leasing-empty')).toContainText(label);
    }
    report.filters.push({width,value,count});
  }
  await page.getByRole('link',{name:'View all properties'}).click();
  await expect(select).toHaveValue('');
  await expect(q).toHaveValue('');
  await expect(cards).toHaveCount(all);
  await select.selectOption('residential');
  await q.fill('no-match-synthetic-location');
  await form.getByRole('button',{name:'Search properties'}).click();
  await expect.poll(()=>new URL(page.url()).searchParams.get('q')).toBe('no-match-synthetic-location');
  await expect(cards).toHaveCount(0);
  await page.getByRole('link',{name:'View all properties'}).click();
  await expect(q).toHaveValue('');
  await expect(select).toHaveValue('');
  await expect(cards).toHaveCount(all);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Leasing page horizontal overflow at '+width);
  // Record existing photo failures rather than changing listing data or submitting a form.
  const listingImages=await cards.locator('img').evaluateAll(els=>els.map(el=>({url:el.getAttribute('src'),alt:el.alt})));
  const coverResponses=[];
  for(const img of listingImages){const res=await page.request.get(origin+img.url);coverResponses.push({...img,status:res.status()});}
  await page.locator('.pi-editorial-hero img').evaluate(el=>el.decode());
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.screenshot({path:out+'/leasing-'+width+'.png',fullPage:true});
  report.screens.push({width,listingCount:all,coverResponses});
  if(all){
    const href=await cards.first().getByRole('link',{name:/View property, inspections/}).getAttribute('href');
    const response=await page.goto(origin+href,{waitUntil:'networkidle'});
    assert.equal(response.status(),200);
    await expect(page.locator('main h1')).toBeVisible();
    const review=await page.evaluate(()=>({
      title:document.querySelector('main h1')?.textContent,
      photoCount:document.querySelectorAll('.leasing-gallery img').length,
      galleryLinkVisible:!!document.querySelector('a[href="#leasing-gallery"]'),
      registrationDisabled:!!document.querySelector('#leasing-enquiry button:disabled'),
      applicationHeading:document.querySelector('#leasing-application h2')?.textContent,
      overflow:document.documentElement.scrollWidth>innerWidth+2,
      hasInspectionSessions:!!document.querySelector('.leasing-session-list li'),
    }));
    if(process.env.AXE_SCRIPT){
      // Review only: existing property page accessibility issues are recorded, not suppressed.
      await page.evaluate(readFileSync(process.env.AXE_SCRIPT,'utf8'));
      review.accessibility=await page.evaluate(async()=>{
        const result=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});
        return {violations:result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})),incomplete:result.incomplete.map(v=>({id:v.id,nodes:v.nodes.length}))};
      });
    }
    await page.screenshot({path:out+'/leasing-property-'+width+'.png',fullPage:true});
    report.propertyReview.push({width,href,...review});
  }
}
try{
  const context=await browser.newContext({bypassCSP:true});
  const page=await context.newPage();
  for(const width of [1440,768,390,320]){
    await page.setViewportSize({width,height:900});
    await verifyFilter(page,width);
  }
  const health=await page.request.get(origin+'/api/health');
  assert.equal((await health.json()).source,process.env.GITHUB_SHA);
  assert.equal((await page.request.get(origin+'/properties-for-lease/commercial')).status(),410);
  await context.close();
} finally {
  writeFileSync(out+'/leasing-verification.json',JSON.stringify(report,null,2)+'\n');
  console.log('LEASING_VERIFICATION '+JSON.stringify(report));
  await browser.close();
}
