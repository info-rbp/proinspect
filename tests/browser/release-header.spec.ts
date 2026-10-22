import {test,expect} from '@playwright/test';
for(const width of [320,390,1100,1440]){
 test(`guest header layout and navigation at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:950});
  await page.goto('/guest/book/routine-inspection');
  await expect(page.locator('body')).toHaveClass(/site/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const header=page.locator('.mkt-site-header');
  await expect(header.getByRole('link',{name:'Book a service'})).toBeVisible();
  if(width>1100){
   const audience=header.locator('.mkt-nav-dropdown summary');
   const services=header.getByRole('navigation',{name:'Primary navigation'}).getByRole('link',{name:'Services',exact:true});
   const a=await audience.boundingBox(),s=await services.boundingBox();
   expect(Math.abs((a!.y+a!.height/2)-(s!.y+s!.height/2))).toBeLessThan(3);
   await audience.click();await expect(header.locator('.mkt-nav-dropdown')).toHaveAttribute('open','');
   await page.keyboard.press('Escape');await expect(header.locator('.mkt-nav-dropdown')).not.toHaveAttribute('open','');
  }
  await page.screenshot({path:`artifacts/screenshots/release-header-${width}.png`});
 });
}
