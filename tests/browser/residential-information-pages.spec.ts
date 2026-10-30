import {test,expect} from '@playwright/test';
import {readFileSync,mkdirSync} from 'node:fs';

const origin='https://residential-campaign.local';
const routes=['/','/inclusions','/getting-started','/savings','/sign-up','/areas-and-eligibility','/pricing-and-billing','/subscription-terms','/sample-reports','/faq','/contact','/resources'];
const names=['index','inclusions','getting-started','savings','sign-up','areas-and-eligibility','pricing-and-billing','subscription-terms','sample-reports','faq','contact','resources'];
const files=Object.fromEntries(routes.map((route,i)=>[route,'apps/residential-campaign/pages/'+names[i]+'.html']));
test.beforeEach(async({page})=>{
 await page.route(origin+'/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname.replace(/\/$/,'')||'/';
  if(path==='/assets/site.css'){
   await route.fulfill({status:200,contentType:'text/css; charset=utf-8',body:readFileSync('apps/residential-campaign/assets/site.css','utf8')});return;
  }
  if(path==='/assets/site.js'){
   await route.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body:readFileSync('apps/residential-campaign/assets/site.js','utf8')});return;
  }
  if(path==='/assets/savings-calculator.js' || path==='/assets/savings-model.mjs'){
   await route.fulfill({status:200,contentType:'text/javascript; charset=utf-8',body:readFileSync('apps/residential-campaign'+path,'utf8')});return;
  }
  if(!files[path]){await route.fulfill({status:404,body:'Not found'});return;}
  await route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:readFileSync(files[path],'utf8'),
   headers:{'content-security-policy':"default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"}});
 });
});

test('all twelve routes render without the price strip or account links in desktop header',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const route of routes){
  await page.goto(origin+route);
  await expect(page.locator('main#main')).toBeVisible();
  await expect(page.locator('main h1')).toHaveCount(1);
  await expect(page.locator('header .brand')).toBeVisible();
  await expect(page.locator('header a[href="/sign-up"]')).toHaveCount(0);
  await expect(page.locator('header a[href*="/signin"]')).toHaveCount(0);
  await expect(page.locator('.notice-strip')).toHaveCount(0);
  await expect(page.locator('.site-footer a[href="/sign-up"]')).toHaveCount(1);
  await expect(page.locator('.site-footer a[href="/resources"]')).toHaveCount(1);
 }
 expect(errors).toEqual([]);
});

test('More navigation reveals seven routes, supports keyboard close and internal links',async({page})=>{
 await page.goto(origin+'/');
 await expect(page.locator('#nav-more')).toBeVisible();
 await page.locator('#nav-more summary').click();
 await expect(page.locator('#nav-more')).toHaveAttribute('open','');
 await expect(page.locator('#nav-more-panel-does-not-exist')).toHaveCount(0);
 await expect(page.locator('#nav-more .nav-more-panel a')).toHaveCount(7);
 await page.keyboard.press('Escape');
 await expect(page.locator('#nav-more')).not.toHaveAttribute('open','');
 await page.locator('#nav-more summary').click();
 await page.locator('#nav-more .nav-more-panel a[href="/pricing-and-billing"]').click();
 await expect(page).toHaveURL(origin+'/pricing-and-billing');
 await expect(page.getByRole('heading',{level:1})).toContainText('One weekly price.');
 await expect(page.locator('.info-price-feature')).toContainText('$55');
});

test('information routes show honest pending items rather than fake content',async({page})=>{
 await page.goto(origin+'/subscription-terms');
 await expect(page.locator('.info-note')).toContainText('not a signed or approved agreement');
 await page.goto(origin+'/sample-reports');
 await expect(page.locator('.info-report-card')).toHaveCount(2);
 await expect(page.locator('.info-report-card')).toContainText(['Entry Property Condition Report','Routine Inspection Report'].join(''));
 await expect(page.locator('a[download]')).toHaveCount(0);
 await page.goto(origin+'/contact');
 await expect(page.locator('form')).toHaveCount(0);
 await expect(page.locator('a[href="https://proinspect.systems/contact"]').not.toHaveCount(0);
 await page.goto(origin+'/faq');
 await page.locator('#faq-billing details').first().locator('summary').click();
 await expect(page.locator('#faq-billing details').first()).toHaveAttribute('open','');
});

test('mobile navigation contains new pages and narrow screens have no horizontal overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(origin+'/areas-and-eligibility');
 await page.locator('#mobile-menu summary').click();
 await expect(page.locator('#mobile-menu nav a[href="/subscription-terms"]')).toBeVisible();
 await expect(page.locator('#mobile-menu nav a[href="/sign-up"]')).toHaveCount(0);
 await page.locator('#mobile-menu nav a[href="/resources"]').click();
 await expect(page).toHaveURL(origin+'/resources');
 await expect(page.locator('#mobile-menu')).not.toHaveAttribute('open','');
 for(const width of [390,320]){
  await page.setViewportSize({width,height:760});
  for(const route of ['/areas-and-eligibility','/pricing-and-billing','/subscription-terms','/sample-reports','/faq','/contact','/resources']){
   await page.goto(origin+route);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
   expect(overflow,route+' width '+width).toBeLessThanOrEqual(1);
  }
 }
 mkdirSync('artifacts',{recursive:true});
 await page.setViewportSize({width:390,height:844});
 await page.goto(origin+'/sample-reports');
 await page.screenshot({path:'artifacts/residential-sample-reports-mobile.png',fullPage:true});
});
