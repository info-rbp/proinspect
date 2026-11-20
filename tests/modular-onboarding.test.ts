import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ONBOARDING_FLOWS, isOnboardingFlowId, isPublicOnboardingFlow,
  portalFamilyForWorkspace, PORTAL_FAMILIES,
} from '../packages/onboarding/registry.ts';
import { WORKSPACES } from '../packages/domain/index.ts';

const load = (path: string) => readFileSync(path, 'utf8');

test('onboarding flows have independent permanent identifiers, versions and step tags', () => {
  assert.equal(Object.keys(ONBOARDING_FLOWS).length, 15);
  for (const [id, flow] of Object.entries(ONBOARDING_FLOWS)) {
    assert.equal(flow.id,id);
    assert.match(flow.version,/^\d+\.\d+\.\d+$/);
    assert.ok(flow.steps.length>0);
    assert.ok(new Set(flow.steps).size===flow.steps.length);
    assert.ok(flow.requiredAtStart.length>0);
    assert.ok(PORTAL_FAMILIES[flow.family]);
  }
  assert.equal(isOnboardingFlowId('ONB-RES-OWNER'), true);
  assert.equal(isOnboardingFlowId('ONB-INV-COUNCIL'), true);
  assert.equal(isOnboardingFlowId('ONB-INV-EVIL'), false);
});
test('Resident invitation and Staff registration cannot be self-selected', () => {
  for (const id of ['ONB-INV-CORE','ONB-INV-RES','ONB-INV-COM','ONB-INV-STR','ONB-INV-COUNCIL','ONB-STAFF','ONB-STR-BUILDING']) {
    assert.equal(isPublicOnboardingFlow(id), false, id);
  }
  for (const id of ['ONB-RES-OWNER','ONB-COM-OWNER','ONB-RES-AGENCY','ONB-COM-MANAGER','ONB-STR-MANAGER']) {
    assert.equal(isPublicOnboardingFlow(id), true, id);
  }
});
test('four customer-facing portal families retain all existing workspace kinds plus distinct commercial occupants', () => {
  const all = Object.keys(WORKSPACES);
  assert.equal(all.length,10);
  for (const kind of all) assert.ok(PORTAL_FAMILIES[portalFamilyForWorkspace(kind)]);
  assert.equal(portalFamilyForWorkspace('landlord'),'residential');
  assert.equal(portalFamilyForWorkspace('property-manager'),'residential');
  assert.equal(portalFamilyForWorkspace('commercial'),'commercial');
  assert.equal(portalFamilyForWorkspace('strata-manager'),'strata');
  assert.equal(portalFamilyForWorkspace('building-manager'),'strata');
  assert.equal(portalFamilyForWorkspace('tenant'),'resident');
  assert.equal(portalFamilyForWorkspace('commercial-occupant'),'resident');
  assert.equal(portalFamilyForWorkspace('building'),'resident');
  assert.equal(portalFamilyForWorkspace('council'),'resident');
  assert.equal(portalFamilyForWorkspace('staff'),'operations');
});
test('professional onboarding remains reviewed and is not a self-approved membership', () => {
  const org = load('apps/platform/app/routes/organisation.tsx');
  const server = load('apps/platform/worker/features/portfolio.server.ts');
  assert.match(org,/ONB-RES-AGENCY/);
  assert.match(org,/ONB-COM-MANAGER/);
  assert.match(org,/ONB-STR-MANAGER/);
  assert.match(server,/status='pending'/);
  assert.match(server,/approveOrganisation/);
});
test('resident invitation is email-and-property scoped, without public registration', () => {
  const ui = load('apps/platform/app/routes/resident-invitations.tsx');
  const portal = load('apps/platform/worker/features/portfolio.server.ts');
  const tenant = load('apps/platform/worker/features/tenancies.server.ts');
  const preview = load('apps/platform/worker/features/invitation-preview.server.ts');
  assert.match(ui,/tenancies\/.*invite/);
  assert.match(ui,/schemes/);
  assert.match(portal,/schemeAccess\(env, user, w, d.schemeId, true\)/);
  assert.match(portal,/user.email/);
  assert.match(tenant,/tenancyAccess\(env, user, w, id, true\)/);
  assert.match(preview,/i.email=\?/);
  assert.match(preview,/consumed_at IS NULL/);
  assert.match(preview,/expires_at>\?/);
});
test('new hosted guest service commissioning is stopped without deleting historic access', () => {
  const api=load('apps/platform/worker/api.ts');
  const booking=load('apps/platform/app/routes/booking-intent.tsx');
  const routes=load('apps/platform/app/routes.ts');
  assert.match(api,/ACCOUNT_REQUIRED/);
  assert.match(api,/method==='POST'\)throw new AppError\(410/); // Retired in every environment, including local.
  assert.match(api,/guest\.guestReport/);
  assert.match(booking,/Sign in or register for free/);
  assert.ok(routes.includes("route('guest/book/:serviceId?'"), 'legacy redirect preserved');
  assert.match(routes,/retired-guest-entry\.tsx/);
});
