import { assert, statement, type Env } from '../../../../packages/database/types';
import { RETIRED_WORKSPACES } from '../../../../packages/domain/residential-policy';
import { boundedText } from '../../../../packages/http-bodies';

export function requireResidentialSector(sector: unknown) {
  assert(
    sector === 'residential',
    410,
    'SECTOR_RETIRED',
    'New services are available for Residential properties only. Existing records remain accessible to authorised users.',
  );
}

/** Defence at the HTTP boundary, including Staff and stale browser forms.
 * Domain functions independently recheck property authority. Provider webhooks
 * still reconcile historical money; they never authorise a new purchase.
 */
export async function guardResidentialMutation(
  request: Request,
  env: Env,
  kind?: string,
  tail = '',
) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const path = new URL(request.url).pathname;
  assert(
    !RETIRED_WORKSPACES.has(kind ?? '') &&
      !/(?:^|\/)(?:commercial[^/]*|strata[^/]*|schemes|facilities|council[^/]*|amenities)(?:\/|$)/.test(
        tail || path,
      ),
    410,
    'SECTOR_RETIRED',
    'This service is retired. Authorised historical records remain available.',
  );
  let input: Record<string, unknown> = {};
  // JSON endpoints also accept JSON without a Content-Type header. Route checks
  // must still run for empty and multipart bodies. Endpoint validators own uploads.
  if (!request.headers.get('content-type')?.includes('multipart/form-data')) {
    try {
      const body = JSON.parse(await boundedText(request.clone() as Request));
      if (body && typeof body === 'object') input = body;
    } catch (error) {
      // Malformed JSON is rejected by the endpoint; a bounded-read failure must
      // not skip the sector inspection for an otherwise accepted payload.
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  for (const key of ['sector', 'landlordType'])
    if (input[key] !== undefined) requireResidentialSector(input[key]);
  if (input.market !== undefined)
    assert(
      input.market === 'RES' || input.market === 'residential',
      410,
      'SECTOR_RETIRED',
      'Choose Residential services.',
    );
  for (const key of ['workspaceKind'])
    assert(
      !RETIRED_WORKSPACES.has(String(input[key] ?? '')),
      410,
      'SECTOR_RETIRED',
      'This account type is retired.',
    );
  assert(
    !input.schemeId && !input.buildingId,
    410,
    'SECTOR_RETIRED',
    'New scheme and building operations are retired.',
  );
  if (path.includes('/organisation-applications') || input.kind === 'commercial')
    assert(
      !RETIRED_WORKSPACES.has(String(input.kind ?? '')),
      410,
      'SECTOR_RETIRED',
      'This account or listing type is retired.',
    );
  if (/(?:^|\/)v2(?:-|\/)/.test(tail || path))
    await guardResidentialRelatedRecords(env, input, tail || path);
  const propertyIds = new Set<string>();
  if (typeof input.propertyId === 'string') propertyIds.add(input.propertyId);
  if (Array.isArray(input.propertyIds))
    for (const id of input.propertyIds) if (typeof id === 'string') propertyIds.add(id);
  const links = [
    ['bookingId', 'bookings', 'bookings'],
    ['workOrderId', 'work_orders', 'work-orders'],
    ['requestId', 'requests', 'requests'],
    ['tenancyId', 'tenancies', 'tenancies'],
    ['listingId', 'leasing_listings', 'leasing'],
  ] as const;
  for (const [field, table, area] of links) {
    const route = (tail || path).split('/');
    const index = route.indexOf(area);
    const id = input[field] ?? (index >= 0 ? route[index + 1] : undefined);
    if (typeof id !== 'string' || !id) continue;
    const row = await statement(env.DB, `SELECT property_id FROM ${table} WHERE id=?`, id).first<{
      property_id: string | null;
    }>();
    if (row?.property_id) propertyIds.add(row.property_id);
  }
  if (tail.startsWith('properties/')) propertyIds.add(tail.split('/')[1]);
  for (const id of propertyIds) {
    const p = await statement(env.DB, 'SELECT sector FROM properties WHERE id=?', id).first<{
      sector: string;
    }>();
    if (p) requireResidentialSector(p.sector);
  }
  if (typeof input.serviceId === 'string') {
    assert(!input.serviceId.startsWith('COM-'), 410, 'SECTOR_RETIRED', 'This service is retired.');
    const service = await statement(
      env.DB,
      'SELECT sectors_json FROM services WHERE id=?',
      input.serviceId,
    ).first<{ sectors_json: string }>();
    if (service)
      assert(
        JSON.parse(service.sectors_json).includes('residential'),
        410,
        'SECTOR_RETIRED',
        'This service is retired.',
      );
  }
}

/** Resolve indirect operational IDs before mutation. Shared Residential asset,
 * maintenance and sector modules remain usable; their retired contexts do not.
 * Table/column identifiers below are fixed source constants, never request SQL.
 */
async function guardResidentialRelatedRecords(
  env: Env,
  input: Record<string, unknown>,
  path: string,
) {
  const relations: Record<string, string> = {
    assetId: 'v2_assets',
    asset_id: 'v2_assets',
    parentId: 'v2_assets',
    engagementId: 'v2_engagements',
    engagement_id: 'v2_engagements',
    subscriptionId: 'v2_subscription_periods',
    subscription_id: 'v2_subscription_periods',
    taskId: 'v2_maintenance_tasks',
    task_id: 'v2_maintenance_tasks',
    workOrderId: 'work_orders',
    work_order_id: 'work_orders',
    obligationId: 'v2_compliance_obligations',
    obligation_id: 'v2_compliance_obligations',
    packId: 'v2_sector_packs',
    pack_id: 'v2_sector_packs',
    rolloutId: 'v2_sector_rollouts',
    rollout_id: 'v2_sector_rollouts',
    programmeId: 'v2_capital_programmes',
    programme_id: 'v2_capital_programmes',
    projectId: 'v2_capital_projects',
    project_id: 'v2_capital_projects',
  };
  const routes: Record<string, Record<string, string>> = {
    v2: {
      assets: 'v2_assets',
      'asset-markets': 'v2_asset_markets',
      plans: 'v2_plan_versions',
      engagements: 'v2_engagements',
      subscriptions: 'v2_subscription_periods',
      'rate-cards': 'v2_rate_cards',
    },
    'v2-estates': {
      conditions: 'v2_asset_conditions',
      'preventive-plans': 'v2_preventive_plans',
      plans: 'v2_preventive_plans',
      obligations: 'v2_compliance_obligations',
      evidence: 'v2_compliance_evidence',
      'compliance-evidence': 'v2_compliance_evidence',
      actions: 'v2_compliance_actions',
      risks: 'v2_asset_risks',
    },
    'v2-maintenance': {
      tasks: 'v2_maintenance_tasks',
      assignments: 'v2_task_assignments',
      allocations: 'v2_resource_allocations',
      evidence: 'v2_task_evidence',
      time: 'v2_time_entries',
      costs: 'v2_external_costs',
    },
    'v2-sectors': {
      packs: 'v2_sector_packs',
      clearances: 'v2_sector_module_clearances',
      rollouts: 'v2_sector_rollouts',
      records: 'v2_sector_records',
    },
    'v2-intelligence': {
      programmes: 'v2_capital_programmes',
      projects: 'v2_capital_projects',
      milestones: 'v2_capital_milestones',
      commitments: 'v2_capital_commitments',
      forecasts: 'v2_capital_forecasts',
    },
  };
  const seen = new Set<string>();
  async function record(table: string, id: unknown) {
    if (typeof id !== 'string' || !id || seen.has(table + ':' + id)) return;
    assert(seen.size < 50, 422, 'CONTEXT_DEPTH', 'The operational context requires review.');
    seen.add(table + ':' + id);
    const row = await statement(env.DB, `SELECT * FROM ${table} WHERE id=?`, id).first<
      Record<string, unknown>
    >();
    if (row) await context(row);
  }
  async function context(row: Record<string, unknown>) {
    for (const field of ['marketCode', 'market_code'])
      if (row[field] !== undefined)
        assert(
          row[field] === 'RES',
          410,
          'SECTOR_RETIRED',
          'Only Residential operations are available.',
        );
    for (const field of ['planId', 'plan_id', 'packId', 'pack_id', 'moduleCode', 'module_code'])
      if (typeof row[field] === 'string' && /^[A-Z]{3}[:_-]/.test(row[field]))
        assert(row[field].startsWith('RES'), 410, 'SECTOR_RETIRED', 'This product is retired.');
    assert(
      !row.schemeId && !row.scheme_id,
      410,
      'SECTOR_RETIRED',
      'New Strata operations are retired.',
    );
    const propertyId = row.propertyId ?? row.property_id;
    if (typeof propertyId === 'string') {
      const property = await statement(
        env.DB,
        'SELECT sector FROM properties WHERE id=?',
        propertyId,
      ).first<{ sector: string }>();
      if (property) requireResidentialSector(property.sector);
    }
    for (const [field, table] of Object.entries(relations)) await record(table, row[field]);
  }
  let parts: string[];
  try {
    parts = decodeURIComponent(path).split('/');
  } catch {
    assert(false, 422, 'CONTEXT_INVALID', 'Invalid operational context.');
  }
  const index = parts.findIndex((part) => Object.hasOwn(routes, part));
  if (index >= 0) {
    const [family, area, id] = parts.slice(index);
    if (family === 'v2' && area === 'markets' && id)
      assert(id === 'RES', 410, 'SECTOR_RETIRED', 'Only Residential markets can be activated.');
    if (id && /^[A-Z]{3}[:_-]/.test(id))
      assert(id.startsWith('RES'), 410, 'SECTOR_RETIRED', 'This product is retired.');
    const table = routes[family][area];
    if (table) await record(table, id);
  }
  await context(input);
}
