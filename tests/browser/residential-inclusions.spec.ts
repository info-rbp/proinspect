import {test,expect} from '@playwright/test';
import {readFileSync,mkdirSync} from 'node:fs';

const origin='https://residential-campaign.local';
const resourceMap:Record<string,[string,string]>={
 '/inclusions':['pages/inclusions.html','text/html; charset=utf-8'],
 '/assets/site.css':['assets/site.css','text/css; charset=utf-8'],
 '/assets/site.js':['assets/site.js','text/javascript; charset=utf-8'],
};
test.beforeEach(async({page})=>{
 await page.route(origin+'/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  const asset=resourceMap[path];
  if(!asset){await route.fulfill({status:404,body:'Not found'});return;}
  await route.fulfill({status:200,body:readFileSync('apps/residential-campaign/'+asset[0],'utf8'),
   contentType:asset[1],
   headers:{'content-security-policy':"default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"}});
 });
});

test('48 services, benefits and illustrations load with no browser errors',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/inclusions');
 await expect(page.locator('#scope-count')).toHaveText('48');
 await expect(page.locator('[data-scope-group]')).toHaveCount(6);
 await expect(page.locator('[data-scope-item]')).toHaveCount(48);
 await expect(page.locator('[data-conditional="true"]')).toHaveCount(4);
 await expect(page.locator('.inc-benefit')).toHaveCount(4);
 await expect(page.locator('.inc-journey-steps li')).toHaveCount(4);
 await expect(page.locator('.inc-house-svg')).toBeVisible();
 await expect(page.getByRole('link',{name:/Explore all 48 services/i})).toBeVisible();
 expect(errors).toEqual([]);
 mkdirSync('artifacts',{recursive:true});
 await page.screenshot({path:'artifacts/residential-inclusions-desktop.png'});
});
test('keyword search hides unmatched cards, reports result count and clear restores all',async({page})=>{
 await page.goto(origin+'/inclusions');
 await page.locator('#scope-search').fill('Family Violence Termination');
 await expect(page.locator('#scope-count')).toHaveText('1');
 await expect(page.locator('#scope-count-label')).toHaveText('matching service');
 await expect(page.locator('[data-scope-item]:visible')).toHaveCount(1);
 await expect(page.locator('#forms')).toBeVisible();
 await expect(page.locator('#inspections')).toBeHidden();
 await page.locator('#scope-search').fill('unlikely-unmatched-keyword-xyz');
 await expect(page.locator('#scope-count')).toHaveText('0');
 await expect(page.locator('#scope-empty')).toBeVisible();
 await page.locator('#scope-clear').click();
 await expect(page.locator('[data-scope-item]:visible')).toHaveCount(48);
 await expect(page.locator('#scope-count-label')).toHaveText('services shown');
 await expect(page.locator('#scope-empty')).toBeHidden();
});
test('mobile service cards, graphics, search and navigation avoid horizontal overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(origin+'/inclusions');
 await expect(page.locator('.inc-hero-content')).toBeVisible();
 await expect(page.locator('.inc-house-svg')).toBeVisible();
 await expect(page.locator('#scope-count')).toHaveText('48');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
 expect(overflow).toBeLessThanOrEqual(1);
 await page.locator('#scope-search').fill('Key Audit and Register Update');
 await expect(page.locator('[data-scope-item]:visible')).toHaveCount(1);
 await expect(page.locator('#scope-count')).toHaveText('1');
 const overflowAfter=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
 expect(overflowAfter).toBeLessThanOrEqual(1);
 mkdirSync('artifacts',{recursive:true});
 await page.screenshot({path:'artifacts/residential-inclusions-mobile.png'});
});
