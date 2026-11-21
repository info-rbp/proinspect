import { expect, test } from '@playwright/test';
import { SERVICE_SEEDS } from '../../packages/service-catalogue/index';
import { AUDIENCES } from '../../packages/marketing/audiences';

test('all available residential service pages render distinctive copy and valid service structured data',async({request})=>{
  for(const service of SERVICE_SEEDS.filter(s=>s.sectors.includes('residential'))){
    const path='/services/'+service.id;
    const response=await request.get(path);
    expect(response.status(),path).toBe(200);
    const html=await response.text();
    expect(html,path).toContain('property'); // service description or contextual property record
    expect(html,path).toContain('application/ld+json');
    expect(html,path).toContain('"@type":"Service"');
    expect(html,path).toContain('rel="canonical"');
    expect(html,path).toContain('https://proinspect.systems'+path);
  }
});
test('guided finder recommends a different service for each selected customer need',async({page})=>{
  await page.goto('/service-finder');
  await expect(page.getByRole('heading',{name:'Tell us what the property needs.'})).toBeVisible();
  await expect(page.getByRole('link',{name:/View scope and next steps/}).first()).toHaveAttribute('href','/services/property-condition-report');
  await page.getByLabel('Your intended outcome').selectOption('vacating');
  await expect(page.getByRole('link',{name:/View scope and next steps/})).toHaveCount(2);
  await expect(page.getByLabel('Property setting').locator('option')).toHaveText(['Residential rental property','Co-Living property','Ongoing property operations']);
  await page.getByLabel('Property setting').selectOption('co-living');
  await expect(page.getByRole('link',{name:/View scope and next steps/}).first()).toBeVisible();

});
test('all six audience pages have a distinct heading, service links and correct canonical URLs',async({request})=>{
  for(const [slug,audience] of Object.entries(AUDIENCES)){
    const path='/who-we-help/'+slug;
    const response=await request.get(path);
    expect(response.status(),path).toBe(200);
    const html=await response.text();
    expect(html,path).toContain(audience.title);
    expect(html,path).toContain('https://proinspect.systems'+path);
    expect(html,path).toContain('rel="canonical"');
    expect(html,path).toContain('/services/');
  }
});
test('unapproved plan is present as information but not for sale or search indexing',async({request,page})=>{
  const response=await request.get('/residential-property-support');
  expect(response.status()).toBe(200);
  const html=await response.text();
  expect(html).toContain('noindex, nofollow');
  expect(html).toContain('AUD $50 + GST');
  expect(html).not.toContain('Residential Inspection Only');
  await page.goto('/residential-property-support');
  await page.getByText('What are the subscription price and term?').click();
  await expect(page.locator('details[open]')).toContainText('60 days');
  await expect(page.getByRole('link',{name:/Create account \/ Sign in/})).toHaveAttribute('href','/signin');
});
test('sitemap excludes draft terms, residential price proposal and leasing records',async({request})=>{
  const res=await request.get('/sitemap.xml');
  expect(res.status()).toBe(200);
  const xml=await res.text();
  expect(xml).toContain('https://proinspect.systems/service-finder');
  expect(xml).toContain('https://proinspect.systems/who-we-help/private-landlords');
  expect(xml).toContain('https://proinspect.systems/services/property-condition-report');
  for(const path of ['/privacy','/terms','/subscription-terms','/residential-property-support','/properties-for-lease'])
    expect(xml).not.toContain('https://proinspect.systems'+path);
});
