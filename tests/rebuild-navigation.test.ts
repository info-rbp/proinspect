import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PUBLIC_NAVIGATION, activePublicCategory } from '../packages/marketing/public-navigation.ts';
import { residentialPublicResponse } from '../packages/domain/residential-policy.ts';
import { isMarketingStylePath, shouldIndexPublicPage } from '../apps/platform/app/lib/public-routes.ts';

const origin = 'https://proinspect-rebuild.delicate-dream-e4c9.workers.dev';
test('all eleven top-level menu destinations match the approved order', () => {
  assert.deepEqual(PUBLIC_NAVIGATION.map(x=>[x.label,x.href]), [
    ['Residential','/residential'],['Commercial','/commercial'],['Co-Spaces','/co-spaces'],
    ['Maintenance','/maintenance'],['Modular','/modular'],['Construction','/construction'],['Tenants','/tenants'],
    ['Leasing','/leasing'],['Subscriptions','/subscriptions'],['Information','/information'],
    ['Sign Up / Sign In','/client'],
  ]);
  for (const item of PUBLIC_NAVIGATION.filter(x=>x.href!=='/client')) {
    assert.ok(isMarketingStylePath(item.href), item.href);
    assert.equal(shouldIndexPublicPage(item.href,origin,'staging'),false);
    for (const file of ['apps/platform/app/routes.ts','apps/marketing/app/routes.ts'])
      assert.ok(readFileSync(file,'utf8').includes("route('"+item.href.slice(1)+"',"), item.href+' '+file);
  }
});
test('commercial and construction landing exceptions are rebuild-only and do not reactivate retired workflows', () => {
  for (const path of ['/commercial','/commercial.data','/commercial/','/construction','/construction.data','/construction/'])
    assert.equal(residentialPublicResponse(new Request(origin+path)),null);
  for (const path of ['/commercial/new','/commercial-applications','/properties-for-lease/commercial','/strata','/construction/new','/construction-services','/sectors/construction'])
    assert.equal(residentialPublicResponse(new Request(origin+path))?.status,410);
  for (const path of ['/commercial','/construction'])
    assert.equal(residentialPublicResponse(new Request('https://proinspect.systems'+path))?.status,410);
});
test('new editorial landings remain excluded from indexing until reviewed', () => {
  for (const path of ['/commercial','/co-spaces','/modular','/construction','/subscriptions','/information'])
    assert.equal(shouldIndexPublicPage(path,'https://proinspect.systems','production'),false);
});

test('footer contains only the requested support navigation and retains company details', () => {
  const chrome=readFileSync('apps/marketing/app/components/site-chrome.tsx','utf8').split('export function MarketingFooter')[1];
  assert.ok(chrome);
  const footerLinks=Array.from(chrome.matchAll(/<Link\b[^>]*\bto="([^"]+)"[^>]*>/g),match=>match[1]);
  assert.deepEqual(footerLinks,['/','/help-centre','/about','/contact']);
  assert.match(chrome,/aria-label="Footer navigation"/);
  assert.match(chrome,/ABN 52 703 550 609/);
  assert.match(chrome,/ACN 703 550 609/);
  for(const path of ['/privacy','/website-terms','/platform-terms','/terms','/booking-policy','/service-scopes','/subscription-terms'])
    assert.equal(isMarketingStylePath(path),true,path+' remains a public route');
});

test('Co-Working is public editorial content, not a booking or indexed release', () => {
  const path='/co-spaces/co-working';
  assert.equal(isMarketingStylePath(path),true);
  assert.equal(shouldIndexPublicPage(path,'https://proinspect.systems','production'),false);
  for(const file of ['apps/platform/app/routes.ts','apps/marketing/app/routes.ts'])
    assert.ok(readFileSync(file,'utf8').includes("route('co-spaces/co-working',"));
  const home=readFileSync('apps/marketing/app/routes/home.tsx','utf8');
  assert.match(home,/name="subscription-care"/);
  assert.doesNotMatch(home,/RebuildSubscriptionTiles/);
  assert.match(readFileSync('apps/marketing/app/routes/rebuild-landing.tsx','utf8'),/<RebuildSubscriptionTiles\/>/);
  assert.match(home,/to="\/subscriptions"/);
  assert.doesNotMatch(home,/PlanComparison|EditorialSteps|Have something specific in mind\?/);
});

test('final home notes preserve the approved title and exact replacement copy', () => {
  const home=readFileSync('apps/marketing/app/routes/home.tsx','utf8');
  for(const copy of ["From residential and commercial properties to shared spaces and building projects, ProInspect helps unlock the potential of your property through innovative solutions, practical expertise and support designed around your needs.","Let us help you discover a more connected approach to shared living, with property setup, resident support and ongoing care.","Take the stress out of managing your commercial properties with regular inspections, tenant engagement and responsive support when you need it most.","Transform your commercial property into a co-working space with flexible, tailored workspaces, shared environments and fully managed solutions.","Take the stress out of your construction project and keep it on track with our dedicated construction project management services.","Find your next place with ProInspect. Browse our available homes, discover upcoming open homes and follow the advertised online application process where available."]) assert.ok(home.includes(copy),copy);
  assert.ok(home.includes('eyebrow="ProInspect Property Services"'));
  assert.ok(home.includes("label: 'Learn More About ProInspect', to: '/about'"));
  assert.match(home,/name="innovation"/);
  assert.match(home,/name="subscription-care"/);
  assert.doesNotMatch(home,/pi-home-connections/);
  const css=readFileSync('packages/ui/marketing-rebuild-home.css','utf8');
  assert.match(css,/pi-home-service-banner \.pi-home-stacked-heading\s*\{[^}]*max-width:none/);
});

test('active public categories match exact, nested and legacy routes without false prefix matches', () => {
  for(const [path,category] of [
    ['/co-living','/co-spaces'],['/co-living/property-setup','/co-spaces'],
    ['/co-spaces/co-working','/co-spaces'],['/residential/services/property-inspections','/residential'],
    ['/residential/subscriptions','/subscriptions'],['/properties-for-lease/residential/example','/leasing'],
    ['/help-centre','/information'],['/about','/information'],['/privacy','/information'],
    ['/construction/','/construction'],
  ]) assert.equal(activePublicCategory(path),category,path);
  for(const path of ['/','/client','/co-spaces-other','/commercialised']) assert.equal(activePublicCategory(path),undefined,path);
});
