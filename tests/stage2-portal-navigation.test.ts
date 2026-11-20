import test from 'node:test';
import assert from 'node:assert/strict';
import { PORTAL_MENU_PROFILES, MORE_TOOL_GROUPS, getNavigationProfile } from '../packages/domain/portal-navigation.ts';

test('all ten current workspace kinds have concise, distinct and versioned presentation menus', () => {
  const kinds = Object.keys(PORTAL_MENU_PROFILES);
  assert.equal(kinds.length, 10, 'commercial occupant and all nine established portal kinds must remain');
  for (const [kind, profile] of Object.entries(PORTAL_MENU_PROFILES)) {
    assert.equal(profile.primary[0], '', kind + ' is missing Overview');
    assert.ok(profile.primary.length >= 3 && profile.primary.length <= 8, kind + ' has an oversized menu');
    assert.equal(new Set(profile.primary).size, profile.primary.length, kind + ' repeats a route');
    assert.match(profile.version, /^\d+\.\d+\.\d+$/, kind + ' has no menu version');
    assert.ok(profile.label.trim(), kind + ' has no accessible label');
    assert.equal(getNavigationProfile(kind as keyof typeof PORTAL_MENU_PROFILES), profile);
  }
});

test('staff first-level tasks and specialist groups remain separate', () => {
  const staff = PORTAL_MENU_PROFILES.staff;
  assert.deepEqual(staff.primary, ['', 'bookings', 'work-orders', 'reports', 'properties', 'finance']);
  const grouped = MORE_TOOL_GROUPS.flatMap(group => group.paths);
  for (const path of ['integrations', 'leasing', 'wa-form-queue', 'release-readiness', 'asset-compliance', 'records'])
    assert.ok(grouped.includes(path), path + ' is not reachable from grouped tools');
  assert.equal(new Set(grouped).size, grouped.length, 'grouped route appears in more than one group');
});

test('invited tenant, council, resident and commercial occupant keep distinct task navigation', () => {
  const forbidden = ['billing', 'contractor-payments', 'integrations', 'legal-administration'];
  for (const kind of ['tenant', 'council', 'building', 'building-manager', 'commercial-occupant'] as const)
    for (const path of forbidden)
      assert.ok(!PORTAL_MENU_PROFILES[kind].primary.includes(path), kind + ' exposes ' + path);
  assert.ok(PORTAL_MENU_PROFILES.tenant.primary.includes('tenancies'));
  assert.ok(PORTAL_MENU_PROFILES.council.primary.includes('finance'));
  assert.ok(PORTAL_MENU_PROFILES['commercial-occupant'].primary.includes('occupant-premises'));
  assert.ok(PORTAL_MENU_PROFILES['building-manager'].primary.includes('facilities'));
});
