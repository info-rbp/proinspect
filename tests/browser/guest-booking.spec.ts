import {expect,test} from '@playwright/test';
test('public one-off booking does not require a portal sign-in and explains price',async({page})=>{
 await page.goto('/book/routine-inspection');
 await expect(page.getByRole('heading',{name:'How would you like to book?'})).toBeVisible();
 await page.getByRole('link',{name:'Book once'}).click();
 await expect(page).toHaveURL(/\/guest\/book\/routine-inspection/);
 await expect(page.getByRole('heading',{name:'Book a one-off ProInspect service'})).toBeVisible();
 await expect(page.getByText(/Published service price:|requires a quotation/)).toBeVisible();
 await expect(page.getByLabel('Email address')).toBeVisible();
 await expect(page.getByLabel('Street address')).toBeVisible();
 await expect(page.locator('input[name="requestKey"]')).not.toHaveValue('');
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});
test('a guest cannot open another report without an authorised link',async({request})=>{
 const response=await request.get('/api/guest/report?token='+('f'.repeat(64)));
 expect(response.status()).toBe(404);
});
