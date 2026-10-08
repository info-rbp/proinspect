import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export const environmentManifest = JSON.parse(
  readFileSync(new URL('../config/environment.json', import.meta.url), 'utf8'),
);
export function secretTargets(application) {
  if (!['platform', 'marketing'].includes(application)) throw new Error('Unknown application.');
  return Object.entries(environmentManifest.secrets)
    .filter(([, v]) => v.targets.includes(application))
    .map(([name]) => name);
}
/** Pure offline validation. Reports names and reasons, never supplied credential values. */
export function checkConfiguration(
  input,
  { environment = 'staging', groups = ['core', 'deploy'] } = {},
) {
  if (!['staging', 'production'].includes(environment))
    throw new Error('Use staging or production.');
  const enabled = new Set(groups);
  for (const group of enabled)
    if (!['core', 'deploy', 'payments', 'reports', 'sheets'].includes(group))
      throw new Error('Unknown configuration group.');
  if (environment === 'staging' && enabled.has('core')) enabled.add('staging');
  const entries = { ...environmentManifest.secrets, ...environmentManifest.variables },
    missing = [],
    invalid = [];
  for (const [name, rule] of Object.entries(entries)) {
    const value = input[name];
    if (enabled.has(rule.group) && !value) missing.push(name);
    if (!value) continue;
    if (
      rule.format === 'base64-32' &&
      (!/^[A-Za-z0-9+/]{43}=$/.test(value) || Buffer.from(value, 'base64').length !== 32)
    )
      invalid.push({ name, reason: 'Use exactly 32 random bytes encoded as standard base64.' });
    if (rule.format === 'signing-key' && value.length < 32)
      invalid.push({ name, reason: 'Use an independent random secret of at least 32 characters.' });
  }
  if (input.CLOUDFLARE_ACCOUNT_ID && !/^[a-f0-9]{32}$/.test(input.CLOUDFLARE_ACCOUNT_ID))
    invalid.push({
      name: 'CLOUDFLARE_ACCOUNT_ID',
      reason: 'Expected the 32-character hexadecimal account identifier.',
    });
  for (const name of ['OPERATIONS_EMAIL', 'EMAIL_SINK'])
    if (input[name] && !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(input[name]))
      invalid.push({ name, reason: 'Expected a single mailbox address.' });
  if (input.EMAIL_FROM && /[\r\n]/.test(input.EMAIL_FROM))
    invalid.push({ name: 'EMAIL_FROM', reason: 'Sender must be a single header value.' });
  for (const name of ['REPORT_TOOL_ORIGIN', 'SHEETS_WEBHOOK_URL'])
    if (input[name]) {
      try {
        const url = new URL(input[name]);
        if (url.protocol !== 'https:' || url.username || url.password || url.hash)
          throw new Error();
        if (name === 'REPORT_TOOL_ORIGIN' && (url.pathname !== '/' || url.search))
          throw new Error();
        if (
          name === 'SHEETS_WEBHOOK_URL' &&
          (url.hostname !== 'script.google.com' ||
            !/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname) ||
            url.search)
        )
          throw new Error();
      } catch {
        invalid.push({
          name,
          reason:
            name === 'REPORT_TOOL_ORIGIN'
              ? 'Expected an HTTPS origin without path, query, fragment or credentials.'
              : 'Expected a deployed HTTPS script.google.com/macros/s/.../exec URL.',
        });
      }
    }
  for (const group of ['payments', 'reports', 'sheets']) {
    const names = Object.entries(entries)
      .filter(([, v]) => v.group === group)
      .map(([n]) => n);
    if (names.some((n) => input[n]))
      for (const name of names) if (!input[name] && !missing.includes(name)) missing.push(name);
  }
  if (
    input.STRIPE_SECRET_KEY &&
    environment === 'staging' &&
    !/^sk_test_/.test(input.STRIPE_SECRET_KEY)
  )
    invalid.push({
      name: 'STRIPE_SECRET_KEY',
      reason: 'Use a Stripe test-mode secret in staging.',
    });
  if (input.EMAIL_PROVIDER && input.EMAIL_PROVIDER !== 'resend')
    invalid.push({
      name: 'EMAIL_PROVIDER',
      reason: 'Hosted configuration must use the implemented resend adapter.',
    });
  if (environment === 'production' && input.EMAIL_SINK)
    invalid.push({
      name: 'EMAIL_SINK',
      reason: 'Production must not redirect customer messages to a test sink.',
    });
  if (input.RESTRICTED_WORKFLOWS_ENABLED && input.RESTRICTED_WORKFLOWS_ENABLED !== 'false')
    invalid.push({
      name: 'RESTRICTED_WORKFLOWS_ENABLED',
      reason: 'Keep false until the separate restricted-case release review.',
    });
  const signing = [
    'DATA_ENCRYPTION_KEY',
    'ENQUIRY_GATEWAY_SECRET',
    'REPORT_TOOL_SECRET',
    'SHEETS_WEBHOOK_SECRET',
  ].filter((n) => input[n]);
  for (let i = 0; i < signing.length; i++)
    for (let j = i + 1; j < signing.length; j++)
      if (input[signing[i]] === input[signing[j]])
        invalid.push({ name: signing[j], reason: `Must not reuse ${signing[i]}.` });
  return {
    environment,
    groups: [...enabled],
    ok: !missing.length && !invalid.length,
    missing,
    invalid,
    remoteCalls: 0,
    deploymentEnabled: false,
  };
}
export function requireRepositoryAcceptance(input) {
  if (
    !/^[a-f0-9]{40}$/.test(input.SOURCE_SHA || '') ||
    input.REPOSITORY_ACCEPTED_SHA !== input.SOURCE_SHA
  )
    throw new Error('Deployment is locked: an explicitly accepted source SHA is required.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv.includes('--check')) console.log(JSON.stringify(environmentManifest, null, 2));
  else {
    const environment = process.argv.includes('--production') ? 'production' : 'staging',
      groupArg = process.argv.find((v) => v.startsWith('--groups='));
    const result = checkConfiguration(process.env, {
      environment,
      groups: groupArg ? groupArg.slice(9).split(',') : ['core', 'deploy'],
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  }
}
