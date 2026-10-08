import { z } from 'zod';
import { assert, statement, now, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import {
  propertyScope,
  booksServices,
  managesProperty,
  workOrderAccess,
  propertyAccess,
} from '../../../../packages/authorization/server';
import { documentScope } from '../../../../packages/authorization/documents';
export const RECORD_TYPES = [
  'properties',
  'bookings',
  'work-orders',
  'requests',
  'documents',
  'schemes',
] as const;
type RecordType = (typeof RECORD_TYPES)[number];
type Source = {
  from: string;
  alias: string;
  where: string;
  values: string[];
  columns: string;
  search: string;
  property?: string;
};
function source(user: Principal, w: Workspace, type: RecordType): Source {
  const scope = propertyScope(user, w),
    time = now();
  const property = (a: string) =>
    `EXISTS(SELECT 1 FROM properties p WHERE p.id=${a}.property_id AND (${scope.sql}))`;
  const scheme = (a: string) =>
    `EXISTS(SELECT 1 FROM scheme_client_links l WHERE l.scheme_id=${a}.scheme_id AND l.client_id=? AND l.role IN('strata_manager','building_manager') AND l.starts_at<=? AND (l.ends_at IS NULL OR l.ends_at>?))`;
  if (type === 'properties') {
    assert(
      managesProperty(w) || w.kind === 'strata-manager' || w.kind === 'staff',
      403,
      'RECORDS_FORBIDDEN',
      'Use your property management workspace.',
    );
    return {
      from: 'properties p',
      alias: 'p',
      where: `p.archived_at IS NULL AND (${scope.sql})`,
      values: scope.values,
      columns: 'p.id,p.address AS title,p.suburb,p.sector AS category,p.property_type,p.created_at',
      search: "p.address || ' ' || p.suburb",
      property: 'p.id',
    };
  }
  if (type === 'documents') {
    const s = documentScope(user, w);
    return {
      from: 'documents d',
      alias: 'd',
      where: s.sql,
      values: s.values,
      columns: 'd.id,d.title,d.status,d.category,d.version,d.created_at,d.property_id,d.scheme_id',
      search: 'd.title',
      property: 'd.property_id',
    };
  }
  if (type === 'schemes') {
    let where = '0=1',
      values: string[] = [];
    if (w.kind === 'staff' && user.staffRole !== 'inspector') where = '1=1';
    else if (w.kind === 'strata-manager') {
      where = scheme('s').replace('s.scheme_id', 's.id');
      values = [w.scopeId, time, time];
    } else if (['building', 'council'].includes(w.kind)) {
      where = 's.id=?';
      values = [w.scopeId];
    } else assert(false, 403, 'RECORDS_FORBIDDEN', 'Scheme records are not available here.');
    return {
      from: 'strata_schemes s',
      alias: 's',
      where,
      values,
      columns: 's.id,s.name AS title,s.scheme_number AS reference,s.created_at',
      search: "s.name || ' ' || COALESCE(s.scheme_number,'')",
    };
  }
  let where = '0=1',
    values: string[] = [],
    a = type === 'requests' ? 'r' : 'wo';
  if (w.kind === 'staff') {
    where =
      user.staffRole === 'inspector'
        ? type === 'requests'
          ? 'EXISTS(SELECT 1 FROM work_orders x WHERE x.request_id=r.id AND x.assigned_staff_id=?)'
          : 'wo.assigned_staff_id=?'
        : '1=1';
    values = user.staffRole === 'inspector' ? [user.id] : [];
  } else if (managesProperty(w)) {
    where = `${a}.client_id=? AND ${property(a)}`;
    values = [w.scopeId, ...scope.values];
    if (type === 'requests')
      where += " AND (r.source='client' OR r.category IN('maintenance','inspection_access'))";
  } else if (w.kind === 'strata-manager') {
    where = scheme(a);
    values = [w.scopeId, time, time];
  } else if (type === 'requests' && w.kind === 'tenant') {
    where = 'r.tenancy_id=? AND r.created_by=?';
    values = [w.scopeId, user.id];
  } else if (type === 'requests' && w.kind === 'building') {
    where = 'r.scheme_id=? AND r.created_by=?';
    values = [w.scopeId, user.id];
  } else if (type === 'requests' && w.kind === 'council') {
    where = "r.scheme_id=? AND r.source='building' AND r.category!='complaint'";
    values = [w.scopeId];
  } else if (type === 'work-orders' && ['building', 'council'].includes(w.kind)) {
    where = `wo.scheme_id=?${w.kind === 'building' ? ' AND wo.resident_visible=1' : ''}`;
    values = [w.scopeId];
  } else
    assert(false, 403, 'RECORDS_FORBIDDEN', 'These records are not available in this workspace.');
  if (type === 'bookings') {
    assert(
      booksServices(w) || w.kind === 'staff',
      403,
      'RECORDS_FORBIDDEN',
      'Bookings require a customer workspace.',
    );
    return {
      from: 'bookings b JOIN work_orders wo ON wo.booking_id=b.id JOIN properties p ON p.id=b.property_id',
      alias: 'b',
      where,
      values,
      columns:
        'b.id,b.reference,p.address AS title,b.starts_at,b.status,b.created_at,b.property_id',
      search: "b.reference || ' ' || p.address",
      property: 'b.property_id',
    };
  }
  if (type === 'requests')
    return {
      from: 'requests r',
      alias: 'r',
      where,
      values,
      columns:
        'r.id,r.reference,r.title,r.status,r.category,r.created_at,r.property_id,r.scheme_id',
      search: "r.reference || ' ' || r.title",
      property: 'r.property_id',
    };
  const title = w.kind === 'building' ? 'wo.public_summary' : 'wo.title';
  return {
    from: 'work_orders wo',
    alias: 'wo',
    where,
    values,
    columns: `wo.id,wo.reference,${title} AS title,wo.status,wo.created_at,wo.property_id,wo.scheme_id`,
    search: `wo.reference || ' ' || COALESCE(${title},'')`,
    property: 'wo.property_id',
  };
}
const cursorSchema = z
  .object({
    v: z.literal(1),
    scope: z.string(),
    type: z.enum(RECORD_TYPES),
    q: z.string(),
    property: z.string(),
    at: z.string().max(40),
    id: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .max(100),
  })
  .strict();
function encode(value: unknown) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
export async function recordPage(env: Env, user: Principal, w: Workspace, url: URL) {
  const type = z.enum(RECORD_TYPES).parse(url.searchParams.get('type') ?? 'documents'),
    q = z
      .string()
      .trim()
      .max(100)
      .parse(url.searchParams.get('q') ?? ''),
    property = z
      .string()
      .regex(/^[A-Za-z0-9_-]*$/)
      .max(100)
      .parse(url.searchParams.get('property') ?? '');
  const s = source(user, w, type),
    where = [`(${s.where})`],
    values: (string | number)[] = [...s.values];
  if (q) {
    where.push(`(${s.search}) LIKE ? ESCAPE '\\'`);
    values.push('%' + q.replace(/[\\%_]/g, '\\$&') + '%');
  }
  if (property) {
    assert(
      s.property,
      422,
      'FILTER_NOT_AVAILABLE',
      'This record type cannot be filtered by property.',
    );
    where.push(`${s.property}=?`);
    values.push(property);
  }
  const count = await statement(
      env.DB,
      `SELECT COUNT(*) AS total FROM ${s.from} WHERE ${where.join(' AND ')}`,
      ...values,
    ).first<{ total: number }>(),
    after = url.searchParams.get('after');
  if (after) {
    let cursor;
    try {
      assert(after.length < 1600, 422, 'CURSOR_INVALID', 'Restart from the first page.');
      cursor = cursorSchema.parse(
        JSON.parse(
          new TextDecoder().decode(
            Uint8Array.from(atob(after.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
              c.charCodeAt(0),
            ),
          ),
        ),
      );
    } catch {
      assert(false, 422, 'CURSOR_INVALID', 'Restart from the first page.');
    }
    assert(
      cursor.scope === w.href &&
        cursor.type === type &&
        cursor.q === q &&
        cursor.property === property,
      422,
      'CURSOR_CONTEXT',
      'Restart pagination after changing workspace or filters.',
    );
    where.push(`(${s.alias}.created_at<? OR (${s.alias}.created_at=? AND ${s.alias}.id<?))`);
    values.push(cursor.at, cursor.at, cursor.id);
  }
  const rows = (
      await statement(
        env.DB,
        `SELECT ${s.columns} FROM ${s.from} WHERE ${where.join(' AND ')} ORDER BY ${s.alias}.created_at DESC,${s.alias}.id DESC LIMIT 26`,
        ...values,
      ).all<Record<string, any>>()
    ).results,
    items = rows.slice(0, 25),
    last = items.at(-1);
  return {
    type,
    q,
    property,
    total: count?.total ?? 0,
    items,
    next:
      rows.length > 25 && last
        ? encode({ v: 1, scope: w.href, type, q, property, at: last.created_at, id: last.id })
        : null,
  };
}
export async function operationalReport(env: Env, user: Principal, w: Workspace) {
  assert(
    booksServices(w) ||
      w.kind === 'council' ||
      (w.kind === 'staff' && user.staffRole !== 'inspector'),
    403,
    'REPORT_FORBIDDEN',
    'Operational reporting requires an authorised management workspace.',
  );
  const counts: Record<string, unknown> = {};
  for (const type of ['work-orders', 'requests', 'documents'] as const) {
    const s = source(user, w, type);
    counts[type] = (
      await statement(
        env.DB,
        `SELECT ${s.alias}.status,COUNT(*) AS count FROM ${s.from} WHERE ${s.where} GROUP BY ${s.alias}.status ORDER BY ${s.alias}.status`,
        ...s.values,
      ).all()
    ).results;
  }
  const s = source(user, w, 'work-orders'),
    payments =
      w.kind === 'council'
        ? []
        : (
            await statement(
              env.DB,
              `SELECT pay.status,COUNT(*) AS count,SUM(pay.total_cents) AS total_cents FROM payments pay JOIN work_orders wo ON wo.id=pay.work_order_id WHERE ${s.where} GROUP BY pay.status`,
              ...s.values,
            ).all()
          ).results;
  return {
    generatedAt: now(),
    scope: w.name,
    counts,
    payments,
    currency: 'AUD',
    basis:
      'All authorised records, not the limited dashboard preview. Payment figures are recorded service amounts, not a property accounting statement.',
  };
}
export async function orderDetail(env: Env, user: Principal, w: Workspace, id: string) {
  const o = await workOrderAccess(env, user, w, id),
    p = o.property_id
      ? await statement(
          env.DB,
          'SELECT address,suburb FROM properties WHERE id=?',
          o.property_id,
        ).first<Record<string, any>>()
      : null;
  const resident = w.kind === 'building';
  return {
    order: {
      id: o.id,
      reference: o.reference,
      title: resident ? o.public_summary : o.title,
      status: o.status,
      priority: o.priority,
      version: o.version,
      property_id: o.property_id,
      scheme_id: o.scheme_id,
      booking_id: resident ? null : o.booking_id,
      request_id: resident ? null : o.request_id,
      assigned_staff_id: resident ? null : o.assigned_staff_id,
      created_at: o.created_at,
      updated_at: o.updated_at,
      address: p?.address,
      suburb: p?.suburb,
    },
  };
}
export async function propertyDetail(env: Env, user: Principal, w: Workspace, id: string) {
  return { property: await propertyAccess(env, user, w, id) };
}
export async function bookingDetail(env: Env, user: Principal, w: Workspace, id: string) {
  const s = source(user, w, 'bookings'),
    b = await statement(
      env.DB,
      `SELECT b.id,b.reference,b.version,b.status,b.starts_at,b.ends_at,p.address,sv.name AS service_name FROM ${s.from} JOIN services sv ON sv.id=b.service_id WHERE b.id=? AND (${s.where})`,
      id,
      ...s.values,
    ).first();
  assert(b, 404, 'BOOKING_NOT_FOUND', 'Booking not found in this workspace.');
  return { booking: b };
}
