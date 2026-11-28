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
const evidence={source:process.env.GITHUB_SHA,desktop:[],mobile:[],pages:[],footer:[]};
const footerExpected=[['Help Centre','/help-centre'],['About Us','/about'],['Contact Us','/contact']];
async function verifyFooter(page,width){
  const footer=page.locator('.mkt-site-footer');
  const navigation=footer.getByRole('navigation',{name:'Footer navigation'});
  await expect(navigation).toBeVisible();
  const links=navigation.getByRole('link');
  assert.deepEqual(await links.allTextContents(),footerExpected.map(x=>x[0]));
  assert.deepEqual(await links.evaluateAll(items=>items.map(x=>x.getAttribute('href'))),footerExpected.map(x=>x[1]));
  await expect(footer.getByRole('link')).toHaveCount(4); // Brand and exactly three links.
  await expect(footer.locator('.mkt-footer-bottom')).toContainText('ABN 52 703 550 609');
  await expect(footer.locator('.mkt-footer-bottom')).toContainText('ACN 703 550 609');
  await expect(footer.locator('.mkt-footer-bottom a')).toHaveCount(0);
  await expect(footer.locator('.mkt-footer-intro p')).toHaveText('Providing Innovative Property Inspection and Outsourcing Solutions to Private Landlords and Property Managers across Western Australia.');
  const boxes=await links.evaluateAll(items=>items.map(x=>{const r=x.getBoundingClientRect();return {left:r.left,right:r.right};}));
  assert.ok(boxes.every(r=>r.left>=-1&&r.right<=width+1),'Footer overflows at '+width);
  await footer.screenshot({path:out+'/footer-'+width+'.png'});
  evidence.footer.push(width);
}
try {
  const page=await browser.newPage();
  const health=await page.request.get(origin+'/api/health');
  assert.equal((await health.json()).source,process.env.GITHUB_SHA);
  for(const width of [1920,1440,1280,1024]){
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

    const top=await header.locator('.mkt-header-identity').boundingBox();
    const lower=await header.locator('.mkt-header-navigation').boundingBox();
    assert.ok(Math.abs(brand.x-top.x)<=3 && Math.abs(button.x+button.width-(top.x+top.width))<=3,'Brand or account button shifted from outer edge at '+width);
    assert.ok(brand.x+brand.width<=button.x,'Brand and account button overlap at '+width);
    assert.ok(Math.abs(brand.y+brand.height/2-(button.y+button.height/2))<=3,'Top-row controls misaligned at '+width);
    assert.ok(lower.y>=top.y+top.height-1 && menu.y>=lower.y-1,'Navigation not on second row at '+width);
    assert.ok(Math.abs(menu.x+menu.width/2-(h.x+h.width/2))<=3,'Menu not centred at '+width);
    const links=await nav.getByRole('link').evaluateAll(items=>items.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
    assert.ok(links.every((r,i)=>r.left>=h.x-1 && r.right<=h.x+h.width+1 && Math.abs(r.top-links[0].top)<=2 && (i===0||r.left>=links[i-1].right-1)),'Navigation wraps or overlaps at '+width);
    assert.ok(Math.abs((links[0].left+links.at(-1).right)/2-(h.x+h.width/2))<=3,'Menu links not centred at '+width);
    await header.screenshot({path:out+'/header-'+width+'.png'});
    evidence.desktop.push(width);
    await verifyFooter(page,width);
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
    await verifyFooter(page,width);
    const toggle=header.locator('summary');
    await expect(toggle).toBeVisible();
    const top=await header.locator('.mkt-header-identity').boundingBox();
    const lower=await header.locator('.mkt-header-navigation').boundingBox();
    const brand=await header.getByRole('link',{name:'ProInspect home'}).boundingBox();
    const button=await header.getByRole('link',{name:'Sign Up / Sign In'}).boundingBox();
    const toggleBox=await toggle.boundingBox();
    assert.ok(brand.x+brand.width<=button.x && brand.x>=-1 && button.x+button.width<=width+1,'Mobile top row overflows at '+width);
    assert.ok(Math.abs(brand.x-top.x)<=3 && Math.abs(button.x+button.width-(top.x+top.width))<=3,'Mobile top-row positions changed at '+width);
    assert.ok(lower.y>=top.y+top.height-1 && toggleBox.y>=lower.y-1,'Mobile menu not on second row at '+width);
    assert.ok(Math.abs(toggleBox.x+toggleBox.width/2-(lower.x+lower.width/2))<=3,'Mobile menu not centred at '+width);
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
  for (const [label,path] of footerExpected) {
    await page.goto(origin);
    await page.getByRole('navigation',{name:'Footer navigation'}).getByRole('link',{name:label,exact:true}).click();
    await expect(page).toHaveURL(origin+path);
    assert.equal((await page.request.get(origin+path)).status(),200,path);
  }
  console.log(JSON.stringify(evidence));
} finally {
  writeFileSync(out+'/verification.json',JSON.stringify(evidence,null,2)+'\n');
  await browser.close();
}
