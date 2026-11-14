import { expect, test } from '@playwright/test';
test('homepage presents a high-level overview and Client Portal entry',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{level:1})).toContainText('From Inspections to Reporting');
 await expect(page.locator('.pi-service-card')).toHaveCount(4);
 await expect(page.locator('.pi-sector-card')).toHaveCount(3);
 await expect(page.locator('.pi-actions').getByRole('link',{name:/Sign Up \/ Sign In/})).toHaveAttribute('href','/client');
 const firstService=page.locator('.pi-service-card').first().getByRole('link');
 await expect(firstService).toHaveAttribute('href','/services/category/inspections');
});
test('public navigation exposes the requested twelve destinations',async({page})=>{
 await page.goto('/');
 const nav=page.getByRole('navigation',{name:'Primary navigation'});
 for(const label of ['Home','Residential','Commercial','Strata','Co-Living','Construction','Leasing','Maintenance','About Us','Who We Help'])
  await expect(nav.getByRole('link',{name:label,exact:true})).toBeVisible();
 await expect(page.locator('.mkt-header-actions').getByRole('link',{name:'Sign Up / Sign In'})).toHaveAttribute('href','/client');
 await expect(page.locator('.mkt-header-actions').getByRole('link',{name:'Contact Us'})).toHaveAttribute('href','/contact');
});
test('mobile header contains all destinations without horizontal overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await expect(page.locator('.marketing-menu summary')).toBeVisible();
 await page.locator('.marketing-menu summary').click();
 const menu=page.getByRole('navigation',{name:'Mobile site navigation'});
 for(const name of ['Residential','Commercial','Strata','Co-Living','Construction','Leasing','Maintenance','About Us','Who We Help','Sign Up / Sign In','Contact Us'])
  await expect(menu.getByRole('link',{name,exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);
 await menu.getByRole('link',{name:'Residential'}).click();
 await expect(page).toHaveURL(/\/residential$/);
});
