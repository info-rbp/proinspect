import { expect, test } from '@playwright/test';
test('homepage presents a high-level overview and Client Portal entry',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{level:1})).toContainText('Built Around You.');
 await expect(page.locator('.pi-home-service-card')).toHaveCount(7);
 await expect(page.locator('.pi-home-service-card img')).toHaveCount(7);
 await expect(page.locator('.pi-editorial-copy').getByRole('link',{name:'Get Started Today'})).toHaveAttribute('href','/client');
 const firstService=page.locator('.pi-property-card').first().getByRole('link',{name:'Explore Our Residential Solutions',exact:true});
 await expect(firstService).toHaveAttribute('href','/residential');
});
test('public header and simplified footer expose the rebuild navigation at desktop width',async({page})=>{
 await page.setViewportSize({width:1600,height:900});
 await page.goto('/');
 const nav=page.getByRole('navigation',{name:'Primary navigation'});
 for(const label of ['Residential','Commercial','Co-Spaces','Maintenance','Modular','Construction','Tenants','Leasing','Subscriptions','Information'])
  await expect(nav.getByRole('link',{name:label,exact:true})).toBeVisible();
 await expect(page.locator('.mkt-header-actions').getByRole('link',{name:'Sign Up / Sign In'})).toHaveAttribute('href','/client');
 const footer=page.getByRole('navigation',{name:'Footer navigation'});
 await expect(footer.getByRole('link')).toHaveCount(3);
 for(const [name,href] of [['Help Centre','/help-centre'],['About Us','/about'],['Contact Us','/contact']])
  await expect(footer.getByRole('link',{name,exact:true})).toHaveAttribute('href',href);
 await expect(page.locator('.mkt-footer-bottom a')).toHaveCount(0);
});
test('mobile header contains all destinations without horizontal overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await expect(page.locator('.marketing-menu summary')).toBeVisible();
 await page.locator('.marketing-menu summary').click();
 const menu=page.getByRole('navigation',{name:'Mobile site navigation'});
 for(const name of ['Residential','Commercial','Co-Spaces','Maintenance','Modular','Construction','Tenants','Leasing','Subscriptions','Information'])
  await expect(menu.getByRole('link',{name,exact:true})).toBeVisible();
 await expect(menu.getByRole('link',{name:'Sign Up / Sign In'})).toHaveCount(0);
 await expect(page.locator('.mkt-header-actions').getByRole('link',{name:'Sign Up / Sign In'})).toHaveAttribute('href','/client');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);
 await menu.getByRole('link',{name:'Residential'}).click();
 await expect(page).toHaveURL(/\/residential$/);
});
