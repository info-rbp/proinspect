import test from 'node:test';
import assert from 'node:assert/strict';
import type { Workspace } from '../packages/domain/index.ts';
import {
  authDestination,
  entryFlow,
  entryPath,
  resolvePortalEntry,
  workspaceEntryPath,
} from '../packages/onboarding/entry.ts';

const workspace = (kind: Workspace['kind'], extra: Partial<Workspace> = {}): Workspace => ({
  kind,
  scopeId: kind,
  name: kind,
  role: 'owner',
  href: '/w/' + kind + '/' + kind,
  ...extra,
});
test('unknown roles, Staff and individual invitation tags cannot select a registration flow', () => {
  for (const value of ['ONB-STAFF', 'ONB-INV-COUNCIL', '__proto__', '/w/staff/operations', null])
    assert.equal(entryFlow(value), null);
  assert.equal(resolvePortalEntry([], 'ONB-STAFF'), null);
  assert.equal(resolvePortalEntry([], 'ONB-INV-CORE'), null);
  assert.equal(resolvePortalEntry([], 'ONB-STR-BUILDING'), null);
});
test('new owners and professional managers reach their distinct setup routes with service context', () => {
  for (const [flow, path] of [
    ['ONB-RES-OWNER', '/onboarding'],
    ['ONB-COM-OWNER', '/onboarding'],
    ['ONB-RES-AGENCY', '/organisation'],
    ['ONB-COM-MANAGER', '/organisation'],
    ['ONB-STR-MANAGER', '/organisation'],
  ])
    assert.equal(
      resolvePortalEntry([], flow, 'routine-inspection'),
      path + '?flow=' + flow + '&service=routine-inspection',
    );
  assert.equal(entryPath('ONB-COM-OWNER', '//outside.test'), '/start?flow=ONB-COM-OWNER');
});
test('existing membership determines routing, including all invited roles and internal Staff', () => {
  for (const kind of [
    'landlord',
    'property-manager',
    'commercial',
    'strata-manager',
    'tenant',
    'commercial-occupant',
    'building',
    'council',
    'building-manager',
    'staff',
  ] as const) {
    const member = workspace(kind);
    assert.equal(resolvePortalEntry([member]), member.href);
  }
  assert.equal(
    resolvePortalEntry([workspace('tenant')], 'ONB-RES-OWNER'),
    '/onboarding?flow=ONB-RES-OWNER',
  );
  assert.equal(resolvePortalEntry([workspace('staff')], 'ONB-INV-CORE'), null);
  assert.equal(resolvePortalEntry([workspace('tenant')], 'ONB-INV-CORE'), '/w/tenant/tenant');
});
test('commercial owners and reviewed professional portfolios are distinguished by server metadata', () => {
  const owner = workspace('commercial', {
    scopeId: 'owner',
    href: '/w/commercial/owner',
    accountType: 'commercial_landlord',
    professionalPortfolio: false,
  });
  const manager = workspace('commercial', {
    scopeId: 'manager',
    href: '/w/commercial/manager',
    accountType: 'commercial_landlord',
    professionalPortfolio: true,
  });
  assert.equal(resolvePortalEntry([owner, manager], 'ONB-COM-OWNER'), owner.href);
  assert.equal(resolvePortalEntry([owner, manager], 'ONB-COM-MANAGER'), manager.href);
  assert.equal(
    resolvePortalEntry([owner], 'ONB-COM-MANAGER'),
    '/organisation?flow=ONB-COM-MANAGER',
  );
});
test('multiple authorised accounts remain a choice and service intent overrides only bookable landing preferences', () => {
  assert.equal(
    resolvePortalEntry([workspace('landlord'), workspace('tenant')], null, 'routine-inspection'),
    '/workspaces?service=routine-inspection',
  );
  const owner = workspace('landlord', { landingSection: 'documents' });
  assert.equal(workspaceEntryPath(owner), owner.href + '/documents');
  assert.equal(
    workspaceEntryPath(owner, 'routine-inspection'),
    owner.href + '/book/routine-inspection',
  );
  const tenant = workspace('tenant', { landingSection: 'my-room' });
  assert.equal(workspaceEntryPath(tenant, 'routine-inspection'), tenant.href + '/my-room');
});
test('authentication preserves booking and invitation deep links and refuses external or looping destinations', () => {
  for (const path of [
    '/book/routine-inspection',
    '/invitations/accept?token=' + 'a'.repeat(64),
    '/owner-invitation?token=' + 'b'.repeat(64),
  ])
    assert.equal(authDestination(path), path);
  for (const path of [
    '/signin',
    '/signin/',
    '/signup.data?returnTo=%2Fsignup',
    '/signup?returnTo=%2Fsignin',
    '/signout',
    '/auth/complete?token=private',
  ])
    assert.equal(authDestination(path), '/start');
  for (const path of ['https://outside.test', '//outside.test', '/\\outside.test'])
    assert.equal(authDestination(path), '/workspaces');
  assert.equal(authDestination(null), '/start');
});
