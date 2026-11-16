import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { portalFamily,groupWorkspaces,effectiveExperienceLabels,PORTAL_FAMILIES } from '../packages/domain/portal-experience.ts';
import type { Workspace } from '../packages/domain/index.ts';

const scope=(kind:Workspace['kind'],name:string=kind,accountType?:string):Workspace=>({
 kind,name,scopeId:'scope_'+kind,role:kind==='council'?'council_member':'owner',
 href:'/w/'+kind+'/scope_'+kind,accountType,
});
test('four customer-facing portal families and internal operations retain nine distinct permissions',()=>{
 assert.deepEqual(Object.keys(PORTAL_FAMILIES),['residential','commercial','strata','resident','operations']);
 assert.equal(portalFamily('landlord'),'residential');
 assert.equal(portalFamily('property-manager'),'residential');
 assert.equal(portalFamily('commercial'),'commercial');
 assert.equal(portalFamily('strata-manager'),'strata');
 assert.equal(portalFamily('building-manager'),'strata');
 for(const kind of ['tenant','building','council'] as const)assert.equal(portalFamily(kind),'resident');
 assert.equal(portalFamily('staff'),'operations');
 const members=groupWorkspaces([scope('tenant'),scope('council'),scope('landlord')]);
 assert.equal(members.find(m=>m.family==='resident')?.workspaces.length,2);
 assert.equal(members.find(m=>m.family==='residential')?.workspaces.length,1);
 assert.notEqual(members[0].workspaces[0].scopeId,members[1].workspaces[0].scopeId);
});
test('account experience tags are labels, not permissions, and unknown tags do not render',()=>{
 const w={...scope('landlord'),experienceTags:['co_living','bad_injected_tag']};
 assert.deepEqual(effectiveExperienceLabels(w),['Residential landlord','Co-living']);
 assert.deepEqual(effectiveExperienceLabels(scope('commercial','Asset','commercial_landlord')),['Commercial landlord']);
});
test('Resident entry is invitation-only and all new service bookings require a verified account',()=>{
 const routes=readFileSync('apps/platform/app/routes.ts','utf8');
 const api=readFileSync('apps/platform/worker/api.ts','utf8');
 const guard=readFileSync('packages/authorization/server.ts','utf8');
 const signin=readFileSync('apps/platform/app/routes/signin.tsx','utf8');
 assert.match(signin,/invitation-only/);
 assert.match(routes,/route\('invitations\/accept'/);
 assert.match(routes,/guest\/book\/\:serviceId\?', 'routes\/retired-guest-entry\.tsx'/);
 assert.match(routes,/guest\/request\/\:serviceCode', 'routes\/retired-guest-request\.tsx'/);
 assert.match(api,/path==='\/api\/v4\/requests' && method==='POST'\)throw new AppError\(410/);
 assert.match(api,/path === '\/api\/guest\/requests' && method === 'POST'\) throw new AppError\(410/);
 assert.match(guard,/tenancy_memberships/);
 assert.match(guard,/scheme_memberships/);
});
test('co-living requires authorised management, private-space occupancy and a per-tenancy Resident view',()=>{
 const source=readFileSync('apps/platform/worker/features/co-living.server.ts','utf8');
 const service=readFileSync('apps/platform/worker/services.server.ts','utf8');
 const api=readFileSync('apps/platform/worker/api.ts','utf8');
 assert.match(source,/requireResidentialManager/);
 assert.match(source,/CO_LIVING_RESIDENTIAL_ONLY/);
 assert.match(source,/o\.tenancy_id=\?/);
 assert.match(source,/space_type='shared_area'/);
 assert.match(service,/CO_LIVING_SPACE_NOT_FOUND/);
 assert.match(api,/CO_LIVING_SPACE_REQUIRED/);
 assert.match(api,/co_living_occupancies/);
});
