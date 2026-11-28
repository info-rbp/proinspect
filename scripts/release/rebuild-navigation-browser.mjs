import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

const origin = 'https://proinspect-rebuild.delicate-dream-e4c9.workers.dev';
assert.equal(process.env.GITHUB_REPOSITORY,'info-rbp/proinspect');
assert.equal(process.env.GITHUB_REF,'refs/heads/proinspect-rebuild');
const expected = [
 ['Residential','/residential'],['Commercial','/commercial'],['Co-Spaces','/co-spaces'],
 ['Maintenance','/maintenance'],['Modular','/modular'],['Construction','/construction'],['Tenants','/tenants'],
 ['Leasing','/leasing'],['Subscriptions','/subscriptions'],['Information','/information'],
];
const out='artifacts/rebuild-navigation';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
const evidence={source:process.env.GITHUB_SHA,desktop:[],mobile:[],pages:[]};
try {
  const page=await browser.newPage();
  const health=await page.request.get(origin+'/api/health');
  assert.equal((await health.json()).source,process.env.GITHUB_SHA);
  for(const width of [1920,1440,1280]){
    await page.setViewportSize({width,height:950});
    await page.goto(origin,{waitUntil:'networkidle'});
    const header=page.locator('.mkt-site-header');
    const nav=header.getByRole('navigation',{name:'Primary navigation'});
    await expect(nav).toBeVisible();
    assert.deepEqual(await nav.getByRole('link').allTextContents(),expected.map(x=>x[0]));
    const actual=await nav.getByRole('link').evaluateAll(links=>links.map(x=>x.getAttribute('href')));
    assert.deepEqual(actual,expected.map(x=>x[1]));
    const brand=await header.getByRole('link',{name:'ProInspect home'}).boundingBox();
    const menu=await nav.boundingBox();
    const cta=header.getByRole('link',{name:'Sign Up / Sign In'});
    await expect(cta).toHaveAttribute('href','/client');
    const button=await cta.boundingBox();
    const h=await header.boundingBox();
    assert.ok(brand.x+brand.width<=menu.x && menu.x+menu.width<=button.x,'Header overlaps at '+width);
    assert.ok(Math.abs(menu.x+menu.width/2-(h.x+h.width/2))<=3,'Menu not centred at '+width);
    await header.screenshot({path:out+'/header-'+width+'.png'});
    evidence.desktop.push(width);
  }
  for(const [label,path] of expected){
    await page.goto(origin+path,{waitUntil:'domcontentloaded'});
    await expect(page.locator('main h1').first()).toBeVisible();
    await expect(page.getByRole('navigation',{name:'Primary navigation'}).getByRole('link',{name:label,exact:true})).toHaveAttribute('aria-current','page');
    const response=await page.request.get(origin+path);
    assert.equal(response.status(),200,path);
    evidence.pages.push({label,path,status:200});
  }
  await page.getByRole('link',{name:'Sign Up / Sign In',exact:true}).first().click();
  await expect(page).toHaveURL(origin+'/client');
  for(const width of [768,390,320]){
    await page.setViewportSize({width,height:850});
    await page.goto(origin,{waitUntil:'networkidle'});
    const header=page.locator('.mkt-site-header');
    const toggle=header.locator('summary');
    await expect(toggle).toBeVisible();
    await toggle.click();
    const nav=header.getByRole('navigation',{name:'Mobile site navigation'});
    await expect(nav).toBeVisible();
    assert.deepEqual(await nav.getByRole('link').allTextContents(),[...expected.map(x=>x[0]),'Sign Up / Sign In']);
    const box=await nav.boundingBox();
    assert.ok(box.x>=-1 && box.x+box.width<=width+1,'Mobile menu overflow at '+width);
    await page.screenshot({path:out+'/mobile-'+width+'.png'});
    await nav.getByRole('link',{name:'Construction',exact:true}).click();
    await expect(page).toHaveURL(origin+'/construction');
    await expect(header.locator('details')).not.toHaveAttribute('open','');
    evidence.mobile.push(width);
  }
  console.log(JSON.stringify(evidence));
} finally {
  writeFileSync(out+'/verification.json',JSON.stringify(evidence,null,2)+'\n');
  await browser.close();
}
