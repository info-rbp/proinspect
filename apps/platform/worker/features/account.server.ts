import { z } from 'zod';
import { assert, statement, now, type Env } from '../../../../packages/database/types';
import type { Principal } from '../../../../packages/domain/index';
import { currentSessionHash, sessionCookie } from '../../../../packages/auth/server';
import { activity, guard, clearGuard } from '../../../../packages/operations/core';
export async function accountData(request: Request, env: Env, user: Principal) {
  const hash = await currentSessionHash(request, env);
  const sessions = (
    await statement(
      env.DB,
      `SELECT created_at,expires_at,token_hash=? AS current FROM sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY created_at DESC LIMIT 20`,
      hash,
      user.id,
      now(),
    ).all()
  ).results;
  const preferences = await statement(
    env.DB,
    'SELECT report_email,version FROM user_preferences WHERE user_id=?',
    user.id,
  ).first();
  const count = await statement(
    env.DB,
    'SELECT COUNT(*) AS total FROM sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at>?',
    user.id,
    now(),
  ).first<{ total: number }>();
  // Account registration, Stripe billing and booking entitlements are
  // independent. Older Worker versions remain readable during migrations.
  const ready = await statement(env.DB,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='legacy_included_property_grants'").first();
  const propertyPlans = ready ? (await statement(env.DB,`
    SELECT c.id AS client_id,c.client_type,p.id AS property_id,p.address,p.sector,
      COALESCE(pref.account_state,'verified') AS account_status,
      COALESCE(pref.subscription_intent,'none') AS subscription_intent,
      CASE WHEN g.property_id IS NOT NULL THEN 'grandfathered'
           WHEN bl.id IS NOT NULL THEN bl.status ELSE 'none' END AS subscription_status,
      CASE WHEN g.property_id IS NOT NULL THEN 1 ELSE 0 END AS grandfathered,
      CASE WHEN bl.stripe_subscription_id IS NOT NULL THEN 1 ELSE 0 END AS stripe_subscription_recorded
    FROM client_memberships m
    JOIN clients c ON c.id=m.client_id AND c.status='active'
    LEFT JOIN account_subscription_preferences pref ON pref.client_id=c.id
    JOIN client_property_links l ON l.client_id=c.id AND l.ends_at IS NULL
    JOIN properties p ON p.id=l.property_id
    LEFT JOIN legacy_included_property_grants g
      ON g.client_id=c.id AND g.property_id=p.id
    LEFT JOIN stripe_billing_links bl
      ON bl.client_id=c.id AND bl.property_id=p.id AND bl.status NOT IN ('canceled','expired')
    WHERE m.user_id=? AND m.active=1 AND m.role IN ('owner','admin')
    ORDER BY p.address LIMIT 100`,user.id).all()).results : [];
  return {
    user: { id: user.id, email: user.email, display_name: user.display_name },
    sessions,
    activeSessions: count?.total ?? 0,
    accountStatus: 'verified',
    propertyPlans,
    billingAvailable: env.APP_ENV === 'production' && env.RESIDENTIAL_LIVE_BILLING_ENABLED === 'true',
    liveBillingConfigurationPending: env.APP_ENV === 'production' && env.RESIDENTIAL_LIVE_BILLING_ENABLED !== 'true',
    preferences: preferences ?? { report_email: 1, version: 0 },
  };
}
export async function updateAccount(env: Env, user: Principal, input: unknown) {
  const d = z
    .object({
      displayName: z.string().trim().min(1).max(100),
      reportEmail: z.boolean(),
      version: z.number().int().min(0),
    })
    .strict()
    .parse(input);
  await env.DB.batch([
    statement(
      env.DB,
      `INSERT INTO user_preferences(user_id,report_email,version,updated_at) SELECT ?,?,1,? WHERE ?=0 OR EXISTS(SELECT 1 FROM user_preferences WHERE user_id=?) ON CONFLICT(user_id) DO UPDATE SET report_email=excluded.report_email,version=user_preferences.version+1,updated_at=excluded.updated_at WHERE user_preferences.version=?`,
      user.id,
      d.reportEmail ? 1 : 0,
      now(),
      d.version,
      user.id,
      d.version,
    ),
    guard(env),
    statement(env.DB, 'UPDATE users SET display_name=? WHERE id=?', d.displayName, user.id),
    activity(env, user, 'account.updated', 'user', user.id),
    clearGuard(env),
  ]);
  return { ok: true };
}
export async function revokeSessions(request: Request, env: Env, user: Principal, input: unknown) {
  const d = z
      .object({ scope: z.enum(['others', 'all']), confirm: z.literal(true) })
      .strict()
      .parse(input),
    hash = await currentSessionHash(request, env);
  assert(hash, 401, 'AUTH_REQUIRED', 'Sign in again before changing your sessions.');
  await env.DB.batch([
    statement(
      env.DB,
      `UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL ${d.scope === 'others' ? 'AND token_hash!=?' : ''}`,
      now(),
      user.id,
      ...(d.scope === 'others' ? [hash] : []),
    ),
    activity(env, user, 'account.sessions_revoked', 'user', user.id, null, null, {
      scope: d.scope,
    }),
  ]);
  return Response.json(
    { ok: true, signedOut: d.scope === 'all' },
    d.scope === 'all'
      ? { headers: { 'Set-Cookie': sessionCookie(request, env, '', true) } }
      : undefined,
  );
}
