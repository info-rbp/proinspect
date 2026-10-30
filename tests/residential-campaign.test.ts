import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const pageNames=['index','inclusions','getting-started','savings','sign-up','areas-and-eligibility','pricing-and-billing','subscription-terms','sample-reports','faq','contact','resources'];
const read=(p:string)=>readFileSync(p,'utf8');
test('all twelve campaign pages disclose the $50 + GST weekly price',()=>{
 for(const name of pageNames){const html=read('apps/residential-campaign/pages/'+name+'.html');
  assert.match(html,/\$50/);assert.doesNotMatch(html,/\$30(?:\b|\.)/);
  assert.doesNotMatch(html,/\$33(?:\b|\.)/);assert.match(html,/noindex,nofollow/);
 }
});
test('customer signup stays on the existing verified ProInspect identity system',()=>{
 const html=read('apps/residential-campaign/pages/sign-up.html');
 assert.match(html,/https:\/\/proinspect\.systems\/signin\?returnTo=%2Fonboarding/);
 assert.doesNotMatch(html,/<form[^>]*method=["']post/i);
});
test('subscription calculator uses $50 ex GST and $55 including GST',()=>{
 const model=read('apps/residential-campaign/assets/savings-model.mjs');
 assert.match(model,/weeks \* 5500/);
 assert.match(model,/agencyPerPropertyCents/);
 const html=read('apps/residential-campaign/pages/savings.html');
 assert.match(html,/<script type="module" src="\/assets\/savings-calculator\.js"/);
 assert.match(html, /\$11,352/);assert.match(html, /\$5,720/);
 assert.match(html, /\$5,632/);assert.match(html, /Agency fees retained/i);
 assert.match(html,/<progress id="agency-bar"/);
 assert.doesNotMatch(html,/style="width:/);
});
test('Worker remains isolated, noindexed and contains no Stripe secret configuration',()=>{
 const config=read('apps/residential-campaign/wrangler.jsonc');
 assert.match(config,/dist\/worker\.mjs/);assert.doesNotMatch(config,/STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|D1Database/);
});

test('standalone Cloudflare Worker bundles twelve safe routes and passes syntax checking',()=>{
 const output=execFileSync('node',['apps/residential-campaign/build.mjs'],{encoding:'utf8'});
 assert.match(output,/16 campaign routes\/assets/);
 execFileSync('node',['--check','apps/residential-campaign/dist/worker.mjs']);
 const bundle=read('apps/residential-campaign/dist/worker.mjs');
 assert.match(bundle,/\$50/);
 assert.doesNotMatch(bundle,/STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/);
});

// Residential Inclusion page acceptance: retain existing schedule and disclose limits.
test('inclusions page describes all 48 services in six categories with four conditional items',()=>{
 const html=read('apps/residential-campaign/pages/inclusions.html');
 const count=(pattern:RegExp)=>[...html.matchAll(pattern)].length;
 assert.equal(count(/class="scope-block inc-scope-block"/g),6);
 assert.equal(count(/data-scope-item data-conditional=/g),48);
 assert.equal(count(/data-conditional="true"/g),4);
 assert.equal(count(/class="badgelabel conditional">Included\*/g),4);
 for(const category of ['inspections','leasing','access','maintenance','forms','other'])
   assert.match(html,new RegExp('id="'+category+'" data-scope-group'));
 for(const name of [
  'Property Condition Report','Routine Inspection (quarterly)','Follow-Up Routine Inspection',
  'Open Home','Prospective Tenant Reference Checks','Off-Site Key Storage',
  'Key Safe Installation','Urgent Maintenance / Make Good Works',
  'Insurance Claims Management and Facilitation','Family Violence Termination (Form 2)',
  'Joint Application for Disposal of Security Bond','Lodgement of Magistrates Court Forms'
 ]) assert.ok(html.includes(name),name+' must stay in the advertised schedule');
});
test('benefit-led inclusions content and inline graphics remain noindexed and truthful',()=>{
 const html=read('apps/residential-campaign/pages/inclusions.html');
 assert.match(html,/\$50 \+ GST/);
 assert.match(html,/\$55 including 10% GST/);
 assert.match(html,/48 named service items/);
 assert.match(html,/<svg class="inc-house-svg"/);
 assert.match(html,/role="img" aria-labelledby="inc-house-title inc-house-desc"/);
 assert.equal([...html.matchAll(/class="inc-benefit-number"/g)].length,4);
 assert.equal([...html.matchAll(/class="inc-journey-step"/g)].length,4);
 assert.ok(html.includes('not automatically transfer the landlord'));
 assert.ok(html.includes('Contractor invoices, trade materials, repairs'));
 assert.ok(html.includes('conditions must be confirmed'));
 assert.ok(html.includes('noindex,nofollow'));
 assert.ok(html.includes('href="/sign-up"'));
 assert.doesNotMatch(html,/\$30(?:\b|\.)|\$33(?:\b|\.)/);
});
test('service discovery supports live result counts and accessible clear controls',()=>{
 const html=read('apps/residential-campaign/pages/inclusions.html');
 const script=read('apps/residential-campaign/assets/site.js');
 assert.match(html,/id="scope-search" type="search"/);
 assert.match(html,/id="scope-count">48/);
 assert.match(html,/role="status" aria-live="polite"/);
 assert.ok([...html.matchAll(/data-scope-clear/g)].length>=2);
 assert.match(script,/count\.textContent=String\(matches\)/);
 assert.match(script,/clear\.addEventListener\('click'/);
 assert.match(script,/group\.hidden=shown===0/);
});


test('homepage links all four customer journeys and six valid inclusion category anchors',()=>{
 const html=read('apps/residential-campaign/pages/index.html');
 const inclusions=read('apps/residential-campaign/pages/inclusions.html');
 const savings=read('apps/residential-campaign/pages/savings.html');
 assert.match(html,/<main id="main" class="res-home">/);
 assert.match(html,/Keep control of your rental/);
 assert.equal([...html.matchAll(/class="res-path-card"/g)].length,4);
 assert.equal([...html.matchAll(/class="res-service-card"/g)].length,6);
 assert.equal([...html.matchAll(/class="res-stage"/g)].length,4);
 for(const route of ['inclusions','savings','getting-started','sign-up'])
   assert.ok(html.includes('href="/'+route+'"'),route);
 for(const anchor of ['inspections','leasing','access','maintenance','forms']){
   assert.ok(html.includes('href="/inclusions#'+anchor+'"'));
   assert.ok(inclusions.includes('id="'+anchor+'" data-scope-group'));
 }
 assert.ok(savings.includes('id="responsibilities"'));
});

test('home price calculator, branded SVG and release disclosures remain accurate',()=>{
 const html=read('apps/residential-campaign/pages/index.html');
 const script=read('apps/residential-campaign/assets/site.js');
 assert.equal([...html.matchAll(/<h1/g)].length,1);
 assert.match(html,/role="img" aria-labelledby="res-house-title res-house-desc"/);
 assert.match(html,/id="property-count" value="1" min="1" max="100"/);
 assert.match(html,/data-weekly-ex/);
 assert.match(html,/data-weekly-inc/);
 assert.match(html,/data-annual-inc/);
 assert.match(script,/weeklyEx\s*=\s*count\s*\*\s*5000/);
 assert.match(script,/weeklyInc=count\*5500/);
 assert.match(html,/Live recurring Checkout and paid-service activation are not yet enabled/);
 assert.match(html,/not a guaranteed like-for-like saving/);
 assert.match(html,/third-party costs/);
 assert.match(html,/noindex,nofollow/);
 assert.doesNotMatch(html,/<form[^>]*method=["']post/i);
 assert.doesNotMatch(html,/\$30(?:\b|\.)|\$33(?:\b|\.)/);
});


test('top promotional price banner and signup/sign-in header links are removed from every route',()=>{
 for(const name of pageNames){
  const html=read('apps/residential-campaign/pages/'+name+'.html');
  const header=html.match(/<header class="site-header">([\s\S]*?)<\/header>/)?.[1];
  assert.ok(header,'header must be present on '+name);
  assert.doesNotMatch(html,/class="notice-strip"/,'no top promotional banner on '+name);
  assert.doesNotMatch(header!,/href="\/sign-up"/,'no signup nav or header CTA on '+name);
  assert.doesNotMatch(header!,/proinspect\.systems\/signin/,'no sign-in nav on '+name);
  assert.doesNotMatch(header!,/>Sign up<\/a>|>Sign in<\/a>|Existing customer sign-in/);
  assert.match(header!,/class="nav-more"/);
  assert.match(header!,/id="mobile-menu"/);
  assert.match(html,/href="\/sign-up"/,'signup remains reachable via content/footer on '+name);
  assert.match(html,/href="\/contact"/);
  assert.match(html,/href="\/subscription-terms"/);
 }
});

test('all seven new informational routes have copy, local page structure and approved-content caveats',()=>{
 const expected=[
  ['areas-and-eligibility','Coverage is confirmed, not assumed.'],
  ['pricing-and-billing','Live billing is not active yet.'],
  ['subscription-terms','Draft summary — not a signed or approved agreement.'],
  ['sample-reports','no approved PDF downloads yet.'],
  ['faq','Pricing, payments and cancellation'],
  ['contact','No form is submitted on this page.'],
  ['resources','Check current Western Australian guidance.'],
 ] as const;
 for(const [name,phrase] of expected){
  const html=read('apps/residential-campaign/pages/'+name+'.html');
  assert.match(html,/<main id="main" class="info-page/);
  assert.ok(html.includes(phrase),name+' missing caveat or information heading');
  assert.equal([...html.matchAll(/<h1/g)].length,1);
  assert.match(html,/meta name="robots" content="noindex,nofollow"/);
  assert.match(html,/href="\/inclusions"/);
  assert.doesNotMatch(html,/<form[^>]*method=["']post/i);
 }
 const sample=read('apps/residential-campaign/pages/sample-reports.html');
 assert.match(sample,/ILLUSTRATIVE STRUCTURE/);
 assert.doesNotMatch(sample,/<a[^>]*download\b/i);
 const policy=read('apps/residential-campaign/pages/subscription-terms.html');
 assert.match(policy,/not the final legally approved subscription contract/);
 assert.match(policy,/mandatory consumer rights|consumer rights/);
 const contact=read('apps/residential-campaign/pages/contact.html');
 assert.match(contact,/https:\/\/proinspect\.systems\/contact/);
});

test('all new navigation destinations are supported by the Worker build route map',()=>{
 const build=read('apps/residential-campaign/build.mjs');
 const newPages=['areas-and-eligibility','pricing-and-billing','subscription-terms','sample-reports','faq','contact','resources'];
 const html=read('apps/residential-campaign/pages/index.html');
 const h=html.match(/<header class="site-header">([\s\S]*?)<\/header>/)?.[1]||'';
 for(const route of newPages){
  assert.ok(build.includes("'/"+route+"':'"+route+".html'"),route+' absent in bundle');
  assert.ok(h.includes('href="/'+route+'"'),route+' absent in header menu');
  assert.ok(html.includes('href="/'+route+'"'),route+' absent from home/footer');
 }
});
