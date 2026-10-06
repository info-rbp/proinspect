import { noticeRecipientAllowed } from '../../../../packages/notifications/notice-policy';
import { dispatchDueNotices } from '../../../../packages/notifications/notices';
import { z } from 'zod';
import { assert, statement, now, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import {
  clientAdmin,
  schemeAccess,
  requestAccess,
  workOrderAccess,
  operationsWrite,
  currentTenancy,
} from '../../../../packages/authorization/server';
import {
  recordId,
  shortText,
  reference,
  isoDate,
  version,
  activity,
  projection,
  guard,
  clearGuard,
  replay,
  receipt,
} from '../../../../packages/operations/core';
import { addressKey } from '../../../../packages/validation/index';
import { createRequest } from '../services.server';
export async function createScheme(env: Env, user: Principal, w: Workspace, input: unknown) {
  assert(
    w.kind === 'strata-manager',
    403,
    'STRATA_MANAGER_REQUIRED',
    'Create schemes from the Strata Manager workspace.',
  );
  await clientAdmin(env, user, w);
  const d = z
    .object({
      name: shortText,
      schemeNumber: shortText,
      address: z.string().min(5).max(180),
      suburb: shortText,
      postcode: z.string().regex(/^\d{4}$/),
      authorityReference: reference,
      validUntil: isoDate,
    })
    .parse(input);
  assert(d.validUntil > now(), 422, 'AUTHORITY_EXPIRED', 'Record a current management authority.');
  assert(
    !(await statement(
      env.DB,
      'SELECT id FROM strata_schemes WHERE scheme_number=?',
      d.schemeNumber,
    ).first()),
    409,
    'SCHEME_REVIEW_REQUIRED',
    'This scheme already exists and requires relationship review.',
  );
  const key = addressKey(d.address, d.suburb, d.postcode);
  assert(
    !(await statement(env.DB, 'SELECT id FROM properties WHERE address_key=?', key).first()),
    409,
    'PROPERTY_REVIEW_REQUIRED',
    'This property already exists and must be linked through an authorised review.',
  );
  const id = uid('scheme'),
    propertyId = uid('prop'),
    buildingId = uid('building'),
    time = now();
  await env.DB.batch([
    statement(
      env.DB,
      'INSERT INTO strata_schemes(id,name,scheme_number,created_at) VALUES(?,?,?,?)',
      id,
      d.name,
      d.schemeNumber,
      time,
    ),
    statement(
      env.DB,
      "INSERT INTO properties(id,address,suburb,postcode,address_key,sector,property_type,created_at) VALUES(?,?,?,?,?,'strata-building','Building',?)",
      propertyId,
      d.address,
      d.suburb,
      d.postcode,
      key,
      time,
    ),
    statement(
      env.DB,
      "INSERT INTO scheme_buildings(id,scheme_id,name,property_id) VALUES(?,?,'Main building',?)",
      buildingId,
      id,
      propertyId,
    ),
    statement(
      env.DB,
      "INSERT INTO scheme_client_links(id,scheme_id,client_id,role,starts_at,ends_at) VALUES(?,?,?,'strata_manager',?,?)",
      uid('scl'),
      id,
      w.scopeId,
      time,
      d.validUntil,
    ),
    statement(
      env.DB,
      'INSERT INTO scheme_authority_profiles(scheme_id,client_id,spending_limit_cents,authority_reference,valid_until) VALUES(?,?,0,?,?)',
      id,
      w.scopeId,
      d.authorityReference,
      d.validUntil,
    ),
    activity(env, user, 'scheme.created', 'scheme', id, propertyId, id, {
      authorityReference: d.authorityReference,
    }),
    projection(env, 'scheme.created', id, { schemeId: id }),
  ]);
  return { id, propertyId, buildingId };
}
export async function schemeStructure(
  env: Env,
  user: Principal,
  w: Workspace,
  schemeId: string,
  input: unknown,
) {
  await schemeAccess(env, user, w, schemeId, true);
  const d = z
    .object({
      kind: z.enum(['area', 'lot', 'building']),
      name: z.string().trim().min(1).max(180),
      buildingId: recordId.optional(),
      propertyId: recordId.optional(),
    })
    .parse(input);
  assert(
    d.kind === 'lot' || d.name.length >= 2,
    422,
    'NAME_REQUIRED',
    'Use a descriptive building or area name.',
  );
  if (d.buildingId)
    assert(
      await statement(
        env.DB,
        'SELECT id FROM scheme_buildings WHERE id=? AND scheme_id=?',
        d.buildingId,
        schemeId,
      ).first(),
      422,
      'BUILDING_MISMATCH',
      'Choose a building in this scheme.',
    );
  if (d.propertyId) {
    assert(
      w.kind === 'staff',
      403,
      'CANONICAL_LINK_REVIEW',
      'Existing property-to-lot links require Staff verification.',
    );
    operationsWrite(user);
    assert(
      await statement(env.DB, 'SELECT id FROM properties WHERE id=?', d.propertyId).first(),
      422,
      'PROPERTY_NOT_FOUND',
      'Property not found.',
    );
  }
  const id = uid(d.kind),
    s =
      d.kind === 'area'
        ? statement(
            env.DB,
            'INSERT INTO common_property_areas(id,scheme_id,building_id,name) VALUES(?,?,?,?)',
            id,
            schemeId,
            d.buildingId ?? null,
            d.name,
          )
        : d.kind === 'lot'
          ? statement(
              env.DB,
              'INSERT INTO strata_lots(id,scheme_id,lot_number,building_id,property_id) VALUES(?,?,?,?,?)',
              id,
              schemeId,
              d.name,
              d.buildingId ?? null,
              d.propertyId ?? null,
            )
          : statement(
              env.DB,
              'INSERT INTO scheme_buildings(id,scheme_id,name,property_id) VALUES(?,?,?,?)',
              id,
              schemeId,
              d.name,
              d.propertyId ?? null,
            );
  await env.DB.batch([
    s,
    activity(env, user, 'scheme.structure_added', d.kind, id, null, schemeId),
  ]);
  return { id };
}
export async function schemeData(env: Env, user: Principal, w: Workspace, schemeId: string) {
  const scheme = await schemeAccess(env, user, w, schemeId),
    manager = ['staff', 'strata-manager'].includes(w.kind),
    council = w.kind === 'council';
  const buildings = (
    await statement(
      env.DB,
      'SELECT id,name,property_id FROM scheme_buildings WHERE scheme_id=? ORDER BY name',
      schemeId,
    ).all()
  ).results;
  const areas = (
    await statement(
      env.DB,
      'SELECT id,building_id,name FROM common_property_areas WHERE scheme_id=? ORDER BY name',
      schemeId,
    ).all()
  ).results;
  const lots = (
    await statement(
      env.DB,
      `SELECT l.id,l.lot_number,l.building_id,${manager ? 'l.property_id' : 'NULL AS property_id'} FROM strata_lots l WHERE l.scheme_id=? ${manager ? '' : 'AND EXISTS(SELECT 1 FROM scheme_memberships m WHERE m.lot_id=l.id AND m.user_id=? AND m.starts_at<=? AND (m.ends_at IS NULL OR m.ends_at>?))'} ORDER BY l.lot_number`,
      schemeId,
      ...(manager ? [] : [user.id, now(), now()]),
    ).all()
  ).results;
  const members = manager
    ? (
        await statement(
          env.DB,
          'SELECT m.id,m.lot_id,m.role,m.starts_at,m.ends_at,u.display_name,u.email FROM scheme_memberships m JOIN users u ON u.id=m.user_id WHERE m.scheme_id=? ORDER BY u.display_name',
          schemeId,
        ).all()
      ).results
    : [];
  const notices = (
    await statement(
      env.DB,
      `SELECT * FROM building_notices WHERE scheme_id=? ${manager ? '' : 'AND withdrawn_at IS NULL AND starts_at<=? AND (expires_at IS NULL OR expires_at>?)'} ORDER BY starts_at DESC LIMIT 100`,
      schemeId,
      ...(manager ? [] : [now(), now()]),
    ).all<Record<string, any>>()
  ).results;
  const visible = [];
  for (const n of notices) {
    if (manager) {
      visible.push(n);
      continue;
    }
    if (
      await noticeRecipientAllowed(
        env,
        n.id,
        n.version,
        user.id,
        w.kind === 'council' ? 'council' : 'building',
      )
    )
      visible.push(n);
  }
  const works = (
    await statement(
      env.DB,
      `SELECT id,reference,${manager || council ? 'title' : 'public_summary AS title'},status,priority,scheduled_at,resident_visible,public_summary,version FROM work_orders WHERE scheme_id=? ${manager || council ? '' : 'AND resident_visible=1'} ORDER BY updated_at DESC LIMIT 100`,
      schemeId,
    ).all()
  ).results;
  const issues = (
    await statement(
      env.DB,
      `SELECT id,reference,title,category,priority,status,created_at,version FROM requests WHERE scheme_id=? ${manager ? '' : council ? "AND source='building' AND category!='complaint'" : 'AND created_by=?'} ORDER BY created_at DESC LIMIT 100`,
      schemeId,
      ...(!manager && !council ? [user.id] : []),
    ).all()
  ).results;
  const authority = manager
    ? (
        await statement(
          env.DB,
          'SELECT client_id,spending_limit_cents,authority_reference,valid_until FROM scheme_authority_profiles WHERE scheme_id=?',
          schemeId,
        ).all()
      ).results
    : [];
  return { scheme, buildings, areas, lots, members, notices: visible, works, issues, authority };
}
export async function buildingRequest(
  env: Env,
  user: Principal,
  w: Workspace,
  schemeId: string,
  input: unknown,
) {
  await schemeAccess(env, user, w, schemeId);
  const d = z
    .object({
      title: shortText,
      details: z.string().min(10).max(5000),
      locationKind: z.enum(['common', 'lot', 'unsure']),
      areaId: recordId.optional(),
      lotId: recordId.optional(),
      priority: z.enum(['routine', 'urgent', 'emergency']).default('routine'),
      category: z.enum(['maintenance', 'access', 'move', 'other']).default('maintenance'),
    })
    .parse(input);
  assert(
    ['building', 'council', 'strata-manager', 'staff'].includes(w.kind),
    403,
    'BUILDING_REQUIRED',
    'Use an authorised building workspace.',
  );
  if (d.areaId)
    assert(
      await statement(
        env.DB,
        'SELECT id FROM common_property_areas WHERE id=? AND scheme_id=?',
        d.areaId,
        schemeId,
      ).first(),
      422,
      'AREA_MISMATCH',
      'Choose an area in this scheme.',
    );
  if (d.lotId) {
    const lot = await statement(
      env.DB,
      'SELECT id,property_id FROM strata_lots WHERE id=? AND scheme_id=?',
      d.lotId,
      schemeId,
    ).first<{ id: string; property_id: string | null }>();
    assert(lot, 422, 'LOT_MISMATCH', 'Choose a lot in this scheme.');
    if (['building', 'council'].includes(w.kind))
      assert(
        await statement(
          env.DB,
          'SELECT id FROM scheme_memberships WHERE lot_id=? AND user_id=? AND starts_at<=? AND (ends_at IS NULL OR ends_at>?)',
          d.lotId,
          user.id,
          now(),
          now(),
        ).first(),
        403,
        'LOT_FORBIDDEN',
        'You are not authorised for this lot.',
      );
    if (d.locationKind === 'lot' && lot.property_id && w.kind === 'building') {
      const t = await statement(
        env.DB,
        "SELECT t.id FROM tenancies t JOIN tenancy_memberships m ON m.tenancy_id=t.id WHERE t.property_id=? AND m.user_id=? AND t.status='active' AND t.starts_at<=? AND (t.ends_at IS NULL OR t.ends_at>?) AND m.starts_at<=? AND (m.ends_at IS NULL OR m.ends_at>?)",
        lot.property_id,
        user.id,
        now(),
        now(),
        now(),
        now(),
      ).first<{ id: string }>();
      if (t) {
        const result = await createRequest(
          env,
          user,
          {
            kind: 'tenant',
            scopeId: t.id,
            name: 'My tenancy',
            role: 'tenant',
            href: `/w/tenant/${t.id}`,
          },
          { title: d.title, details: d.details, priority: d.priority, category: 'maintenance' },
        );
        return { ...result, routedTo: 'tenancy', href: `/w/tenant/${t.id}/requests` };
      }
    }
  }
  const manager = await statement(
    env.DB,
    "SELECT client_id FROM scheme_client_links WHERE scheme_id=? AND role='strata_manager' AND starts_at<=? AND (ends_at IS NULL OR ends_at>?)",
    schemeId,
    now(),
    now(),
  ).first<{ client_id: string }>();
  const id = uid('req'),
    reference = `BR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    time = now();
  await env.DB.batch([
    statement(
      env.DB,
      "INSERT INTO requests(id,reference,client_id,scheme_id,area_id,lot_id,location_kind,created_by,source,category,title,details,priority,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'building',?,?,?,?,'submitted',?,?)",
      id,
      reference,
      manager?.client_id ?? null,
      schemeId,
      d.areaId ?? null,
      d.lotId ?? null,
      d.locationKind,
      user.id,
      d.category,
      d.title,
      d.details,
      d.priority,
      time,
      time,
    ),
    activity(env, user, 'building.request_created', 'request', id, null, schemeId),
    projection(env, 'building_request.created', id, { reference, status: 'submitted', schemeId }),
  ]);
  return { id, reference, routedTo: 'building' };
}
export async function dispatchBuildingRequest(env: Env, user: Principal, w: Workspace, id: string) {
  const r = await requestAccess(env, user, w, id, true);
  assert(r.scheme_id, 422, 'SCHEME_REQUEST_REQUIRED', 'Select a building request.');
  await schemeAccess(env, user, w, r.scheme_id, true);
  const exists = await statement(
    env.DB,
    'SELECT id FROM work_orders WHERE request_id=?',
    id,
  ).first();
  if (exists) return { ...exists, replayed: true };
  const woId = `wo_${id}`,
    time = now();
  await env.DB.batch([
    statement(
      env.DB,
      "INSERT INTO work_orders(id,reference,request_id,client_id,scheme_id,title,status,priority,created_at,updated_at) VALUES(?,?,?,?,?,?,'triage',?,?,?)",
      woId,
      `WO-${r.reference}`,
      id,
      r.client_id,
      r.scheme_id,
      r.title,
      r.priority,
      time,
      time,
    ),
    statement(
      env.DB,
      "UPDATE requests SET status='under_review',version=version+1,updated_at=? WHERE id=? AND version=?",
      time,
      id,
      r.version,
    ),
    guard(env),
    activity(env, user, 'building.attendance_requested', 'work_order', woId, null, r.scheme_id),
    clearGuard(env),
  ]);
  return { id: woId };
}
export async function publishNotice(
  env: Env,
  user: Principal,
  w: Workspace,
  schemeId: string,
  input: unknown,
) {
  await schemeAccess(env, user, w, schemeId, true);
  const d = z
    .object({
      requestKey: z.string().min(16).max(100).optional(),
      emailEnabled: z.boolean().default(false),
      title: shortText,
      body: z.string().trim().min(10).max(5000),
      audience: z.enum(['residents', 'owners', 'council', 'all_members']),
      startsAt: isoDate.optional(),
      expiresAt: isoDate.optional(),
      workOrderId: recordId.optional(),
      buildingId: recordId.optional(),
      lotId: recordId.optional(),
    })
    .parse(input);
  if (d.workOrderId) {
    const o = await workOrderAccess(env, user, w, d.workOrderId);
    assert(o.scheme_id === schemeId, 422, 'WORK_ORDER_MISMATCH', 'Choose work in this scheme.');
  }
  if (d.buildingId)
    assert(
      await statement(
        env.DB,
        'SELECT id FROM scheme_buildings WHERE id=? AND scheme_id=?',
        d.buildingId,
        schemeId,
      ).first(),
      422,
      'BUILDING_MISMATCH',
      'Choose a building in this scheme.',
    );
  if (d.lotId)
    assert(
      await statement(
        env.DB,
        'SELECT id FROM strata_lots WHERE id=? AND scheme_id=? AND (? IS NULL OR building_id=?)',
        d.lotId,
        schemeId,
        d.buildingId ?? null,
        d.buildingId ?? null,
      ).first(),
      422,
      'LOT_MISMATCH',
      'Choose a lot in the selected building.',
    );
  const start = d.startsAt ?? now();
  assert(
    !d.expiresAt || d.expiresAt > start,
    422,
    'NOTICE_DATES',
    'Expiry must be after publication.',
  );
  const saved = d.requestKey ? await replay(env, user, 'notice.publish', d.requestKey, d) : null;
  if (saved?.result) return { ...saved.result, replayed: true };
  const id = uid('notice');
  await env.DB.batch([
    statement(
      env.DB,
      'INSERT INTO building_notices(id,scheme_id,title,body,audience,starts_at,expires_at,created_by,work_order_id,building_id,lot_id,email_enabled) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
      id,
      schemeId,
      d.title,
      d.body,
      d.audience,
      start,
      d.expiresAt ?? null,
      user.id,
      d.workOrderId ?? null,
      d.buildingId ?? null,
      d.lotId ?? null,
      Number(d.emailEnabled),
    ),
    activity(env, user, 'building.notice_published', 'notice', id, null, schemeId, {
      audience: d.audience,
    }),
    projection(env, 'building_notice.published', id, { schemeId }),
    ...(saved && d.requestKey
      ? [receipt(env, user, 'notice.publish', d.requestKey, saved.fingerprint, { id })]
      : []),
  ]);
  await dispatchDueNotices(env).catch(() => console.error('notice.fanout_deferred'));
  return { id };
}
export async function publicWork(
  env: Env,
  user: Principal,
  w: Workspace,
  id: string,
  input: unknown,
) {
  const o = await workOrderAccess(env, user, w, id, true);
  assert(o.scheme_id, 422, 'SCHEME_WORK_REQUIRED', 'Select building work.');
  await schemeAccess(env, user, w, o.scheme_id, true);
  const d = z
    .object({
      version,
      residentVisible: z.boolean(),
      summary: z.string().trim().min(4).max(1000),
      scheduledAt: isoDate.optional(),
      contractorId: recordId.optional(),
    })
    .parse(input);
  if (d.contractorId)
    assert(
      await statement(
        env.DB,
        'SELECT id FROM contractors WHERE id=? AND active=1',
        d.contractorId,
      ).first(),
      422,
      'CONTRACTOR_INVALID',
      'Choose an active contractor.',
    );
  if (o.booking_id && d.scheduledAt) {
    const b = await statement(
      env.DB,
      'SELECT starts_at FROM bookings WHERE id=?',
      o.booking_id,
    ).first<{ starts_at: string }>();
    assert(
      b?.starts_at === d.scheduledAt,
      422,
      'BOOKING_TIME_MISMATCH',
      'Use the confirmed booking time for public works information.',
    );
  }
  await env.DB.batch([
    statement(
      env.DB,
      'UPDATE work_orders SET resident_visible=?,public_summary=?,scheduled_at=?,contractor_id=COALESCE(?,contractor_id),version=version+1,updated_at=? WHERE id=? AND version=?',
      d.residentVisible ? 1 : 0,
      d.summary,
      d.scheduledAt ?? null,
      d.contractorId ?? null,
      now(),
      id,
      d.version,
    ),
    guard(env),
    activity(
      env,
      user,
      'work_order.public_information_updated',
      'work_order',
      id,
      o.property_id,
      o.scheme_id,
    ),
    clearGuard(env),
  ]);
  return { ok: true };
}
export async function endSchemeMembership(
  env: Env,
  user: Principal,
  w: Workspace,
  schemeId: string,
  id: string,
) {
  await schemeAccess(env, user, w, schemeId, true);
  await env.DB.batch([
    statement(
      env.DB,
      'UPDATE scheme_memberships SET ends_at=? WHERE id=? AND scheme_id=? AND (ends_at IS NULL OR ends_at>?)',
      now(),
      id,
      schemeId,
      now(),
    ),
    guard(env),
    activity(env, user, 'scheme.membership_ended', 'scheme_membership', id, null, schemeId),
    clearGuard(env),
  ]);
  return { ok: true };
}
