import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  APPROVED_PUBLIC_MARKETING_IMAGES,
  approvedPublicMarketingImage,
} from '../apps/marketing/app/lib/media-approval.ts';
import {
  PUBLIC_LEGAL_APPROVAL,
  PUBLIC_LEGAL_DRAFTS,
} from '../packages/marketing/legal-drafts.ts';
import { shouldIndexPublicPage } from '../apps/platform/app/lib/public-routes.ts';

const stylesheet = readFileSync('packages/ui/marketing-redesign.css', 'utf8');

function luminance(value: string): number {
  const channels = value.replace('#', '').match(/[a-f0-9]{2}/gi);
  assert.ok(channels && channels.length === 3, 'Expected an RGB hex colour');
  const rgb = channels.map((hex) => {
    const c = Number.parseInt(hex, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(foreground: string, background: string): number {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

test('marketing small text colours reach WCAG AA text contrast in their common contexts', () => {
  const cases = [
    { label: 'card index on white', fg: '#476a65', bg: '#ffffff' },
    { label: 'card index on sage', fg: '#476a65', bg: '#e9efec' },
    { label: 'navigation caption on white', fg: '#49665f', bg: '#ffffff' },
    { label: 'report caption on white', fg: '#476a65', bg: '#ffffff' },
    { label: 'marketing eyebrow on sage', fg: '#0e6a65', bg: '#e9efec' },
    { label: 'footer legal links', fg: '#b4c9cc', bg: '#102e35' },
    { label: 'primary CTA on copper', fg: '#17323a', bg: '#e6bd84' },
  ];
  for (const { label, fg, bg } of cases) {
    assert.ok(contrast(fg, bg) >= 4.5, label + ' has insufficient contrast');
  }
  assert.match(stylesheet, /\.site \.mkt-card-number/);
  assert.match(stylesheet, /:focus-visible/);
  assert.match(stylesheet, /forced-colors: active/);
  assert.match(stylesheet, /prefers-reduced-motion:reduce/);
  assert.match(stylesheet, /@media\(max-width:1100px\)/);
});

test('customer data cannot enter public marketing images without reviewed local assets', () => {
  assert.deepEqual(APPROVED_PUBLIC_MARKETING_IMAGES, {});
  for (const slot of ['home-hero', 'sector-residential', 'sector-commercial', 'sector-strata', 'service-hero'] as const)
    assert.equal(approvedPublicMarketingImage(slot), null);
  const media = readFileSync('apps/marketing/app/lib/media-approval.ts', 'utf8');
  assert.match(media, /\/marketing-media\//);
  assert.match(media, /rightsRecord/);
  assert.match(media, /propertyAndPersonConsentRecord/);
  assert.doesNotMatch(media, /https?:\/\/.*(?:r2|workers\.dev)/);
});

test('draft legal documents cannot be indexed as final operative policies', () => {
  assert.equal(PUBLIC_LEGAL_APPROVAL.privacy.approved, false);
  assert.equal(PUBLIC_LEGAL_APPROVAL.terms.approved, false);
  assert.ok(PUBLIC_LEGAL_DRAFTS.privacy.sections.length >= 10);
  assert.ok(PUBLIC_LEGAL_DRAFTS.terms.sections.length >= 10);
  for (const path of ['/privacy', '/terms']) {
    assert.equal(shouldIndexPublicPage(path, 'https://proinspect.systems', 'production'), false);
    assert.equal(shouldIndexPublicPage(path, 'https://proinspect.systems', 'local'), false);
  }
  const info = readFileSync('apps/marketing/app/routes/information.tsx', 'utf8');
  assert.match(info, /noindex, nofollow/);
  assert.match(info, /Do not treat this review draft as an approved policy or a binding contract/);
});
