import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WORKSPACES } from '../packages/domain/index.ts';
import { PORTAL_MENU_PROFILES, MORE_TOOL_GROUPS } from '../packages/domain/portal-navigation.ts';

const layout = readFileSync('apps/platform/app/routes/workspace.tsx', 'utf8');
const overview = readFileSync('apps/platform/app/routes/overview.tsx', 'utf8');
const css = readFileSync('packages/ui/portal.css', 'utf8');
const docs = readFileSync('docs/PORTALS.md', 'utf8');

test('all ten workspace kinds have a distinct compact first-level navigation', () => {
  assert.deepEqual(Object.keys(PORTAL_MENU_PROFILES).sort(), Object.keys(WORKSPACES).sort());
  assert.match(layout, /getNavigationProfile\(w.kind\)/);
  const tags=new Set(Object.values(PORTAL_MENU_PROFILES).map(profile=>profile.tag));
  assert.equal(tags.size, Object.keys(WORKSPACES).length);
  for (const profile of Object.values(PORTAL_MENU_PROFILES)) {
    assert.match(profile.tag,/^NAV-[A-Z-]+$/);
    assert.match(profile.version,/^\d+\.\d+\.\d+$/);
    assert.ok(profile.primary.includes(''));
    assert.ok(profile.primary.length<=7);
  }
  assert.ok(layout.includes('const primary = items.filter'), 'Keep the permission-aware source of available links');
  assert.ok(layout.includes('const secondary = items.filter'), 'Keep specialist deep links');
  assert.match(layout, /moreActive/);
  assert.match(layout, /aria-label="Workspace navigation"/);
  assert.match(layout, /aria-label="Breadcrumb"/);
});

test('specialist navigation is grouped and searchable without privilege changes', () => {
  for (const group of ['Operations', 'Documents & services', 'Administration'])
    assert.ok(MORE_TOOL_GROUPS.some(g=>g.label===group));
  assert.match(layout, /const toolGroups = MORE_TOOL_GROUPS/);
  assert.match(layout, /type="search"/);
  assert.match(layout, /aria-label="More tools"/);
  assert.match(layout, /staff && \['administrator', 'operations_manager'\]/);
  assert.match(layout, /data\.restrictedEnabled/);
  assert.match(layout, /w\.role/);
  assert.match(docs, /Grouping and hiding links \*\*never\*\* create permissions/);
});

test('Staff action centre derives real scoped work from workspace data, not synthetic metrics', () => {
  for (const label of ["Today's work", 'Bookings due', 'Reports to review', 'Open work', 'Exceptions', 'Recent activity'])
    assert.ok(overview.includes(label), 'Missing Staff section: '+label);
  assert.match(overview, /function StaffToday\(\{ data, reports \}: \{ data: WorkspaceData; reports: StaffReport\[\] \}\)/);
  assert.match(overview, /if \(params.kind !== 'staff'\) return \{ staffReports: \[\] as StaffReport\[\] \}/);
  assert.match(overview, /reports\.filter\(r => r\.status === 'submitted'\)/);
  assert.match(overview, /data\.workOrders\.filter/);
  assert.match(overview, /data\.bookings\.filter/);
  assert.match(overview, /data\.approvals\.filter/);
});

test('shared UI styling is restrained, responsive and focus visible', () => {
  for (const selector of ['.app-shell .sidebar', '.app-shell .portal-breadcrumb', '.app-shell .metric', '.app-shell .side-nav-search-label', '.app-shell .table-wrap', ':focus-visible'])
    assert.ok(css.includes(selector), 'Missing shared style: '+selector);
  assert.match(css, /max-width: 800px/);
  assert.match(css, /max-width: 480px/);
  assert.match(docs, /New residential and commercial owner accounts start as \*\*free accounts\*\*/);
});
