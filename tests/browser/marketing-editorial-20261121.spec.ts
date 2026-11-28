import {test,expect} from '@playwright/test';
import {RESIDENTIAL_CATEGORIES} from '../../packages/marketing/residential-categories';
test('homepage editorial structure follows the expanded rebuild strategy',async({page})=>{
 await page.goto('/');
 const hero=page.locator('.pi-editorial-hero-home');
 await expect(hero.getByRole('heading',{level:1})).toContainText('Property Solutions.');
 await expect(hero.locator('h1 br')).toHaveCount(1);
 await expect(hero.getByRole('link',{name:'See What We Offer'})).toHaveAttribute('href','/#property-services');
 await expect(hero.getByRole('link',{name:'Get Started Today'})).toHaveAttribute('href','/client');
 await expect(page.locator('.pi-home-service-card')).toHaveCount(7);
 await expect(page.getByRole('heading',{name:'Properties Available'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Maintenance',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:/Explore Maintenance/})).toHaveAttribute('href','/maintenance');
 await expect(page.getByRole('link',{name:/Explore Our Subscriptions/})).toHaveAttribute('href','/subscriptions');
 await expect(page.locator('.pi-home-principles article')).toHaveCount(3);
 await expect(page.getByRole('link',{name:/Sign Up Today/})).toHaveAttribute('href','/client');
 await expect(page.locator('.mkt-footer-group')).toHaveCount(0);
 await expect(page.locator('.pi-footer-legal a')).toHaveCount(0);
});
test('all eight Residential service areas are browsable and connect to authorised detail routes',async({page})=>{
 await page.goto('/residential');
 await expect(page.getByRole('heading',{name:'Innovative Support for Every Stage of Your Rental'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Services Designed to Support You.'})).toBeVisible();
 await expect(page.locator('.pi-residential-grid .pi-property-card')).toHaveCount(8);
 for(const category of RESIDENTIAL_CATEGORIES){
  const dest='/residential/services/'+category.slug;
  const linked=page.locator('.pi-residential-grid').getByRole('link',{name:category.title,exact:true});
  await expect(linked).toHaveAttribute('href',dest);
  const response=await page.goto(dest);
  expect(response?.status(),dest).toBe(200);
  await expect(page.getByRole('heading',{level:1})).toContainText(category.title);
  for(const service of category.features.filter(x=>x.featured))
   await expect(page.getByRole('heading',{name:service.title,exact:true})).toBeVisible();
  await page.goto('/residential');
 }
 await expect(page.getByRole('link',{name:/View Example Inspection Reports/})).toHaveAttribute('href','/example-reports');
 await expect(page.getByRole('link',{name:/Visit Our Help Centre/})).toHaveAttribute('href','/help-centre');
});
test('Residential discovery, legal gating and responsive reflow work at small and desktop widths',async({page,request})=>{
 const paths=['/','/residential','/residential/services','/residential/services/property-inspections','/residential/services/open-homes','/residential/services/leasing-support','/residential/services/maintenance-management','/residential/services/access-control','/residential/services/exit-inspections','/residential/services/bond-administration','/residential/services/other-property-support','/help-centre','/example-reports','/residential/subscriptions','/co-living','/maintenance','/about','/who-we-help','/leasing','/tenants','/contact'];
 for(const width of [320,390,800,1440]){
  await page.setViewportSize({width,height:900});
  for(const path of paths){
   const response=await page.goto(path);
   expect(response?.status(),path).toBe(200);
   await expect(page.locator('h1')).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),path+' @ '+width+'px').toBe(false);
   const retired=await page.locator('a[href]').evaluateAll(links=>links.map(x=>x.getAttribute('href')).filter(h=>/^\/(commercial|strata|construction|student-living)(\/|$)/.test(h||'')));
   expect(retired).toEqual([]);
  }
 }
 const sitemap=await(await request.get('/sitemap.xml')).text();
 expect(sitemap).toContain('/residential/services/property-inspections');
 expect(sitemap).toContain('/help-centre');
 expect(sitemap).toContain('/example-reports');
 expect(sitemap).not.toContain('/residential/subscriptions</loc>');
 await page.goto('/residential/subscriptions');
 await expect(page.locator('meta[name=robots]')).toHaveAttribute('content',/noindex/);
});
test('historic roles remain sign-in-only and unapproved reports are correctly labelled',async({page})=>{
 await page.goto('/client');
 await expect(page.getByRole('heading',{name:'Existing Commercial and Strata Clients'})).toBeVisible();
 const legacy=page.locator('.pi-entry-card').filter({hasText:'Existing Commercial and Strata Clients'});
 await expect(legacy.getByRole('link',{name:'Sign in with email'})).toHaveAttribute('href','/signin');
 await expect(legacy.getByRole('link',{name:'Create a free account'})).toHaveCount(0);
 await page.goto('/example-reports');
 await expect(page.getByText(/ILLUSTRATIVE EXAMPLE/).first()).toBeVisible();
 await page.goto('/help-centre');
 await expect(page.getByRole('heading',{name:'Coverage and availability'})).toBeVisible();
});
