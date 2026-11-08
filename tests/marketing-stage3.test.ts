import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SERVICE_SEEDS } from '../packages/service-catalogue/index.ts';
import { SERVICE_EDITORIAL } from '../packages/marketing/service-editorial.ts';
import { RESIDENTIAL_SUPPORT_COMMERCIAL_APPROVED } from '../packages/marketing/pricing-publication.ts';
import { PUBLICATION_REGISTER } from '../packages/marketing/publication-register.ts';
import { seo } from '../apps/marketing/app/lib/seo.ts';
import { shouldIndexPublicPage } from '../apps/platform/app/lib/public-routes.ts';

const read=(path:string)=>readFileSync(path,'utf8');

test('all 23 services have distinctive substantial copy, preparations and relevant answers',()=>{
  assert.equal(SERVICE_SEEDS.length,23);
  const ids=SERVICE_SEEDS.map(s=>s.id).sort();
  assert.deepEqual(Object.keys(SERVICE_EDITORIAL).sort(),ids);
  const unique=new Set<string>();
  for(const id of ids){
    const entry=SERVICE_EDITORIAL[id];
    assert.ok(entry.lead.length>115,id+' has insufficient introductory detail');
    assert.ok(entry.audience.length>35,id+' audience needs context');
    assert.ok(entry.preparation.length>60,id+' needs clear preparation');
    assert.ok(entry.distinction.length>65,id+' needs a service boundary');
    assert.match(entry.question, /\?$/,id+' needs a direct question');
    assert.ok(entry.answer.length>50,id+' answer needs detail');
    unique.add(entry.lead);
  }
  assert.equal(unique.size,23,'Service pages must not all share generic placeholder copy');
});

test('structured SEO graph uses only available facts, one canonical and named service',()=>{
  const descriptors=seo('Routine Inspection — Western Australia','Visible condition record for eligible rental properties.','/services/routine-inspection',{
    type:'Service',
    breadcrumbs:[{name:'Services',path:'/services'},{name:'Routine Inspection',path:'/services/routine-inspection'}],
  });
  const canonical=descriptors.filter(d=>'tagName' in d && d.tagName==='link' && 'rel' in d && d.rel==='canonical');
  assert.equal(canonical.length,1);
  assert.equal('href' in canonical[0] ? canonical[0].href : undefined,'https://proinspect.systems/services/routine-inspection');
  const script=descriptors.find(d=>'script:ld+json' in d);
  assert.ok(script && 'script:ld+json' in script);
  const graph=(script['script:ld+json'] as {'@graph':Array<Record<string,unknown>>})['@graph'];
  assert.ok(graph.some(x=>x['@type']==='Service'));
  const crumbs=graph.find(x=>x['@type']==='BreadcrumbList');
  assert.ok(crumbs);
  assert.equal((crumbs.itemListElement as unknown[]).length,3);
  assert.doesNotMatch(JSON.stringify(graph),/"(ratingValue|reviewCount|price|openingHours|postalCode)"/);
  assert.ok(descriptors.some(d=>'property' in d&&d.property==='og:locale'&&'content' in d&&d.content==='en_AU'));
});

test('price proposals and unapproved statutory/public records stay noindex and out of sitemap',()=>{
  assert.equal(RESIDENTIAL_SUPPORT_COMMERCIAL_APPROVED,false);
  for(const pathname of ['/privacy','/terms','/subscription-terms','/residential-property-support','/properties-for-lease','/properties-for-lease/residential']){
    assert.equal(shouldIndexPublicPage(pathname,'https://proinspect.systems','production'),false,pathname);
  }
  for(const pathname of ['/service-finder','/who-we-help','/who-we-help/private-landlords','/services/property-condition-report']){
    assert.equal(shouldIndexPublicPage(pathname,'https://proinspect.systems','production'),true,pathname);
    assert.equal(shouldIndexPublicPage(pathname,'https://example.workers.dev','production'),false,pathname);
  }
  const sitemap=read('apps/marketing/app/routes/sitemap.ts');
  assert.match(sitemap,/shouldIndexPublicPage/);
  assert.doesNotMatch(sitemap,/publicListings|await publicListings/);
});

test('both marketing route trees expose the same conversion and audience pages',()=>{
  const a=read('apps/marketing/app/routes.ts');
  const b=read('apps/platform/app/routes.ts');
  for(const path of ['service-finder','who-we-help','who-we-help/:audience','residential-property-support']){
    assert.ok(a.includes("route('"+path+"'"),path+' missing from marketing router');
    assert.ok(b.includes("route('"+path+"'"),path+' missing from unified router');
  }
  const ui=read('apps/marketing/app/components/site-chrome.tsx');
  for(const slug of ['private-landlords','property-management-agencies','commercial-property-owners','commercial-asset-managers','strata-managers','building-operators'])
    assert.match(read('packages/marketing/audiences.ts'),new RegExp("'"+slug+"':"));
  assert.match(ui,/who-we-help/);
  assert.match(ui,/Leasing/);
});

test('stage 3 editorial approval and media provenance remain explicit release conditions',()=>{
  const publicationIds=PUBLICATION_REGISTER.map(x=>x.id);
  assert.ok(publicationIds.includes('SEO-RELEASE'));
  assert.ok(publicationIds.includes('COPY-HOME'));
  assert.equal(PUBLICATION_REGISTER.filter(x=>x.category==='service').length,23);
  const plan=read('apps/marketing/app/routes/residential-support.tsx');
  assert.match(plan,/\$50 \+ GST per property, per week/);
  assert.match(plan,/not an available checkout offer/);
  assert.match(plan,/noindex:!RESIDENTIAL_SUPPORT_COMMERCIAL_APPROVED/);
  assert.match(read('apps/marketing/app/lib/media-approval.ts'),/rightsRecord/);
});
