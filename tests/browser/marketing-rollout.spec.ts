import { expect, test } from '@playwright/test';
import { SERVICE_SEEDS, FAMILIES } from '../../packages/service-catalogue/index';
import { ENGAGEMENTS, GUIDES } from '../../packages/marketing/content';
import { AUDIENCES } from '../../packages/marketing/audiences';

const publicRoutes = [
  '/', '/services', '/service-finder', '/who-we-help', '/residential-property-support', '/residential', '/co-living', '/maintenance',
  '/how-it-works', '/client-experience', '/about', '/contact', '/why-proinspect',
  '/areas-we-service', '/resources', '/privacy', '/terms',
  ...Object.keys(AUDIENCES).map((audience) => '/who-we-help/' + audience),
  ...Object.keys(FAMILIES).map((family) => '/services/category/' + family),
  ...Object.keys(ENGAGEMENTS).map((model) => '/how-we-work/' + model),
  ...Object.keys(GUIDES).map((guide) => '/resources/' + guide),
  ...SERVICE_SEEDS.filter(s=>s.sectors.includes('residential')).map((service) => '/services/' + service.id),
];

test('every public marketing route uses shared navigation, typography, footer and canonical metadata', async ({ request }) => {
  expect(new Set(publicRoutes).size).toBe(publicRoutes.length);
  for (const path of publicRoutes) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const html = await response.text();
    expect(html, path).toContain('rel="canonical"');
    expect(html, path).toContain('mkt-header-wrap');
    expect(html, path).toContain('mkt-site-footer');
    expect(html, path).toContain('id="main"');
    expect(html, path).toMatch(/<h1[\s>]/);
    if (['/', '/who-we-help', '/about', '/contact', '/residential', '/co-living', '/maintenance'].includes(path)) expect(html).toContain('pi-editorial-hero');
    else if (path.startsWith('/services/') && !path.startsWith('/services/category/')) {
      expect(html, path).toContain('mkt-detail-hero');
    } else expect(html, path).toContain('mkt-page-hero');
  }
});

test('all public page families use the shared responsive layout without horizontal overflow', async ({ page }) => {
  const representatives = [
    '/', '/services', '/service-finder', '/who-we-help', '/who-we-help/private-landlords', '/residential-property-support', '/services/category/documents', '/services/category/inspections',
    '/services/routine-inspection', '/services/property-condition-report',
    '/how-it-works',
    '/how-we-work/inspection-plans', '/resources', '/resources/routine-inspection-vs-pcr',
    '/why-proinspect', '/client-experience', '/about', '/areas-we-service', '/contact', '/privacy',
  ];
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of representatives) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator('body')).toHaveClass(/site/);
    await expect(page.locator('.marketing-menu summary')).toBeVisible();
    await expect(page.locator('main h1')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), path).toBe(true);
  }
});

test('marketing contact form preserves scoped service request and signed submission elements', async ({ page }) => {
  await page.goto('/contact?service=routine-inspection');
  await expect(page.getByRole('heading', { name: 'Let’s talk about your property.' })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Property enquiry' })).toBeVisible();
  await expect(page.getByLabel('Service (optional)')).toHaveValue('routine-inspection');
  await expect(page.getByRole('checkbox', { name: /agree to ProInspect/i })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Privacy information' })).toHaveAttribute('href', '/privacy');
});

test('category and engagement navigation use canonical URLs rather than obsolete filters', async ({ page }) => {
  await page.goto('/');
  const category = page.getByRole('link', { name: 'Browse the detailed service catalogue' });
  await expect(category).toHaveAttribute('href', '/services');
  await expect(page.getByRole('link', { name: /Discover the ProInspect approach/ })).toHaveAttribute('href', '/about');
  await expect(page.locator('.pi-process-list li')).toHaveCount(3);
  await category.click();
  await expect(page).toHaveURL(/\/services$/);
  await expect(page.locator('.mkt-family-card').first()).toBeVisible();
});
