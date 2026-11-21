import { expect, test } from '@playwright/test';
test('homepage presents a high-level overview and Client Portal entry',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{level:1})).toContainText('Our Practical Support.');
 await expect(page.locator('.pi-property-card')).toHaveCount(2);
 await expect(page.locator('.pi-property-card img')).toHaveCount(2);
 await expect(page.locator('.pi-editorial-copy').getByRole('link',{name:'Get Started Today'})).toHaveAttribute('href','/client');
 const firstService=page.locator('.pi-property-card').first().getByRole('link',{name:'Explore Our Residential Solutions',exact:true});
 await expect(firstService).toHaveAttribute('href','/residential');
});
test('public navigation exposes all nine destinations at desktop width',async({page})=>{
 await page.setViewportSize({width:1600,height:900});
 await page.goto('/');
 const nav=page.getByRole('navigation',{name:'Primary navigation'});
 for(const label of ['Residential','Co-Living','Leasing','Tenants','Maintenance','About Us','Who We Help','Contact'])
  await expect(nav.getByRole('link',{name:label,exact:true})).toBeVisible();
 await expect(page.locator('.mkt-header-actions').getByRole('link',{name:'Sign Up / Sign In'})).toHaveAttribute('href','/contact');
 await expect(nav.getByRole('link',{name:'Contact',exact:true})).toHaveAttribute('href','/contact');
 await expect(page.locator('.pi-footer-actions').getByRole('link',{name:'Client Portal / Sign In'})).toHaveAttribute('href','https://proinspect.systems/client');
});
test('mobile header contains all destinations without horizontal overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await expect(page.locator('.marketing-menu summary')).toBeVisible();
 await page.locator('.marketing-menu summary').click();
 const menu=page.getByRole('navigation',{name:'Mobile site navigation'});
 for(const name of ['Residential','Co-Living','Leasing','Tenants','Maintenance','About Us','Who We Help','Contact','Sign Up / Sign In'])
  await expect(menu.getByRole('link',{name,exact:true})).toBeVisible();
 await expect(menu.getByRole('link',{name:'Sign Up / Sign In'})).toHaveAttribute('href','/contact');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);
 await menu.getByRole('link',{name:'Residential'}).click();
 await expect(page).toHaveURL(/\/residential$/);
});
