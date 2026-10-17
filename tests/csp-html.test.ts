import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

test('nonce every streamed React inline script without weakening the production CSP', async () => {
  mkdirSync('artifacts', { recursive: true });
  await build({
    entryPoints: ['tests/runtime/csp-entry.ts'],
    outfile: 'artifacts/csp-worker.mjs',
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
  });
  const mf = new Miniflare({
    modules: true,
    scriptPath: 'artifacts/csp-worker.mjs',
    compatibilityDate: '2026-07-01',
  });
  try {
    const response = await mf.dispatchFetch('https://example.test/');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(
      response.headers.get('content-security-policy'),
      "script-src 'self' 'nonce-test-nonce-347' https://challenges.cloudflare.com",
    );
    const html = await response.text();
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)];
    assert.equal(scripts.length, 3);
    for (const [, attributes] of scripts)
      assert.match(attributes, /nonce="test-nonce-347"/);
    assert.doesNotMatch(html, /nonce="old"/);
    assert.match(html, /window.one=1/);
    assert.match(html, /window.two=2/);
    assert.match(html, /<p>Safe<\/p>/);
    assert.match(html, /src="\/entry.js"/);
  } finally {
    await mf.dispose();
  }
});
