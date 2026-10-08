import type { Env } from '../database/types';
import { assert, statement, now, uid } from '../database/types';
import { digest, randomToken } from './crypto';
import { safeReturnTo, type Principal } from '../domain/index';
import { signInSchema, email as emailSchema } from '../validation/index';
import { mailEvent } from '../notifications/server';

export function isLocal(request: Request, env: Env) {
  return (
    env.APP_ENV === 'local' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname)
  );
}
export function requireOrigin(request: Request, env: Env) {
  const origin = request.headers.get('Origin');
  const expected = isLocal(request, env) ? new URL(request.url).origin : env.APP_ORIGIN;
  assert(origin === expected, 403, 'INVALID_ORIGIN', 'Please reload the page before trying again.');
}
function cookieName(request: Request, env: Env) {
  return isLocal(request, env) ? 'proinspect_local' : '__Host-proinspect';
}
function cookieValue(request: Request, env: Env) {
  return request.headers
    .get('Cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName(request, env) + '='))
    ?.split('=')[1];
}
export async function currentSessionHash(request: Request, env: Env) {
  const value = cookieValue(request, env);
  return value && /^[a-f0-9]{64}$/.test(value) ? digest(value) : null;
}
export async function principal(request: Request, env: Env): Promise<Principal | null> {
  const value = cookieValue(request, env);
  if (!value || !/^[a-f0-9]{64}$/.test(value)) return null;
  return statement(
    env.DB,
    `SELECT u.id,u.email,u.display_name,sp.role AS staffRole FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN staff_profiles sp ON sp.user_id=u.id AND sp.active=1 WHERE s.token_hash=? AND s.expires_at>? AND s.revoked_at IS NULL AND u.active=1`,
    await digest(value),
    now(),
  ).first<Principal>();
}
export async function requireUser(request: Request, env: Env) {
  const user = await principal(request, env);
  assert(user, 401, 'AUTH_REQUIRED', 'Sign in to continue.');
  return user;
}
export function sessionCookie(request: Request, env: Env, token: string, clear = false) {
  return `${cookieName(request, env)}=${clear ? '' : token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${clear ? 0 : 86400}${isLocal(request, env) ? '' : '; Secure'}`;
}
async function rateLimit(env: Env, key: string, limit: number) {
  const expires = new Date(Date.now() + 900000).toISOString();
  const current = now();
  const count = await statement(
    env.DB,
    `INSERT INTO auth_rate_limits(bucket,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN expires_at<? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`,
    await digest(`${env.DATA_ENCRYPTION_KEY}:rate:${key}`),
    expires,
    current,
    current,
  ).first<{ attempts: number }>();
  assert(
    count && count.attempts <= limit,
    429,
    'RATE_LIMITED',
    'Too many attempts. Please try again later.',
  );
}
export async function beginSignIn(request: Request, env: Env, input: unknown) {
  requireOrigin(request, env);
  const data = signInSchema.parse(input);
  assert(
    env.DATA_ENCRYPTION_KEY,
    503,
    'AUTH_CONFIGURATION_REQUIRED',
    'Sign-in is not configured yet.',
  );
  if (!isLocal(request, env)) {
    assert(
      env.TURNSTILE_SECRET_KEY && data.turnstile,
      503,
      'TURNSTILE_REQUIRED',
      'Complete the security check to continue.',
    );
    await rateLimit(env, `ip:${request.headers.get('CF-Connecting-IP') ?? 'unknown'}`, 20);
    const check = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: data.turnstile }),
      signal: AbortSignal.timeout(10000),
    });
    const verified = (await check.json()) as { success: boolean; hostname?: string };
    assert(
      verified.success && verified.hostname === new URL(env.APP_ORIGIN).hostname,
      403,
      'SECURITY_CHECK_FAILED',
      'The security check has expired. Please try again.',
    );
    assert(
      env.EMAIL_PROVIDER === 'resend' && env.RESEND_API_KEY && env.EMAIL_FROM,
      503,
      'EMAIL_NOT_CONFIGURED',
      'Sign-in email delivery is not configured yet.',
    );
  }
  await rateLimit(env, `email:${data.email}`, 5);
  const generic = {
    message: 'Check your email for a secure sign-in link. The link expires in 15 minutes.',
  };
  if (env.APP_ENV === 'staging' && data.email !== env.EMAIL_SINK?.toLowerCase()) return generic;
  const token = randomToken();
  const tokenHash = await digest(token);
  const created = now();
  const expires = new Date(Date.now() + 900000).toISOString();
  const returnTo = safeReturnTo(data.returnTo);
  const origin = isLocal(request, env) ? new URL(request.url).origin : env.APP_ORIGIN;
  const href = `${origin}/auth/complete?token=${token}`;
  await env.DB.batch([
    statement(
      env.DB,
      'INSERT INTO login_tokens(token_hash,email,expires_at,return_to,created_at) VALUES(?,?,?,?,?)',
      tokenHash,
      data.email,
      expires,
      returnTo,
      created,
    ),
    await mailEvent(env, 'auth.signin', {
      to: data.email,
      subject: 'Sign in to ProInspect',
      heading: 'Your secure sign-in link',
      body: 'Use this one-time link to sign in. It expires in 15 minutes. If you did not request it, ignore this email.',
      href,
      sensitive: true,
    }),
  ]);
  return isLocal(request, env) ? { ...generic, localSignInUrl: href } : generic;
}
export async function completeSignIn(
  request: Request,
  env: Env,
  input: { email: unknown; token: unknown },
) {
  requireOrigin(request, env);
  const email = emailSchema.parse(input.email);
  assert(
    typeof input.token === 'string' && /^[a-f0-9]{64}$/.test(input.token),
    400,
    'INVALID_LINK',
    'The sign-in link is invalid or has expired.',
  );
  await rateLimit(env, `verify:${email}`, 10);
  const record = await statement(
    env.DB,
    `UPDATE login_tokens SET consumed_at=? WHERE token_hash=? AND email=? AND expires_at>? AND consumed_at IS NULL RETURNING return_to`,
    now(),
    await digest(input.token),
    email,
    now(),
  ).first<{ return_to: string }>();
  assert(
    record,
    400,
    'INVALID_LINK',
    'The sign-in link is invalid or has expired. Request a new link.',
  );
  const user = await statement(
    env.DB,
    `INSERT INTO users(id,email,created_at,verified_at) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET verified_at=COALESCE(users.verified_at,excluded.verified_at) RETURNING id,active`,
    uid('usr'),
    email,
    now(),
    now(),
  ).first<{ id: string; active: number }>();
  assert(user?.active === 1, 403, 'ACCOUNT_DISABLED', 'This account is not active.');
  const token = randomToken();
  await statement(
    env.DB,
    'INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)',
    await digest(token),
    user.id,
    new Date(Date.now() + 86400000).toISOString(),
    now(),
  ).run();
  return { cookie: sessionCookie(request, env, token), returnTo: safeReturnTo(record.return_to) };
}
export async function signOut(request: Request, env: Env) {
  requireOrigin(request, env);
  const value = cookieValue(request, env);
  if (value)
    await statement(
      env.DB,
      'UPDATE sessions SET revoked_at=? WHERE token_hash=?',
      now(),
      await digest(value),
    ).run();
  return sessionCookie(request, env, '', true);
}
