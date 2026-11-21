import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { build } from 'esbuild';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { Miniflare } from 'miniflare';

const origin = 'https://proinspect-v3-staging.delicate-dream-e4c9.workers.dev';
const issuer = 'https://delicate-dream-e4c9.cloudflareaccess.com';
const audience = 'a'.repeat(64);
const email = 'tester@staging.example';
const { publicKey, privateKey } = await generateKeyPair('RS256');
const key = { ...(await exportJWK(publicKey)), kid: 'staging-test', alg: 'RS256', use: 'sig' };
mkdirSync('artifacts', { recursive: true });
await build({
  entryPoints: ['tests/runtime/staging-signin-entry.ts'],
  outfile: 'artifacts/staging-signin-worker.mjs',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['cloudflare:workers', 'node:*'],
});
const runtime = {
  modules: true,
  scriptPath: 'artifacts/staging-signin-worker.mjs',
  compatibilityDate: '2026-07-01',
  compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: 'isolated-auth' },
  bindings: {
    APP_ENV: 'staging',
    APP_ORIGIN: origin,
    STAGING_ACCESS_AUD: audience,
    DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  },
  outboundService: (request) => {
    assert.equal(request.url, issuer + '/cdn-cgi/access/certs');
    return Response.json({ keys: [key] });
  },
};
const mf = new Miniflare(runtime);
const timestamp = Math.floor(Date.now() / 1000);
const signed = (claims = {}) =>
  new SignJWT({
    type: 'app',
    sub: 'synthetic-tester',
    iat: timestamp,
    exp: timestamp + 600,
    iss: issuer,
    aud: [audience],
    email,
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: key.kid })
    .sign(privateKey);
const confirm = (token, from = origin) =>
  mf.dispatchFetch(origin + '/auth/staging', {
    method: 'POST',
    headers: { Origin: from, ...(token ? { 'Cf-Access-Jwt-Assertion': token } : {}) },
  });
try {
  const db = await mf.getD1Database('DB');
  for (const stmt of JSON.parse(
    execFileSync('python3', ['scripts/schema-statements.py'], { encoding: 'utf8' }),
  ))
    await db.prepare(stmt).run();
  assert.equal((await confirm()).status, 403);
  for (const claims of [
    { aud: ['different-app'] },
    { iss: 'https://invalid.example' },
    { exp: timestamp - 5 },
    { type: 'service_token' },
    { sub: '' },
    { email: 'invalid' },
  ]) {
    assert.equal((await confirm(await signed(claims))).status, 403);
  }
  const token = await signed();
  assert.equal((await confirm(token, 'https://another.example')).status, 403);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM sessions').first()).n, 0);
  const preview = await mf.dispatchFetch(origin + '/auth/staging', {
    headers: { 'Cf-Access-Jwt-Assertion': token },
  });
  assert.equal((await preview.json()).email, email);
  assert.equal(
    (await db.prepare('SELECT COUNT(*) AS n FROM users WHERE email=?').bind(email).first()).n,
    0,
  );
  const result = await confirm(token);
  assert.equal(result.status, 200);
  const cookie = result.headers.get('Set-Cookie');
  assert.match(cookie, /^__Host-proinspect=/);
  for (const name of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/'])
    assert.ok(cookie.includes(name));
  const headers = { Cookie: cookie.split(';')[0], Origin: origin };
  const user = await (await mf.dispatchFetch(origin + '/session', { headers })).json();
  assert.equal(user.email, email);
  assert.equal(user.staffRole, null);
  assert.equal(
    (
      await db
        .prepare('SELECT COUNT(*) AS n FROM client_memberships WHERE user_id=?')
        .bind(user.id)
        .first()
    ).n,
    0,
  );
  const session = await db.prepare('SELECT expires_at FROM sessions').first();
  assert.equal(Date.parse(session.expires_at), (timestamp + 600) * 1000);
  assert.equal(
    (await mf.dispatchFetch(origin + '/logout', { method: 'POST', headers })).status,
    200,
  );
  assert.equal(await (await mf.dispatchFetch(origin + '/session', { headers })).json(), null);
  await db.prepare('UPDATE users SET active=0 WHERE email=?').bind(email).run();
  assert.equal((await confirm(token)).status, 403);
  assert.equal(
    (
      await mf.dispatchFetch('https://other-staging.example/auth/staging', {
        headers: { 'Cf-Access-Jwt-Assertion': token },
      })
    ).status,
    404,
  );
  const production = new Miniflare({
    ...runtime,
    bindings: { ...runtime.bindings, APP_ENV: 'production' },
  });
  try {
    assert.equal(
      (
        await production.dispatchFetch(origin + '/auth/staging', {
          headers: { 'Cf-Access-Jwt-Assertion': token },
        })
      ).status,
      404,
    );
  } finally {
    await production.dispose();
  }
  console.log(
    'PASS staging-only Access identity, email and claim validation, origin, confirmation, session expiry, revocation and role isolation',
  );
} finally {
  await mf.dispose();
}
