import {test,expect} from '@playwright/test';
import {readFileSync,mkdirSync} from 'node:fs';

const origin='https://residential-campaign.local';
const assets:Record<string,[string,string]>={
 '/':['pages/index.html','text/html; charset=utf-8'],
 '/assets/site.css':['assets/site.css','text/css; charset=utf-8'],
 '/assets/site.js':['assets/site.js','text/javascript; charset=utf-8']
};
test.beforeEach(async({page})=>{
 await page.route(origin+'/**',async route=>{
  const pathname=new URL(route.request().url()).pathname;
  const asset=assets[pathname];
  if(!asset){await route.fulfill({status:404,body:'Not found'});return;}
  await route.fulfill({status:200,contentType:asset[1],
   body:readFileSync('apps/residential-campaign/'+asset[0],'utf8'),
   headers:{'content-security-policy':"default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"}});
 });
});

test('home highlights four page journeys, six service categories and clear scope',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin+'/');
 await expect(page.getByRole('heading',{level:1})).toContainText('Keep control of your rental');
 await expect(page.locator('.res-house-svg')).toBeVisible();
 await expect(page.locator('.res-path-card')).toHaveCount(4);
 await expect(page.locator('.res-service-card')).toHaveCount(6);
 await expect(page.locator('.res-stage')).toHaveCount(4);
 const paths=await page.locator('.res-path-card').evaluateAll(nodes=>nodes.map(n=>new URL((n as HTMLAnchorElement).href).pathname));
 expect(paths).toEqual(['/inclusions','/savings','/getting-started','/sign-up']);
 await expect(page.locator('.res-agency-example')).toContainText('$11,352');
 await expect(page.locator('.res-agency-example')).toContainText('$5,720');
 expect(errors).toEqual([]);
 mkdirSync('artifacts',{recursive:true});
 await page.screenshot({path:'artifacts/residential-home-desktop.png',fullPage:true});
});

test('weekly GST estimator responds to property changes',async({page})=>{
 await page.goto(origin+'/');
 await expect(page.locator('[data-weekly-ex]')).toHaveText('$50.00');
 await expect(page.locator('[data-weekly-inc]')).toHaveText('$55.00');
 await expect(page.locator('[data-annual-inc]')).toHaveText('$2,860.00');
 await page.getByRole('button',{name:'Add one property'}).click();
 await expect(page.locator('#property-count')).toHaveValue('2');
 await expect(page.locator('[data-weekly-ex]')).toHaveText('$100.00');
 await expect(page.locator('[data-weekly-inc]')).toHaveText('$110.00');
 await expect(page.locator('[data-annual-inc]')).toHaveText('$5,720.00');
 await page.getByRole('button',{name:'Remove one property'}).click();
 await expect(page.locator('[data-weekly-inc]')).toHaveText('$55.00');
 await page.locator('#property-count').fill('3');
 await expect(page.locator('[data-weekly-inc]')).toHaveText('$165.00');
});

test('mobile home graphics and navigation do not scroll horizontally',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(origin+'/');
 await expect(page.locator('.res-hero-copy')).toBeVisible();
 await expect(page.locator('.res-house-svg')).toBeVisible();
 await expect(page.locator('.res-hero-actions a[href="/inclusions"]')).toBeVisible();
 let overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
 expect(overflow).toBeLessThanOrEqual(1);
 await page.locator('#property-count').fill('2');
 await expect(page.locator('[data-weekly-inc]')).toHaveText('$110.00');
 await page.setViewportSize({width:320,height:700});
 overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
 expect(overflow).toBeLessThanOrEqual(1);
 mkdirSync('artifacts',{recursive:true});
 await page.screenshot({path:'artifacts/residential-home-mobile.png',fullPage:true});
});
