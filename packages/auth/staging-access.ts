import { createRemoteJWKSet, jwtVerify } from 'jose';
import { assert, type Env } from '../database/types';
import { email as emailSchema } from '../validation/index';
import { createVerifiedSession, requireOrigin } from './server';

const origin = 'https://proinspect-v3-staging.delicate-dream-e4c9.workers.dev';
export const STAGING_ACCESS_ISSUER = 'https://delicate-dream-e4c9.cloudflareaccess.com';
const keys = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', STAGING_ACCESS_ISSUER));

export function stagingAccess(request: Request, env: Env) {
  return (
    env.APP_ENV === 'staging' &&
    env.APP_ORIGIN === origin &&
    new URL(request.url).origin === origin &&
    /^[a-f0-9]{64}$/.test(env.STAGING_ACCESS_AUD ?? '')
  );
}

export async function verifyStagingIdentity(request: Request, env: Env) {
  assert(stagingAccess(request, env), 404, 'NOT_FOUND', 'Page unavailable.');
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  assert(token, 403, 'ACCESS_REQUIRED', 'Verify your staging email with Cloudflare to continue.');
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: STAGING_ACCESS_ISSUER,
      audience: env.STAGING_ACCESS_AUD,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'sub', 'email'],
    });
    if (payload.type !== 'app' || !payload.sub) throw Error('User identity required');
    return { email: emailSchema.parse(payload.email), expires: payload.exp! * 1000 };
  } catch {
    assert(
      false,
      403,
      'INVALID_ACCESS_IDENTITY',
      'Your staging verification expired. Sign in again.',
    );
  }
}

export async function confirmStagingIdentity(request: Request, env: Env) {
  requireOrigin(request, env);
  const identity = await verifyStagingIdentity(request, env);
  return createVerifiedSession(request, env, identity.email, identity.expires);
}
