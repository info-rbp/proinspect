import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SERVICE_SEEDS } from '../packages/service-catalogue/index.ts';
import { ENGAGEMENTS, GUIDES } from '../packages/marketing/content.ts';
import { isPublicSitePath, shouldIndexPublicPage } from '../apps/platform/app/lib/public-routes.ts';
// @ts-expect-error Cloudflare deployment utility is intentionally plain JavaScript.
import { directConfiguration } from '../scripts/deploy/prepare-direct.mjs';

const source = (file: string) => readFileSync(file, 'utf8');

test('the public home, every service and all content routes are part of the one platform application', () => {
  const routes = source('apps/platform/app/routes.ts');
  assert.match(routes, /layout\('routes\/public-layout\.tsx'/);
  assert.match(routes, /index\('\.\.\/\.\.\/marketing\/app\/routes\/home\.tsx'\)/);
  for (const file of ['home', 'services', 'service', 'sector', 'content', 'resources', 'information'])
    assert.ok(routes.includes(`../../marketing/app/routes/${file}.tsx`), file);
  assert.match(routes, /route\('contact', 'routes\/public-contact\.tsx'\)/);
  assert.match(routes, /route\('signin', 'routes\/signin\.tsx'\)/);
  assert.match(routes, /route\('workspaces', 'routes\/workspaces\.tsx'\)/);
  assert.match(routes, /route\('w\/:kind\/:scopeId'/);
  assert.equal(SERVICE_SEEDS.length, 23);
  for (const service of SERVICE_SEEDS) assert.ok(isPublicSitePath(`/services/${service.id}`), service.id);
  for (const model of Object.keys(ENGAGEMENTS)) assert.ok(isPublicSitePath(`/how-we-work/${model}`));
  for (const guide of Object.keys(GUIDES)) assert.ok(isPublicSitePath(`/resources/${guide}`));
});

test('public marketing pages are indexable only on the canonical domain, private pages never are', () => {
  for (const publicPath of ['/', '/services', '/contact', '/services/routine-inspection',
    '/sectors/strata-building', '/how-it-works', '/resources', '/resources/pre-vacate-vs-final',
    '/why-proinspect', '/privacy', '/sitemap.xml', '/robots.txt']) {
    assert.equal(isPublicSitePath(publicPath), true, publicPath);
    assert.equal(shouldIndexPublicPage(publicPath, 'https://proinspect.systems', 'production'), true);
    assert.equal(shouldIndexPublicPage(publicPath, 'https://some-preview.workers.dev', 'production'), false);
    assert.equal(shouldIndexPublicPage(publicPath, 'https://proinspect.systems', 'local'), false);
  }
  for (const privatePath of ['/signin', '/auth/complete', '/account', '/onboarding',
    '/book/routine-inspection', '/w/landlord/abc', '/workspaces', '/api/session']) {
    assert.equal(isPublicSitePath(privatePath), false, privatePath);
    assert.equal(shouldIndexPublicPage(privatePath, 'https://proinspect.systems', 'production'), false);
  }
});

test('the deployed Worker has one origin for marketing, booking, sign-in and contact', () => {
  const wrangler = JSON.parse(source('apps/platform/wrangler.jsonc'));
  const connected = directConfiguration(wrangler, {appOrigin: 'https://proinspect.systems'}).env.connected;
  assert.equal(connected.name, 'proinspect-platform');
  assert.equal(connected.vars.APP_ENV, 'production');
  assert.equal(connected.vars.APP_ORIGIN, 'https://proinspect.systems');
  assert.equal(connected.vars.MARKETING_ORIGIN, connected.vars.APP_ORIGIN);
  assert.equal(connected.vars.PLATFORM_ORIGIN, connected.vars.APP_ORIGIN);
  assert.ok(JSON.parse(source('config/environment.json')).variables.MARKETING_TURNSTILE_SITE_KEY.targets.includes('platform'));
  assert.equal(connected.r2_buckets.find((b: {binding: string}) => b.binding === 'RESTRICTED_DOCUMENTS')?.bucket_name,
    'proinspect-platform-restricted-documents');
  const publicLayout = source('apps/platform/app/routes/public-layout.tsx');
  assert.match(publicLayout, /appOrigin: ''/);
  assert.match(publicLayout, /to="\/book"/);
  assert.match(publicLayout, /to="\/signin"/);
});

test('the original contact form uses a signed in-process receiver instead of a second Worker', () => {
  const contact = source('apps/platform/app/routes/public-contact.tsx');
  assert.match(contact, /submitContact\(args, async/);
  assert.match(contact, /receiveEnquiry\(env, new Request/);
  assert.match(contact, /export \{ default, loader, meta \}/);
  const marketingAction = source('apps/marketing/app/routes/contact.tsx');
  assert.match(marketingAction, /enquirySchema\.safeParse/);
  assert.match(marketingAction, /signEnquiry\(/);
  assert.match(marketingAction, /Turnstile/);
  assert.match(marketingAction, /reloadDocument/); // Native form submits on the same origin.
  assert.match(marketingAction, /export const action = submitContact/);
});


test('unified worker preserves browser POST origin for marketing forms without leaking account paths', () => {
  const sourceText = source('apps/platform/worker/app.ts');
  assert.match(sourceText, /headers\.set\('Referrer-Policy', 'strict-origin'\)/);
  assert.doesNotMatch(sourceText, /headers\.set\('Referrer-Policy', 'no-referrer'\)/);
  // Referrer-Policy: no-referrer forces Chromium navigation POSTs to send
  // Origin: null; React Router rejects those form submissions before action().
  // strict-origin sends only the origin and keeps the framework's CSRF checks intact.
  assert.match(source('apps/marketing/app/routes/contact.tsx'), /<Form method=\"post\" reloadDocument/);
});