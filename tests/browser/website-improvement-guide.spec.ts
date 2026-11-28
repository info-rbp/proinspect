import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';

const pages=[
  {path:'/',name:'home'},
  {path:'/about',name:'about'},
  {path:'/co-living',name:'co-living'},
  {path:'/contact',name:'contact'},
] as const;

test('Website Improvement Guide: About Us content, actions, positioning and retained brand imagery',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/about');
  const hero=page.locator('.pi-about-hero');
  await expect(hero.getByRole('heading',{level:1})).toHaveText('Property Support. Designed Around You.');
  await expect(hero.getByRole('link',{name:/See Our Residential Services/})).toHaveAttribute('href','/residential/services');
  await expect(hero.getByRole('link',{name:/Get Started Today/})).toHaveAttribute('href','/client');
  const gap=await hero.locator('.actions').evaluate(node=>parseFloat(getComputedStyle(node).columnGap));
  expect(gap).toBeGreaterThanOrEqual(15);
  const purpose=page.locator('.pi-about-purpose');
  await expect(purpose.getByRole('heading',{name:'Less time chasing tasks. More clarity over your property.'})).toBeVisible();
  const photo=purpose.locator('img');
  await expect(photo).toHaveAttribute('alt',/.+/);
  await photo.scrollIntoViewIfNeeded();
  await expect.poll(()=>photo.evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const imgBox=await photo.boundingBox();
  const headingBox=await purpose.getByRole('heading',{level:2}).boundingBox();
  expect(imgBox && headingBox && imgBox.x<imgBox.x+imgBox.width && imgBox.x+imgBox.width<=headingBox.x+60).toBeTruthy();
  await expect(purpose).toContainText('Owning a rental property involves much more than inspections');
  await expect(purpose).toContainText('private landlords and property managers');
  const nav=page.getByRole('navigation',{name:'Primary navigation'});
  await expect(nav.getByRole('link',{name:'Who We Help'})).toHaveCount(0);
  await expect(page.locator('#who-we-help')).toBeVisible();
  await expect(page.locator('.pi-footer-legal a')).toHaveCount(0);
});

test('Website Improvement Guide: responsive desktop and mobile visual review evidence',async({page})=>{
  mkdirSync('artifacts',{recursive:true});
  for(const width of [390,1440]){
    await page.setViewportSize({width,height:900});
    for(const entry of pages){
      const response=await page.goto(entry.path);
      expect(response?.status(),entry.path).toBe(200);
      await expect(page.locator('main h1').first()).toBeVisible();
      await page.evaluate(async()=>{await document.fonts.ready;});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),entry.path+' at '+width).toBe(true);
      await page.screenshot({path:'artifacts/guide-'+entry.name+'-'+width+'.png',fullPage:true,animations:'disabled'});
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto('/about');
  await expect(page.locator('.marketing-menu summary')).toBeVisible();
  await page.locator('.marketing-menu summary').click();
  await expect(page.getByRole('navigation',{name:'Mobile site navigation'}).getByRole('link',{name:'Who We Help'})).toHaveCount(0);
  await expect(page.getByRole('navigation',{name:'Mobile site navigation'}).getByRole('link',{name:'Information'})).toBeVisible();
});
