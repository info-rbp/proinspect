import { z } from 'zod';
import { statement, assert, now, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import {
  propertyAccess,
  booksServices,
  operationsWrite,
} from '../../../../packages/authorization/server';
import { mailEvent } from '../../../../packages/notifications/server';
import {
  activity,
  projection,
  replay,
  receipt,
  guard,
  clearGuard,
  recordId,
  isoDate,
  version,
  dateOnly,
} from '../../../../packages/operations/core';
import { catalogue } from '../services.server';
import { appointmentWindow, availability } from '../scheduler';
import { digest } from '../../../../packages/auth/crypto';
export async function changeBooking(
  env: Env,
  user: Principal,
  w: Workspace,
  id: string,
  input: unknown,
) {
  const d = z
    .object({
      action: z.enum(['cancel', 'reschedule']),
      version,
      requestKey: z.string().min(16).max(100),
      startsAt: isoDate.optional(),
      reason: z.string().trim().min(4).max(1000),
      accessConfirmed: z.boolean().default(false),
    })
    .parse(input);
  assert(
    booksServices(w) || w.kind === 'staff',
    403,
    'BOOKING_FORBIDDEN',
    'This workspace cannot change bookings.',
  );
  if (w.kind === 'staff') operationsWrite(user);
  const b = await statement(env.DB, 'SELECT * FROM bookings WHERE id=?', id).first<
    Record<string, any>
  >();
  assert(
    b && (w.kind === 'staff' || b.client_id === w.scopeId),
    404,
    'BOOKING_NOT_FOUND',
    'Booking not found.',
  );
  await propertyAccess(env, user, w, b.property_id, true);
  const prior = await replay(env, user, `booking:${id}`, d.requestKey, d);
  if (prior.result) return { ...prior.result, replayed: true };
  assert(
    b.version === d.version,
    409,
    'STALE_VERSION',
    'The booking has changed. Reload before saving.',
  );
  assert(
    b.status === 'confirmed' && b.starts_at > now(),
    409,
    'BOOKING_STARTED',
    'Only future confirmed bookings can be changed.',
  );
  const wo = await statement(env.DB, 'SELECT * FROM work_orders WHERE booking_id=?', id).first<
    Record<string, any>
  >();
  assert(
    wo && ['scheduled', 'assigned', 'triage'].includes(wo.status),
    409,
    'WORK_STARTED',
    'This work has started or needs an operational review.',
  );
  const result = {
    id,
    status: d.action === 'cancel' ? 'cancelled' : 'confirmed',
    version: b.version + 1,
  };
  let window = {
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    reservedStart: b.reserved_start,
    reservedEnd: b.reserved_end,
  };
  if (d.action === 'reschedule') {
    assert(
      d.startsAt && d.accessConfirmed,
      422,
      'ACCESS_RECONFIRMATION_REQUIRED',
      'Confirm new access arrangements before rescheduling.',
    );
    const service = (await catalogue(env)).find((s) => s.id === b.service_id);
    assert(service, 409, 'SERVICE_UNAVAILABLE', 'This service requires an operational review.');
    window = appointmentWindow(service, d.startsAt);
  }
  const original = await statement(env.DB, 'SELECT email FROM users WHERE id=?', b.user_id).first<{
    email: string;
  }>();
  const statements = [
    statement(
      env.DB,
      "UPDATE bookings SET status=?,starts_at=?,ends_at=?,reserved_start=?,reserved_end=?,version=version+1 WHERE id=? AND version=? AND status='confirmed' AND starts_at>?",
      result.status,
      window.startsAt,
      window.endsAt,
      window.reservedStart,
      window.reservedEnd,
      id,
      d.version,
      now(),
    ),
    guard(env),
    statement(
      env.DB,
      'UPDATE work_orders SET status=?,assigned_staff_id=NULL,version=version+1,updated_at=? WHERE id=? AND version=?',
      d.action === 'cancel' ? 'cancelled' : 'scheduled',
      now(),
      wo.id,
      wo.version,
    ),
    guard(env),
    statement(env.DB, 'DELETE FROM tenant_inspections WHERE booking_id=?', id),
    activity(
      env,
      user,
      `booking.${d.action === 'cancel' ? 'cancelled' : 'rescheduled'}`,
      'booking',
      id,
      b.property_id,
      b.scheme_id,
      { reason: d.reason, startsAt: window.startsAt, tenantPublicationReset: true },
    ),
    projection(env, 'booking.updated', id, {
      reference: b.reference,
      status: result.status,
      propertyId: b.property_id,
      startsAt: window.startsAt,
    }),
    receipt(env, user, `booking:${id}`, d.requestKey, prior.fingerprint, result),
    clearGuard(env),
  ];
  if (original)
    statements.push(
      await mailEvent(env, 'booking.changed', {
        to: original.email,
        subject: `Booking updated: ${b.reference}`,
        heading: 'Your appointment has changed',
        body:
          d.action === 'cancel'
            ? 'Your booking is cancelled. Any payment adjustment is reviewed separately.'
            : 'Your new appointment is recorded. Tenant inspection information must be republished after confirming the updated notice and access arrangements.',
        href: `${env.APP_ORIGIN}/workspaces`,
        facts: { Reference: b.reference, Status: result.status },
      }),
    );
  await env.DB.batch(statements);
  return result;
}
export async function bulkBook(env: Env, user: Principal, w: Workspace, input: unknown) {
  assert(
    w.kind === 'property-manager' || w.kind === 'commercial',
    403,
    'PORTFOLIO_REQUIRED',
    'Bulk booking is available to professional portfolios.',
  );
  const d = z
    .object({
      propertyIds: z.array(recordId).min(1).max(20),
      serviceId: recordId,
      date: dateOnly,
      requestKey: z.string().min(16).max(70),
      access: z.object({
        method: z.enum(['tenant', 'owner', 'agent', 'lockbox', 'other']),
        instructions: z.string().max(3000),
        noticeConfirmed: z.literal(true),
      }),
    })
    .parse(input);
  assert(
    new Set(d.propertyIds).size === d.propertyIds.length,
    422,
    'DUPLICATE_PROPERTY',
    'Select each property only once.',
  );
  for (const id of d.propertyIds) await propertyAccess(env, user, w, id, true);
  const fingerprint = await digest(JSON.stringify(d));
  const run = await statement(
    env.DB,
    'SELECT id,fingerprint,user_id FROM bulk_booking_runs WHERE client_id=? AND request_key=?',
    w.scopeId,
    d.requestKey,
  ).first<Record<string, any>>();
  if (run)
    assert(
      run.fingerprint === fingerprint && run.user_id === user.id,
      409,
      'IDEMPOTENCY_MISMATCH',
      'The batch key belongs to a different submission.',
    );
  else
    await statement(
      env.DB,
      'INSERT INTO bulk_booking_runs(id,client_id,user_id,request_key,fingerprint,created_at) VALUES(?,?,?,?,?,?)',
      uid('bulk'),
      w.scopeId,
      user.id,
      d.requestKey,
      fingerprint,
      now(),
    ).run();
  const results = [];
  for (const [index, propertyId] of d.propertyIds.entries()) {
    const requestKey = `${d.requestKey}_${index}`;
    const existing = await statement(
      env.DB,
      'SELECT id,reference FROM bookings WHERE client_id=? AND request_key=?',
      w.scopeId,
      requestKey,
    ).first();
    if (existing) {
      results.push({ propertyId, ok: true, ...existing, replayed: true });
      continue;
    }
    const slots = await availability(env, d.serviceId, d.date);
    const first = slots.slots[0];
    if (!first) {
      results.push({
        propertyId,
        ok: false,
        message:
          'No remaining capacity on this date. Existing successful bookings remain confirmed.',
      });
      continue;
    }
    const response = await env.SCHEDULER.get(env.SCHEDULER.idFromName('default')).fetch(
      new Request('https://scheduler.internal/reserve', {
        method: 'POST',
        body: JSON.stringify({
          userId: user.id,
          clientId: w.scopeId,
          kind: w.kind,
          input: {
            propertyId,
            serviceId: d.serviceId,
            startsAt: first.start,
            requestKey,
            access: d.access,
          },
        }),
      }),
    );
    results.push({ propertyId, ok: response.ok, ...((await response.json()) as object) });
  }
  return {
    results,
    partial: results.some((r) => !r.ok),
    succeeded: results.filter((r) => r.ok).length,
  };
}
