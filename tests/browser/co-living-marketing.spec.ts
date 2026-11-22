import {test,expect} from '@playwright/test';
import {CO_LIVING_BANNERS,CO_LIVING_GUIDE_SLUGS} from '../../packages/marketing/co-living-hub';

test('Co-Living landing uses six linked image banners, correct destination pages and an assessment CTA',async({page,request})=>{
 const javascriptErrors:string[]=[];
 page.on('pageerror',error=>javascriptErrors.push(error.message));
 await page.goto('/co-living');
 await expect(page.getByRole('heading',{level:1})).toHaveText('Your Property. A Complete Co-Living Solution.');
 const banners=page.locator('#service-options .pi-co-living-card');
 await expect(banners).toHaveCount(6);
 for(const [index,item] of CO_LIVING_BANNERS.entries()){
  const card=banners.nth(index);
  await expect(card.getByRole('heading',{name:item.title})).toBeVisible();
  await expect(card.getByRole('link',{name:item.action,exact:true})).toHaveAttribute('href',item.href);
  await expect(card.locator('img')).toHaveAttribute('alt',/.+/);
 }
 const overview=banners.first().getByRole('link',{name:'Discover Co-Living',exact:true});
 await overview.click();
 await expect(page).toHaveURL(/\/co-living#overview$/);
 for(const slug of CO_LIVING_GUIDE_SLUGS){
  const href='/co-living/'+slug;
  const response=await request.get(href);
  expect(response.status(),href).toBe(200);
  await page.goto(href);
  await expect(page.locator('main h1')).toHaveCount(1);
  const link=CO_LIVING_BANNERS.find(b=>b.slug===slug)!;
  await expect(page.locator('main h1')).toHaveText(link.title);
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href','https://proinspect.systems'+href);
  await expect(page.getByRole('link',{name:'Co-Living Overview'}).first()).toHaveAttribute('href','/co-living');
  await expect(page.getByRole('link',{name:'Request a Co-Living Assessment'})).toHaveAttribute('href','/contact?topic=co-living');
 }
 expect(javascriptErrors).toEqual([]);
});

test('Co-Living pricing calculator applies management fee and 25% of collected management fees to utility allowance',async({page})=>{
 await page.goto('/co-living/pricing');
 await expect(page.getByRole('heading',{name:'Illustrative Co-Living owner income calculator.'})).toBeVisible();
 await page.getByLabel('Room occupancy assumption (%)').fill('100');
 await expect(page.getByText('$109,200',{exact:false}).first()).toBeVisible();
 await expect(page.getByText('$6,825',{exact:false}).first()).toBeVisible();
 await page.getByLabel('Room occupancy assumption (%)').fill('95');
 await expect(page.getByText('$6,491.88',{exact:false}).first()).toBeVisible();
 await expect(page.getByText('$342.20',{exact:false}).first()).toBeVisible();
});

test('Co-Living pages fit mobile screen and make contextual owner contact entry available',async({page})=>{
 for(const width of [320,390,768,1280]){
  await page.setViewportSize({width,height:900});
  for(const pathname of ['/co-living','/co-living/how-it-works','/co-living/property-setup',
    '/co-living/inclusions','/co-living/pricing','/co-living/example-property']){
   await page.goto(pathname);
   await expect(page.locator('main h1')).toHaveCount(1);
   const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2);
   expect(fits,width+'px '+pathname).toBe(true);
  }
 }
 await page.goto('/contact?topic=co-living');
 await expect(page.getByLabel('What would you like to discuss?')).toHaveValue('co-living');
 await expect(page.getByLabel('How can ProInspect help?')).toHaveValue(/Co-Living suitability assessment/);
});
