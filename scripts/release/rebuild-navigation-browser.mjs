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
const evidence={source:process.env.GITHUB_SHA,desktop:[],mobile:[],pages:[],footer:[],home:[]};
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
  await expect(footer.locator('.mkt-footer-intro p')).toHaveText('Providing innovative property solutions and practical support across residential and commercial properties, shared spaces and building projects in Western Australia.');
  const boxes=await links.evaluateAll(items=>items.map(x=>{const r=x.getBoundingClientRect();return {left:r.left,right:r.right};}));
  assert.ok(boxes.every(r=>r.left>=-1&&r.right<=width+1),'Footer overflows at '+width);
  await footer.screenshot({path:out+'/footer-'+width+'.png'});
  evidence.footer.push(width);
}
const plans=['Inspections Subscription','Outsourced Subscription','Co-Living Subscription','Co-Working Subscription','Commercial Property Support Subscription'];
const finalHomeCopy={
  "hero": "From residential and commercial properties to shared spaces and building projects, ProInspect helps unlock the potential of your property through innovative solutions, practical expertise and support designed around your needs.",
  "coLiving": "Let us help you discover a more connected approach to shared living, with property setup, resident support and ongoing care.",
  "commercial": "Take the stress out of managing your commercial properties with regular inspections, tenant engagement and responsive support when you need it most.",
  "coWorking": "Transform your commercial property into a co-working space with flexible, tailored workspaces, shared environments and fully managed solutions.",
  "construction": "Take the stress out of your construction project and keep it on track with our dedicated construction project management services.",
  "leasing": "Find your next place with ProInspect. Browse our available homes, discover upcoming open homes and follow the advertised online application process where available."
};
async function imageLoaded(img) {
  await img.scrollIntoViewIfNeeded();
  await expect.poll(()=>img.evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true);
  await img.evaluate(el=>el.decode());
}
async function verifyHome(page,width) {
  const home=page.locator('.pi-home-rebuild');
  await expect(home.locator(':scope > header, :scope > section')).toHaveCount(9);
  await expect(home.locator('.pi-home-service-card')).toHaveCount(7);
  const hero=home.locator('.pi-editorial-hero-home');
  await expect(hero.locator('.eyebrow')).toHaveText('ProInspect Property Services');
  await expect(hero.locator('.pi-editorial-intro')).toHaveText(finalHomeCopy.hero);
  await expect(hero.getByRole('link',{name:'Learn More About ProInspect'})).toHaveAttribute('href','/about');
  await expect(hero.getByRole('link',{name:'Get Started Today'})).toHaveAttribute('href','/client');
  for(const [title,copy] of [['Co-Living Spaces',finalHomeCopy.coLiving],['Commercial Solutions',finalHomeCopy.commercial],['Co-Working Spaces',finalHomeCopy.coWorking],['Construction Project Management',finalHomeCopy.construction]]) {
    await expect(home.locator('.pi-home-service-card').filter({has:page.getByRole('heading',{name:title,exact:true})}).locator('p')).toHaveText(copy);
  }
  await expect(home.locator('#home-leasing .pi-residential-feature-content > p:not(.eyebrow)')).toHaveText(finalHomeCopy.leasing);
  await expect(home.locator('#proinspect-approach .pi-home-connections')).toHaveCount(0);
  await expect(home.locator('#proinspect-approach .pi-residential-feature-content > p:not(.eyebrow)')).toHaveCount(3);
  await expect(home.locator('#home-subscriptions .pi-rebuild-subscription-card')).toHaveCount(0);
  await expect(home.getByRole('link',{name:'Explore Our Subscriptions'})).toHaveAttribute('href','/subscriptions');
  await expect(home.getByText('Have something specific in mind?',{exact:false})).toHaveCount(0);
  await expect(home.getByRole('heading',{name:'Maintenance Support',exact:true})).toHaveCount(0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Home horizontal overflow at '+width);
  for(const id of ['property-services','commercial-property-services','property-projects']){
    const section=home.locator('#'+id);
    await section.scrollIntoViewIfNeeded();
    const geometry=await section.evaluate(el=>{
      const intro=el.querySelector('.pi-home-stacked-heading > p:not(.eyebrow)');
      const grid=el.querySelector('.pi-home-services-grid');
      return {introWidth:intro.getBoundingClientRect().width,gridWidth:grid.getBoundingClientRect().width};
    });
    assert.ok(Math.abs(geometry.introWidth-geometry.gridWidth)<=3,'Introduction not full width '+id+' at '+width);
    const boxes=await section.locator('.pi-home-service-card').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
    assert.ok(boxes.every(b=>b.x>=-1&&b.x+b.w<=width+1&&b.w>0&&b.h>0),'Tile overflow '+id+' at '+width);
    const cols=width<=760?1:width<=1000?2:id==='property-projects'?3:2;
    assert.equal(boxes.filter(b=>Math.abs(b.y-boxes[0].y)<3).length,cols,'Incorrect columns '+id+' at '+width);
    for(const img of await section.locator('img').all())await imageLoaded(img);
  }
  for(const [id,asset] of [['proinspect-approach','innovation'],['home-subscriptions','subscription-care']]){
    const section=home.locator('#'+id);
    const img=section.locator('.pi-residential-feature-image img');
    await expect(img).toHaveCount(1);
    await imageLoaded(img);
    assert.ok((await img.getAttribute('src')).includes(asset),'Incorrect feature image '+id);
    const layout=await section.locator('.pi-residential-feature').evaluate(el=>{
      const i=el.querySelector('.pi-residential-feature-image').getBoundingClientRect();
      const t=el.querySelector('.pi-residential-feature-content').getBoundingClientRect();
      return {ix:i.x,iy:i.y,ir:i.right,ib:i.bottom,tx:t.x,ty:t.y,tr:t.right,tb:t.bottom};
    });
    assert.ok(layout.ix>=-1&&layout.ir<=width+1&&layout.tx>=-1&&layout.tr<=width+1,'Feature overflow '+id+' at '+width);
    assert.ok(width<=800?layout.ib<=layout.ty+1:(layout.ir<=layout.tx+1||layout.tr<=layout.ix+1),'Feature layout overlaps '+id+' at '+width);
  }
  // Decode the hero too, and return to the top before full-page capture.
  // Scrolling lazy images into view alone does not prove their pixels were painted.
  for(const img of await home.locator('img').all())await imageLoaded(img);
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  if([1440,390].includes(width))await page.screenshot({path:out+'/home-'+width+'.png',fullPage:true});
  await expect(home.locator('.pi-home-service-card a')).toHaveCount(7);
  const commitment=home.locator('#customer-commitment');
  assert.ok(await commitment.evaluate(el=>Math.abs(el.querySelector('.pi-home-stacked-heading > p:not(.eyebrow)').getBoundingClientRect().width-el.querySelector('.pi-home-principles').getBoundingClientRect().width)<=3),'Commitment copy width');
  await page.evaluate(()=>window.scrollTo({top:Math.min(1200,document.documentElement.scrollHeight-innerHeight),behavior:'instant'}));
  await expect.poll(()=>page.locator('.mkt-header-wrap').evaluate(el=>Math.round(el.getBoundingClientRect().top))).toBe(0);
  evidence.home.push(width);
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
    await verifyHome(page,width);
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
    await verifyHome(page,width);
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
    assert.deepEqual(await nav.getByRole('link').allTextContents(),expected.map(x=>x[0]));
    await expect(header.getByRole('link',{name:'Sign Up / Sign In',exact:true})).toHaveCount(1);
    await expect(nav.getByRole('link',{name:'Sign Up / Sign In'})).toHaveCount(0);
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
  await page.goto(origin);
  await page.locator('#commercial-property-services .pi-inline-link').filter({hasText:'Explore Our Co-Working Solutions'}).click();
  await expect(page).toHaveURL(origin+'/co-spaces/co-working');
  await expect(page.locator('main h1')).toHaveText('Co-Working');
  await page.locator('.marketing-menu summary').click();
  await expect(page.getByRole('navigation',{name:'Mobile site navigation'}).getByRole('link',{name:'Co-Spaces',exact:true})).toHaveAttribute('aria-current','location');
  await page.keyboard.press('Escape');
  await expect(page.locator('main section')).toHaveCount(0);
  await expect.poll(()=>page.locator('main img').evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true);
  await page.goto(origin);
  await page.getByRole('link',{name:'Learn More About ProInspect'}).click();
  await expect(page).toHaveURL(origin+'/about');
  assert.equal((await page.request.get(origin+'/about')).status(),200);
  await page.goto(origin);
  await page.getByRole('link',{name:'Explore Our Subscriptions'}).click();
  await expect(page).toHaveURL(origin+'/subscriptions');
  await expect(page.locator('.pi-rebuild-subscription-card h3')).toHaveText(plans);
  for (const width of [1440,768,390,320]) {
    await page.setViewportSize({width,height:900});
    const cards=await page.locator('.pi-rebuild-subscription-card').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width};}));
    assert.ok(cards.every(b=>b.x>=-1&&b.x+b.w<=width+1),'Subscription landing overflow at '+width);
    assert.equal(cards.filter(b=>Math.abs(b.y-cards[0].y)<3).length,width<=760?1:width<=1000?2:3,'Subscription landing columns at '+width);
  }
  console.log(JSON.stringify(evidence));
} finally {
  writeFileSync(out+'/verification.json',JSON.stringify(evidence,null,2)+'\n');
  await browser.close();
}
