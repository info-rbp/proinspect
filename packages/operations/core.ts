import { z } from 'zod';
import { assert, AppError, now, statement, uid, type Env } from '../database/types';
import type { Principal } from '../domain/index';
import { digest } from '../auth/crypto';
export const recordId = z
  .string()
  .regex(/^[a-zA-Z0-9_-]+$/)
  .max(100);
export const version = z.number().int().positive();
export const shortText = z.string().trim().min(2).max(180);
export const reference = z.string().trim().min(4).max(500);
export const isoDate = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s).toISOString());
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);
export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  assert(text.length <= 65536, 413, 'PAYLOAD_TOO_LARGE', 'The submission exceeds the limit.');
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(400, 'INVALID_JSON', 'Invalid request format.');
  }
}
export function guard(env: Env) {
  return statement(env.DB, 'INSERT INTO mutation_guards(changed_rows) VALUES(changes())');
}
export function clearGuard(env: Env) {
  return statement(env.DB, 'DELETE FROM mutation_guards');
}
export function activity(
  env: Env,
  user: Principal,
  action: string,
  type: string,
  entityId: string,
  propertyId: string | null = null,
  schemeId: string | null = null,
  metadata: Record<string, unknown> = {},
) {
  return statement(
    env.DB,
    'INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,property_id,scheme_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    uid('aud'),
    user.id,
    action,
    type,
    entityId,
    propertyId,
    schemeId,
    JSON.stringify(metadata),
    now(),
  );
}
export function projection(
  env: Env,
  kind: string,
  entityId: string,
  payload: Record<string, unknown>,
) {
  // Only an explicit operational allowlist is ever delivered to Sheets. Never PII, access instructions or evidence.
  const safe: Record<string, unknown> = {};
  for (const key of [
    'reference',
    'status',
    'serviceId',
    'propertyId',
    'schemeId',
    'workOrderId',
    'bookingId',
    'documentId',
    'startsAt',
  ])
    if (typeof payload[key] === 'string') safe[key] = payload[key];
  return statement(
    env.DB,
    "INSERT INTO integration_deliveries(id,kind,entity_id,payload_json,status,available_at,created_at) VALUES(?,?,?,?,'pending',?,?)",
    uid('evt'),
    kind,
    entityId,
    JSON.stringify(safe),
    now(),
    now(),
  );
}
export async function replay(
  env: Env,
  user: Principal,
  action: string,
  key: string,
  input: unknown,
) {
  const fingerprint = await digest(JSON.stringify(input));
  const row = await statement(
    env.DB,
    'SELECT fingerprint,result_json FROM action_receipts WHERE user_id=? AND action=? AND request_key=?',
    user.id,
    action,
    key,
  ).first<{ fingerprint: string; result_json: string }>();
  if (row)
    assert(
      row.fingerprint === fingerprint,
      409,
      'IDEMPOTENCY_MISMATCH',
      'The retry key belongs to another submission.',
    );
  return { fingerprint, result: row ? JSON.parse(row.result_json) : null };
}
export function receipt(
  env: Env,
  user: Principal,
  action: string,
  key: string,
  fingerprint: string,
  result: unknown,
) {
  return statement(
    env.DB,
    'INSERT INTO action_receipts(id,user_id,action,request_key,fingerprint,result_json,created_at) VALUES(?,?,?,?,?,?,?)',
    uid('rcp'),
    user.id,
    action,
    key,
    fingerprint,
    JSON.stringify(result),
    now(),
  );
}
export function nextMonthDate(date: string, months: number) {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
export async function boundedFile(form: FormData) {
  const file = form.get('file');
  assert(file instanceof File, 422, 'FILE_REQUIRED', 'Choose a file.');
  assert(
    file.size > 0 && file.size <= 10 * 1024 * 1024,
    413,
    'FILE_SIZE',
    'Files must be smaller than 10 MB.',
  );
  const bytes = await file.arrayBuffer(),
    b = new Uint8Array(bytes),
    pdf = new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
  const mime = pdf
    ? 'application/pdf'
    : b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
      ? 'image/jpeg'
      : b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71
        ? 'image/png'
        : null;
  assert(
    mime && file.type === mime,
    422,
    'FILE_TYPE',
    'Choose a PDF, JPEG or PNG with a matching content type and file signature.',
  );
  return {
    file,
    bytes,
    mime,
    hash: await digest(bytes),
    name: file.name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120),
  };
}
