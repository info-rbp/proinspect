import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const origin = 'https://proinspect-v3-staging.delicate-dream-e4c9.workers.dev';
const browser = await chromium.launch();
const evidence = {
  origin,
  sourceSha: process.env.GITHUB_SHA,
  authenticatedAcceptance: false,
  checks: [],
  passed: false,
};
mkdirSync('artifacts', { recursive: true });
try {
  for (const width of [320, 390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    for (const path of [
      '/',
      '/residential',
      '/co-living',
      '/leasing',
      '/tenants',
      '/maintenance',
      '/about',
      '/who-we-help',
      '/contact',
      '/residential-property-support',
    ]) {
      const response = await page.goto(origin + path);
      assert.equal(response.status(), 200, path);
      await page.locator('h1').waitFor({ state: 'visible' });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
        path + ' overflow',
      );
      assert.doesNotMatch(await page.locator('body').innerText(), /\$150|\$20/);
      evidence.checks.push({ width, path, status: 200 });
    }
    await page.goto(origin + '/residential');
    if (width < 1000) {
      await page.getByLabel('Open site menu').click();
      const navigation = page.getByRole('navigation', { name: 'Mobile site navigation' });
      await navigation.waitFor({ state: 'visible' });
      assert.equal(await navigation.getByRole('link').count(), 9);
      await page.keyboard.press('Escape');
      await navigation.waitFor({ state: 'hidden' });
    }
    await page.screenshot({ path: `artifacts/residential-hosted-${width}.png`, fullPage: true });
    assert.deepEqual(errors, [], 'Hosted browser errors');
    await page.close();
  }
  const signIn = await browser.newPage();
  const health = await (await signIn.request.get(origin + '/api/health')).json();
  assert.equal(health.environment,'staging');
  if (process.env.GITHUB_SHA) assert.equal(health.source,process.env.GITHUB_SHA);
  assert.equal(health.authenticationConfigured,true);
  await signIn.goto(origin+'/signin?returnTo=%2Fworkspaces');
  await signIn.getByRole('button',{name:'Continue with staging email'}).click();
  await signIn.waitForURL(url=>url.hostname==='delicate-dream-e4c9.cloudflareaccess.com');
  await signIn.locator('input[type=email]').first().waitFor({state:'visible'});
  evidence.signIn = { provider:'Cloudflare Access one-time PIN', emailChallengeVisible:true, accountSessionVerified:false };
  await signIn.close();
  evidence.passed = true;
  console.log(
    'Hosted staging public browser checks passed at 320/390/1440px. Authenticated/provider acceptance remains separate.',
  );
} catch (error) {
  evidence.error = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  writeFileSync(
    'artifacts/residential-hosted-browser.json',
    JSON.stringify(evidence, null, 2) + '\n',
  );
}
