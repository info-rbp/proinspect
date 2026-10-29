import {test,expect} from '@playwright/test';
import {readFileSync,mkdirSync} from 'node:fs';

const origin='https://residential-campaign.local';
const assetBase='apps/residential-campaign/';
const resources:Record<string,[string,string]>={
 '/savings':['pages/savings.html','text/html; charset=utf-8'],
 '/assets/site.css':['assets/site.css','text/css; charset=utf-8'],
 '/assets/site.js':['assets/site.js','text/javascript; charset=utf-8'],
 '/assets/savings-calculator.js':['assets/savings-calculator.js','text/javascript; charset=utf-8'],
 '/assets/savings-model.mjs':['assets/savings-model.mjs','text/javascript; charset=utf-8'],
};
test.beforeEach(async({page})=>{
 await page.route(origin+'/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  const resource=resources[path];
  if(!resource){await route.fulfill({status:404,body:'Not found'});return;}
  const [file,contentType]=resource;
  await route.fulfill({status:200,contentType,body:readFileSync(assetBase+file,'utf8'),
   headers:{'content-security-policy':"default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"}});
 });
});

test('default agency model matches 24-month Perth reference with verified browser modules',async({page})=>{
 const pageErrors:string[]=[];
 page.on('pageerror',error=>pageErrors.push(error.message));
 await page.goto(origin+'/savings');
 await expect(page.locator('#result-period')).toHaveText('24 months · 104 weeks · 1 property');
 await expect(page.locator('#result-agency')).toHaveText('$11,352');
 await expect(page.locator('#result-subscription')).toHaveText('$5,720');
 await expect(page.locator('#result-difference')).toHaveText('$5,632');
 await expect(page.locator('#result-difference-pct')).toContainText('49.6% below');
 await expect(page.locator('#result-effective-rate')).toContainText('14.6%');
 await expect(page.locator('#agency-breakdown-total')).toHaveText('$11,352');
 expect(pageErrors).toEqual([]);
 mkdirSync('artifacts',{recursive:true});
 await page.screenshot({path:'artifacts/residential-savings-desktop.png',fullPage:true});
});

test('editing rent, fee inclusions and uncovered costs recalculates rather than double counting',async({page})=>{
 await page.goto(origin+'/savings');
 await page.locator('#agency-weekly-rent').fill('850');
 await expect(page.locator('#result-agency')).toHaveText('$12,601.60');
 await expect(page.locator('#result-difference')).toHaveText('$6,881.60');
 await page.locator('#agency-savings-reset').click();
 await expect(page.locator('#result-agency')).toHaveText('$11,352');
 await page.locator('.agency-assumptions summary').click();
 await page.locator('#agency-on-renewal').uncheck();
 await expect(page.locator('#agency-breakdown-total')).toHaveText('$11,077');
 await page.locator('#self-extra-cost').fill('2500');
 await expect(page.locator('#result-alternative')).toHaveText('$8,220');
 await expect(page.locator('#result-difference')).toHaveText('$2,857');
});

test('keeping a traditional manager increases costs rather than asserting fictitious savings',async({page})=>{
 await page.goto(origin+'/savings');
 await page.locator('input[name="arrangement"][value="retain"]').check();
 await expect(page.locator('#result-retained')).toHaveText('$11,352');
 await expect(page.locator('#result-alternative')).toHaveText('$17,072');
 await expect(page.locator('#result-difference')).toHaveText('$5,720');
 await expect(page.locator('#result-outcome')).toHaveClass(/negative/);
 await expect(page.locator('#result-status')).toContainText('its fees still apply');
});

test('shorter tenancy recalculates agency renewals and mobile layout stays within viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto(origin+'/savings');
 await page.locator('input[name="tenancy-months"][value="12"]').check({force:true});
 await expect(page.locator('#result-agency')).toHaveText('$6,803.50');
 await expect(page.locator('#result-subscription')).toHaveText('$2,860');
 await expect(page.locator('#result-difference')).toHaveText('$3,943.50');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
 expect(overflow).toBeLessThanOrEqual(1);
 mkdirSync('artifacts',{recursive:true});
 await page.screenshot({path:'artifacts/residential-savings-mobile.png',fullPage:true});
});
