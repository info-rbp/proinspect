import { expect, test } from '@playwright/test';

test('Student Living links take mobile and desktop visitors to the Co-Living programme',async({page})=>{
  for(const width of [320,390,1440]){
    await page.setViewportSize({width,height:900});
    await page.goto('/student-living');await expect(page).toHaveURL(/\/co-living$/);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href','https://proinspect.systems/co-living');
    await expect(page.locator('main h1')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  }
});
test('homepage advertises one property subscription and terms',async({page})=>{
  await page.goto('/');
  const plan=page.locator('.pi-plan-card');
  await expect(plan).toHaveCount(1);await expect(plan).toContainText('Residential All Inclusive');
  await expect(plan).toContainText('$50');await expect(plan).toContainText('$55 including GST per property per week');
  await expect(page.locator('.pi-plan-disclosure').first()).toContainText('24');
  await expect(page.locator('.pi-plan-disclosure').first()).toContainText('60');
  await expect(page.locator('.pi-home-property-grid .pi-property-card')).toHaveCount(2);
});
test('old sector links have appropriate permanent responses and stay outside the sitemap',async({request})=>{
  const home=await request.get('/sectors/residential',{maxRedirects:0});
  expect(home.status()).toBe(301);expect(home.headers().location).toBe('/residential');
  for(const path of ['/sectors/commercial','/sectors/strata-building']) expect((await request.get(path)).status(),path).toBe(410);
  const xml=await (await request.get('/sitemap.xml')).text();
  expect(xml).toContain('/co-living</loc>');expect(xml).not.toContain('/student-living</loc>');expect(xml).not.toContain('/sectors/');
});
test('the finder connects ongoing property support with the one residential plan',async({page})=>{
  await page.goto('/service-finder');
  await page.getByLabel('Property setting').selectOption('ongoing');
  await expect(page.getByLabel('Your intended outcome').locator('option')).toHaveCount(1);
  await expect(page.getByRole('link',{name:/Explore the programme/})).toHaveAttribute('href','/residential/subscriptions');
});
