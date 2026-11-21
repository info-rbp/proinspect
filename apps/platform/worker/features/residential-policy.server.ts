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
      !/(?:^|\/)(?:commercial[^/]*|strata[^/]*|schemes|facilities|council[^/]*|amenities|v2-estates|v2-sectors)(?:\/|$)/.test(
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
  for (const key of ['workspaceKind', 'kind'])
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
