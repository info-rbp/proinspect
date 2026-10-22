import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalPageRedirect} from '../packages/security/canonical.ts';
const target = 'https://proinspect.systems';
const old = 'https://proinspect-platform.delicate-dream-e4c9.workers.dev';
test('legacy page links preserve their path and private token only on the canonical destination', () => {
  const response = canonicalPageRedirect(new Request(old + '/guest/manage?token=abc%2B123'), target, 'production');
  assert.equal(response?.status, 308);
  assert.equal(response?.headers.get('Location'), target + '/guest/manage?token=abc%2B123');
  assert.equal(response?.headers.get('Referrer-Policy'), 'no-referrer');
  assert.match(response?.headers.get('Cache-Control') || '', /no-store/);
});
test('canonical redirects never forward writes, webhooks, arbitrary hosts or non-production traffic', () => {
  for (const [url, method, origin, env] of [
    [old + '/signin', 'POST', target, 'production'],
    [old + '/api/webhooks/stripe', 'GET', target, 'production'],
    ['https://untrusted.example/signin', 'GET', target, 'production'],
    [target + '/signin', 'GET', target, 'production'],
    [old + '/signin', 'GET', target, 'staging'],
    [old + '/signin', 'GET', 'https://untrusted.example', 'production'],
  ]) assert.equal(canonicalPageRedirect(new Request(url, {method}), origin, env), null);
});
test('a scheme-relative path cannot turn the canonical redirect into an open redirect', () => {
  const response = canonicalPageRedirect(new Request(old + '//untrusted.example/secret?token=abc'), target, 'production');
  assert.equal(new URL(response!.headers.get('Location')!).origin, target);
});
