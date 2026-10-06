import { assert, statement, now, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import {
  workOrderAccess,
  staffWrite,
  operationsWrite,
} from '../../../../packages/authorization/server';
import { digest, randomToken } from '../../../../packages/auth/crypto';
import { activity, guard, clearGuard } from '../../../../packages/operations/core';
import { issueReport } from '../services.server';
import { verifyHmac } from './finance.server';
export async function signHmac(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return Array.from(
    new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))),
  )
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export async function reportHandoff(env: Env, user: Principal, w: Workspace, workOrderId: string) {
  assert(
    w.kind === 'staff',
    403,
    'STAFF_REQUIRED',
    'Report authoring is restricted to assigned staff.',
  );
  staffWrite(user);
  const o = await workOrderAccess(env, user, w, workOrderId, true);
  assert(
    env.REPORT_TOOL_ORIGIN && env.REPORT_TOOL_SECRET,
    503,
    'REPORT_TOOL_UNCONFIGURED',
    'Report Tool integration is not configured. Manual PDF upload remains available.',
  );
  const target = new URL(env.REPORT_TOOL_ORIGIN);
  assert(
    target.protocol === 'https:' && target.pathname === '/' && !target.username && !target.password,
    503,
    'REPORT_ORIGIN_INVALID',
    'Configure a secure Report Tool origin.',
  );
  const id = uid('handoff'),
    token = randomToken(),
    expiresAt = new Date(Date.now() + 15 * 60000).toISOString();
  const payload = btoa(
    JSON.stringify({
      id,
      token,
      workOrderId: o.id,
      propertyId: o.property_id,
      schemeId: o.scheme_id,
      expiresAt,
      callbackUrl: `${env.APP_ORIGIN}/api/integrations/report-tool/callback`,
    }),
  )
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  await env.DB.batch([
    statement(
      env.DB,
      'INSERT INTO report_handoffs(id,work_order_id,requested_by,token_hash,expires_at,created_at) VALUES(?,?,?,?,?,?)',
      id,
      o.id,
      user.id,
      await digest(token),
      expiresAt,
      now(),
    ),
    activity(
      env,
      user,
      'report_tool.handoff_created',
      'work_order',
      o.id,
      o.property_id,
      o.scheme_id,
    ),
  ]);
  return {
    url: `${target.origin}/proinspect/handoff?payload=${encodeURIComponent(payload)}&signature=${await signHmac(env.REPORT_TOOL_SECRET, payload)}`,
    expiresAt,
  };
}
export async function reportCallback(env: Env, request: Request) {
  assert(
    env.REPORT_TOOL_SECRET,
    503,
    'REPORT_TOOL_UNCONFIGURED',
    'Report integration is not configured.',
  );
  const raw = await request.arrayBuffer();
  assert(
    raw.byteLength <= 11 * 1024 * 1024,
    413,
    'UPLOAD_TOO_LARGE',
    'Report upload exceeds the limit.',
  );
  const time = request.headers.get('x-proinspect-timestamp') ?? '',
    signature = request.headers.get('x-proinspect-signature') ?? '';
  assert(
    /^\d+$/.test(time) && Math.abs(Date.now() / 1000 - Number(time)) <= 300,
    400,
    'SIGNATURE_EXPIRED',
    'Invalid integration timestamp.',
  );
  assert(
    await verifyHmac(env.REPORT_TOOL_SECRET, `${time}.${await digest(raw)}`, signature),
    403,
    'SIGNATURE_INVALID',
    'Invalid integration signature.',
  );
  const form = await new Request(request.url, {
    method: 'POST',
    headers: { 'Content-Type': request.headers.get('Content-Type') ?? '' },
    body: raw,
  }).formData();
  const id = String(form.get('handoffId') ?? ''),
    token = String(form.get('token') ?? '');
  const h = await statement(
    env.DB,
    'SELECT * FROM report_handoffs WHERE id=? AND token_hash=?',
    id,
    await digest(token),
  ).first<Record<string, any>>();
  assert(h, 403, 'HANDOFF_INVALID', 'Report handoff is not valid.');
  const author = await statement(
    env.DB,
    'SELECT u.id,u.email,u.display_name,s.role AS staffRole FROM users u JOIN staff_profiles s ON s.user_id=u.id AND s.active=1 WHERE u.id=? AND u.active=1',
    h.requested_by,
  ).first<Principal>();
  assert(author, 403, 'HANDOFF_REVOKED', 'Report authority is no longer active.');
  const w: Workspace = {
    kind: 'staff',
    scopeId: 'operations',
    name: 'ProInspect operations',
    role: author.staffRole!,
    href: '/w/staff/operations',
  };
  await workOrderAccess(env, author, w, h.work_order_id, true);
  if (h.consumed_at) {
    const file = form.get('file');
    assert(file instanceof File, 422, 'PDF_REQUIRED', 'Choose a PDF.');
    const doc = await statement(
      env.DB,
      'SELECT id,sha256 FROM documents WHERE id=?',
      h.document_id,
    ).first<{ id: string; sha256: string }>();
    assert(
      doc && doc.sha256 === (await digest(await file.arrayBuffer())),
      409,
      'HANDOFF_REPLAY_MISMATCH',
      'This handoff already issued a different report.',
    );
    return { id: doc.id, replayed: true };
  }
  assert(h.expires_at > now(), 403, 'HANDOFF_EXPIRED', 'The report handoff has expired.');
  return issueReport(env, author, w, h.work_order_id, form, { handoffId: id });
}
export async function integrationData(env: Env, user: Principal, w: Workspace) {
  assert(w.kind === 'staff', 403, 'STAFF_REQUIRED', 'Staff access is required.');
  operationsWrite(user);
  return {
    deliveries: (
      await statement(
        env.DB,
        'SELECT id,kind,entity_id,status,attempts,error_code,created_at,sent_at FROM integration_deliveries ORDER BY created_at DESC LIMIT 200',
      ).all()
    ).results,
    mail: (
      await statement(
        env.DB,
        'SELECT id,kind,status,attempts,error_code,created_at,sent_at FROM outbox_events ORDER BY created_at DESC LIMIT 200',
      ).all()
    ).results,
    configured: {
      reportTool: Boolean(env.REPORT_TOOL_ORIGIN && env.REPORT_TOOL_SECRET),
      sheets: Boolean(env.SHEETS_WEBHOOK_URL && env.SHEETS_WEBHOOK_SECRET),
      payments: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
      email: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
    },
  };
}
export async function retryIntegration(env: Env, user: Principal, w: Workspace, id: string) {
  assert(w.kind === 'staff', 403, 'STAFF_REQUIRED', 'Staff access required.');
  operationsWrite(user);
  await env.DB.batch([
    statement(
      env.DB,
      "UPDATE integration_deliveries SET status='pending',attempts=0,available_at=?,lease_token=NULL,lease_until=NULL,error_code=NULL WHERE id=? AND status='failed'",
      now(),
      id,
    ),
    guard(env),
    activity(env, user, 'integration.retry_requested', 'integration_event', id),
    clearGuard(env),
  ]);
  return { ok: true };
}
export async function dispatchIntegrations(env: Env) {
  if (!env.SHEETS_WEBHOOK_URL || !env.SHEETS_WEBHOOK_SECRET) return;
  const url = new URL(env.SHEETS_WEBHOOK_URL);
  assert(
    url.protocol === 'https:' &&
      url.hostname === 'script.google.com' &&
      /^\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url.pathname),
    503,
    'SHEETS_URL_INVALID',
    'Configure an Apps Script execution URL.',
  );
  const pending = (
    await statement(
      env.DB,
      "SELECT id FROM integration_deliveries WHERE status='pending' AND available_at<=? AND attempts<6 AND (lease_until IS NULL OR lease_until<?) ORDER BY created_at LIMIT 5",
      now(),
      now(),
    ).all<{ id: string }>()
  ).results;
  for (const item of pending) {
    const lease = uid('lease'),
      row = await statement(
        env.DB,
        "UPDATE integration_deliveries SET lease_token=?,lease_until=?,attempts=attempts+1 WHERE id=? AND status='pending' AND (lease_until IS NULL OR lease_until<?) RETURNING *",
        lease,
        new Date(Date.now() + 120000).toISOString(),
        item.id,
        now(),
      ).first<Record<string, any>>();
    if (!row) continue;
    try {
      const timestamp = String(Math.floor(Date.now() / 1000)),
        payload = JSON.parse(row.payload_json),
        canonical = [timestamp, row.id, row.kind, row.entity_id, JSON.stringify(payload)].join('.');
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: 1,
          eventId: row.id,
          kind: row.kind,
          entityId: row.entity_id,
          timestamp,
          payload,
          signature: await signHmac(env.SHEETS_WEBHOOK_SECRET, canonical),
        }),
        signal: AbortSignal.timeout(15000),
      });
      assert(response.ok, 502, 'PROJECTION_FAILED', 'Projection failed.');
      const ack = (await response.json()) as any;
      assert(
        ack.ok === true && ack.eventId === row.id,
        502,
        'PROJECTION_ACK_INVALID',
        'Projection acknowledgement did not match.',
      );
      await statement(
        env.DB,
        "UPDATE integration_deliveries SET status='sent',sent_at=?,lease_token=NULL,lease_until=NULL,error_code=NULL WHERE id=? AND lease_token=?",
        now(),
        row.id,
        lease,
      ).run();
    } catch {
      await statement(
        env.DB,
        "UPDATE integration_deliveries SET status=?,available_at=?,lease_token=NULL,lease_until=NULL,error_code='PROJECTION_DELIVERY_FAILED' WHERE id=? AND lease_token=?",
        row.attempts >= 6 ? 'failed' : 'pending',
        new Date(Date.now() + Math.min(3600000, 60000 * 2 ** row.attempts)).toISOString(),
        row.id,
        lease,
      ).run();
    }
  }
}
