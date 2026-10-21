import { test, expect } from '@playwright/test';

test('open-home check-in renders on the public marketing site and keeps visitor flow non-indexable',async({page,request})=>{
 const res=await request.get('/open-home/check-in');
 expect(res.status()).toBe(200);
 expect(res.headers()['x-robots-tag']).toContain('noindex');
 await page.goto('/open-home/check-in');
 await expect(page.locator('body')).toHaveClass(/site/);
 await expect(page.getByRole('heading',{name:'Welcome to your inspection.'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Check in to an open home'})).toBeVisible();
 await expect(page.getByRole('link',{name:/properties for lease/i}).first()).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);
});

test('invalid QR-selected property and session values do not bypass published listing lookup',async({page,request})=>{
 const route='/open-home/check-in?property=not-a-listing&session=not-a-session';
 const res=await request.get(route);
 expect(res.status()).toBe(200);
 expect(res.headers()['x-robots-tag']).toContain('noindex');
 await page.goto(route);
 await expect(page.getByRole('heading',{name:'Welcome to your inspection.'})).toBeVisible();
 // Invalid prefill parameters must not be reflected as an approved property.
 expect(await page.locator('option[value="not-a-listing"]').count()).toBe(0);
});

test('unauthenticated visitors cannot retrieve private attendance reports or exports',async({request,page})=>{
 const view=await request.get('/api/open-home/report/lsn_synthetic');
 const download=await request.get('/api/open-home/report/lsn_synthetic.csv');
 const staffSettings=await request.post('/api/staff/open-home-checkins/settings',{
  data:{listingId:'lst_synthetic',settings:{version:0,enabled:true,recipientUserId:'u',authorityReference:'synthetic'}},
 });
 expect(view.status()).toBe(401);
 expect(download.status()).toBe(401);
 expect(staffSettings.status()).toBe(401);
 await page.goto('/open-home/report/lsn_synthetic');
 await expect(page).toHaveURL(/\/signin(?:\?|$)/);
});
