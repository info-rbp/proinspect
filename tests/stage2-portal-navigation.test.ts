import test from 'node:test';
import assert from 'node:assert/strict';
import { PORTAL_KINDS, portalNavigation, portalLocation, isPortalRoute } from '../apps/platform/app/lib/portal-navigation.ts';

const get = (kind:string, role='owner', staffRole='operations_manager', restricted=false) =>
  portalNavigation(kind,role,staffRole,restricted);

test('all nine workspace types have concise unique primary navigation and one home',()=>{
  assert.equal(PORTAL_KINDS.length,9);
  for(const kind of PORTAL_KINDS){
    const nav=get(kind);
    assert.equal(nav.primary[0]?.path,'',kind);
    assert.ok(nav.primary.length>=3&&nav.primary.length<=7,kind+' bulky first-level menu');
    const all=[...nav.primary,...nav.groups.flatMap(g=>g.links)];
    assert.equal(new Set(all.map(x=>x.path)).size,all.length,kind+' route repeated');
    assert.deepEqual(all.map(x=>x.path).sort(),nav.all.map(x=>x.path).sort(),kind+' missing route');
    assert.ok(nav.groups.every(g=>g.links.length>0),kind+' empty group');
    assert.ok(nav.all.every(x=>x.label.trim()&&typeof x.path==='string'),kind+' inaccessible label');
  }
});

test('Staff has six clear operational first-level destinations and specialist groups',()=>{
  const nav=get('staff');
  assert.deepEqual(nav.primary.map(x=>x.label),
    ['Today','Schedule','Work orders','Reports','Clients & properties','Finance']);
  for(const path of ['release-readiness','pricing-administration','legal-administration','integrations','reporting','v2-business','leasing','wa-form-queue','asset-compliance']){
    assert.ok(nav.groups.some(g=>g.links.some(x=>x.path===path)),path+' lost from Staff tools');
  }
  assert.ok(nav.groups.length>=4);
  const inspector=get('staff','viewer','inspector');
  for(const forbidden of ['legal-administration','integrations','finance','pricing-administration','release-readiness','enquiries','administration']){
    assert.equal(inspector.all.some(x=>x.path===forbidden),false,'inspector gained '+forbidden);
  }
  assert.ok(inspector.primary.some(x=>x.path==='reports'));
});

test('tenant, resident, council and building-manager navigation preserve disjoint scopes',()=>{
  const tenant=get('tenant');
  const resident=get('building');
  const council=get('council');
  const manager=get('building-manager');
  for(const path of ['billing','contractor-payments','properties','commercial-leases','legal-administration','integrations']){
    for(const menu of [tenant,resident,council,manager]){
      assert.equal(menu.all.some(x=>x.path===path),false,'unauthorised '+path);
    }
  }
  assert.ok(tenant.primary.some(x=>x.path==='tenancies'));
  assert.ok(resident.primary.some(x=>x.path==='facilities'));
  assert.ok(council.primary.some(x=>x.path==='finance'));
  assert.equal(council.all.some(x=>x.path==='requests'),false);
  assert.deepEqual(manager.all.map(x=>x.path),['','facilities','building-communications','documents']);
});

test('client access and restricted tools remain entitlement-sensitive',()=>{
  assert.equal(get('property-manager','viewer').all.some(x=>x.path==='owner-invitations'),false);
  assert.ok(get('property-manager','owner').all.some(x=>x.path==='owner-invitations'));
  assert.equal(get('landlord','viewer').all.some(x=>x.path==='team'),false);
  assert.equal(get('landlord','viewer').all.some(x=>x.path==='billing'),false);
  assert.equal(get('tenant').all.some(x=>x.path==='confidential'),false);
  assert.ok(get('tenant','owner','operations_manager',true).all.some(x=>x.path==='confidential'));
  assert.equal(get('council','owner','operations_manager',true).all.some(x=>x.path==='confidential'),false);
});

test('breadcrumbs select longest authorised route while unknown URLs stay generic',()=>{
  const nav=get('staff'),href='/w/staff/operations';
  assert.equal(portalLocation(nav,href,href),'Today');
  assert.equal(portalLocation(nav,href+'/reports/a1',href),'Reports');
  assert.equal(portalLocation(nav,href+'/legal-administration',href),'Legal versions');
  assert.equal(portalLocation(nav,href+'/unknown',href),'Workspace');
  assert.equal(isPortalRoute(href+'/reports2',href,'reports'),false);
  assert.equal(isPortalRoute(href+'/reports/a1',href,'reports'),true);
});
