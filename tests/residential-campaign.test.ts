import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const pageNames=['index','inclusions','getting-started','savings','sign-up'];
const read=(p:string)=>readFileSync(p,'utf8');
test('all five campaign pages promote the approved $50 + GST weekly price',()=>{
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
 assert.match(html, /\$5,632/);assert.match(html, /retained management/i);
});
test('Worker remains isolated, noindexed and contains no Stripe secret configuration',()=>{
 const config=read('apps/residential-campaign/wrangler.jsonc');
 assert.match(config,/dist\/worker\.mjs/);assert.doesNotMatch(config,/STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|D1Database/);
});

test('standalone Cloudflare Worker bundles five safe routes and passes syntax checking',()=>{
 const output=execFileSync('node',['apps/residential-campaign/build.mjs'],{encoding:'utf8'});
 assert.match(output,/9 campaign routes\/assets/);
 execFileSync('node',['--check','apps/residential-campaign/dist/worker.mjs']);
 const bundle=read('apps/residential-campaign/dist/worker.mjs');
 assert.match(bundle,/\$50/);
 assert.doesNotMatch(bundle,/STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/);
});
