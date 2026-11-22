import { expect, test } from '@playwright/test';

// PR-01 keeps the public website and client login on the existing single origin.
test('public industry pages lead into one secure Client Portal entry',async({page,request})=>{
 const origin='http://127.0.0.1:5173';
 for(const path of ['/','/residential','/co-living','/leasing','/maintenance']){
  const response=await request.get(path);expect(response.status(),path).toBe(200);
 }
 await page.setViewportSize({width:1600,height:900});
 await page.goto('/');
 await expect(page.locator('body')).toHaveClass(/site/);
 await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('link',{name:'Residential'}).click();
 await expect(page).toHaveURL(origin+'/residential');
 await page.locator('.mkt-header-actions').getByRole('link',{name:'Sign Up / Sign In'}).click();
 await expect(page).toHaveURL(origin+'/contact');
 await expect(page.getByRole('link',{name:'Client Portal / Sign In'})).toHaveAttribute('href','https://proinspect.systems/client');
 // A local navigation to the authenticated entry avoids crossing into production in CI.
 await page.goto('/client');
 await expect(page.getByRole('heading',{name:'One secure account. The right workspace for you.'})).toBeVisible();
 await page.getByRole('link',{name:'Sign in with email'}).first().click();
 await expect(page).toHaveURL(origin+'/signin');
 await expect(page.getByRole('heading',{name:'Welcome back to ProInspect.'})).toBeVisible();
 await page.getByRole('link',{name:'Create a free account'}).click();
 await expect(page).toHaveURL(/\/signup\?returnTo=/);
 await expect(page.getByRole('group',{name:'What brings you to ProInspect?'})).toBeVisible();
 await expect(page.getByRole('radio',{name:/I own a residential property/})).toBeVisible();
});
test('legacy public routes and secure contact flow remain available',async({request,page})=>{
 for(const path of ['/services/category/inspections','/resources','/why-proinspect','/privacy','/contact']){
  const response=await request.get(path);expect(response.status(),path).toBe(200);
 }
 await page.goto('/contact?service=routine-inspection');
 await expect(page.getByLabel('Service (optional)')).toHaveValue('routine-inspection');
 const sitemap=await request.get('/sitemap.xml');expect(sitemap.status()).toBe(200);
 const robots=await request.get('/robots.txt');expect(robots.status()).toBe(200);
});
