import { test, expect } from '@playwright/test';
for (const width of [320, 390, 1100, 1440]) {
  test(`public header retains account entry, sector links and mobile accessibility at ${width}px`, async ({ page }) => {
    await page.setViewportSize({width, height:950});
    await page.goto('/guest/book/routine-inspection');
    await expect(page.locator('body')).toHaveClass(/site/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
    const header=page.locator('.mkt-site-header');
    await expect(header.getByRole('link',{name:'Sign Up / Sign In'})).toBeVisible();
    await expect(header.getByRole('link',{name:'Contact Us'})).toBeVisible();
    if(width>1100) {
      const nav=header.getByRole('navigation',{name:'Primary navigation'});
      for(const name of ['Residential','Commercial','Strata','Co-Living','Construction','Leasing','Maintenance']) {
        await expect(nav.getByRole('link',{name,exact:true})).toBeVisible();
      }
      await expect(header.locator('.mkt-nav-dropdown')).toHaveCount(0);
    } else {
      const menu=header.locator('.marketing-menu');
      await menu.locator('summary').click();
      await expect(menu).toHaveAttribute('open','');
      await expect(header.getByRole('navigation',{name:'Mobile site navigation'}).getByRole('link',{name:'Construction'})).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(menu).not.toHaveAttribute('open','');
    }
    await page.screenshot({path:`artifacts/screenshots/release-header-${width}.png`});
  });
}
