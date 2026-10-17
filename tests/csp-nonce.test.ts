import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Worker CSP and both React SSR layers use the same per-request nonce', () => {
  const entry = readFileSync('apps/platform/app/entry.server.tsx', 'utf8');
  const worker = readFileSync('apps/platform/worker/app.ts', 'utf8');
  assert.match(entry, /const nonce = loadContext\.get\(runtimeContext\)\.nonce/);
  assert.match(entry, /<ServerRouter\b[^>]*nonce=\{nonce\}/);
  assert.match(entry, /renderToReadableStream\([\s\S]*?\{ nonce, signal: request\.signal \}/);
  assert.match(worker, /script-src 'self' 'nonce-\$\{nonce\}' https:\/\/challenges\.cloudflare\.com/);
  // Blanket nonce injection would trust arbitrary inline scripts. CSP protection
  // should come from the two framework renderers rather than rewriting all HTML.
  assert.doesNotMatch(worker, /new HTMLRewriter|nonceHtmlScripts/);
});
