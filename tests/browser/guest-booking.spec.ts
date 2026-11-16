import { expect, test } from '@playwright/test';

test('a new one-off service customer is routed to account registration without a subscription',async ({page}) => {
  await page.goto('/book/routine-inspection');
  await expect(page.getByRole('heading',{name:'Book using your ProInspect account'})).toBeVisible();
  await expect(page.getByText(/One-off service customers can create a free account/)).toBeVisible();
  await page.getByRole('link',{name:'Continue with email'}).click();
  await expect(page).toHaveURL(/\/signin\?returnTo=/);
  await expect(page.getByLabel('Email address')).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});
test('old guest booking entry points redirect to registered booking without losing selected service',async ({page}) => {
  await page.goto('/guest/book/routine-inspection');
  await expect(page).toHaveURL(/\/book\/routine-inspection/);
  await expect(page.getByRole('heading',{name:'Book using your ProInspect account'})).toBeVisible();
});
test('a historic guest cannot open an unauthorised report',async ({request}) => {
  const response=await request.get('/api/guest/report?token='+('f'.repeat(64)));
  expect(response.status()).toBe(404);
});
