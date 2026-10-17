import { chromium } from '@playwright/test';

// Read-only browser evidence for the exact deployed origin. No forms are submitted.
const origin = 'https://proinspect-platform.delicate-dream-e4c9.workers.dev';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const faults = [];
const failedRequests = [];
const failedResponses = [];
let turnstileRequests = 0;

const sanitize = value => String(value).replace(/(?:token|secret|key)=([^&\s]+)/ig, '$1=[REDACTED]').slice(0, 240);
page.on('console', msg => {
  if (msg.type() === 'error' || /content security policy|refused to execute/i.test(msg.text()))
    faults.push({ kind: 'console', message: sanitize(msg.text()) });
});
page.on('pageerror', error => faults.push({ kind: 'pageerror', message: sanitize(error.message) }));
page.on('request', req => {
  if (req.url().startsWith('https://challenges.cloudflare.com/turnstile/')) turnstileRequests++;
});
page.on('requestfailed', req => failedRequests.push({
  kind: req.resourceType(),
  path: (() => { try { return new URL(req.url()).pathname; } catch { return ''; } })(),
  reason: req.failure()?.errorText?.slice(0, 90),
}));
page.on('response', res => {
  if (res.status() >= 400 && (/\/assets\//.test(res.url()) ||
    res.url().startsWith('https://challenges.cloudflare.com/'))) {
    failedResponses.push({ status: res.status(), path: new URL(res.url()).pathname });
  }
});
try {
  const response = await page.goto(origin + '/signin', { waitUntil: 'domcontentloaded', timeout: 25000 });
  const original = await response.text();
  const csp = response.headers()['content-security-policy'] || '';
  const cspNonce = (csp.match(/'nonce-([^']+)'/) || [])[1];
  const inlineScripts = [...original.matchAll(/<script\b([^>]*)>/gi)].map(x => ({
    hasNonce: /\bnonce=/.test(x[1]),
    nonceMatches: (x[1].match(/nonce="([^"]*)"/) || [])[1] === cspNonce,
    module: /type="module"/.test(x[1]),
  }));
  await page.waitForTimeout(8000);
  const state = await page.evaluate(() => ({
    scriptCount: document.scripts.length,
    nonceScripts: [...document.scripts].filter(s => !!s.nonce).length,
    turnstileLoaderInserted: !!document.querySelector('script[data-proinspect-turnstile]'),
    turnstileLoaderCount: document.querySelectorAll('script[data-proinspect-turnstile]').length,
    hasTurnstileApi: typeof window.turnstile?.render === 'function',
    frames: document.querySelectorAll('iframe').length,
    turnstileFrames: document.querySelectorAll('iframe[src*="challenges.cloudflare.com"]').length,
    hiddenTurnstileInput: !!document.querySelector('input[name="turnstile"]'),
    hasChallengeToken: !!document.querySelector('input[name="turnstile"]')?.value,
    hasReactRouterHydrationContext: !!window.__reactRouterContext,
  }));
  console.log('LIVE_PROINSPECT_TURNSTILE_DIAGNOSTIC', JSON.stringify({
    status: response.status(),
    cspHasNonce: !!cspNonce,
    inlineScripts: inlineScripts.length,
    inlineScriptsWithMatchedNonce: inlineScripts.filter(s => s.nonceMatches).length,
    inlineScriptsWithoutNonce: inlineScripts.filter(s => !s.hasNonce).length,
    turnstileRequests,
    state,
    errors: faults.slice(0, 12),
    failedRequests: failedRequests.slice(0, 12),
    failedResponses: failedResponses.slice(0, 12),
    observedOnly: true,
  }));
} finally {
  await browser.close();
}
