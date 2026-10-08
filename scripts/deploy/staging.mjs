import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { requireRepositoryAcceptance, checkConfiguration } from '../configuration.mjs';

export function resourceNames(environment = 'staging') {
  if (environment !== 'staging')
    throw new Error('This bootstrap only provisions isolated staging.');
  const prefix = 'proinspect-v2-staging';
  return {
    platform: `${prefix}-platform`,
    marketing: `${prefix}-marketing`,
    database: `${prefix}-data`,
    documents: `${prefix}-documents`,
    restricted: `${prefix}-restricted`,
    events: `${prefix}-events`,
    deadLetter: `${prefix}-events-dlq`,
  };
}
export function stagingConfigurations(platform, marketing, input) {
  const names = resourceNames();
  if (!/^[a-z0-9-]+$/.test(input.subdomain)) throw new Error('Invalid Workers subdomain.');
  if (!/^[a-f0-9-]{36}$/.test(input.databaseId)) throw new Error('Invalid D1 identifier.');
  if (!/^[a-f0-9]{40}$/.test(input.sourceSha)) throw new Error('An exact source SHA is required.');
  const appOrigin = `https://${names.platform}.${input.subdomain}.workers.dev`;
  const marketingOrigin = `https://${names.marketing}.${input.subdomain}.workers.dev`;
  const vars = {
    APP_ENV: 'staging',
    APP_ORIGIN: appOrigin,
    MARKETING_ORIGIN: marketingOrigin,
    BUILD_SHA: input.sourceSha,
  };
  return {
    platform: {
      ...platform,
      env: {
        staging: {
          name: names.platform,
          workers_dev: true,
          preview_urls: false,
          vars: {
            ...vars,
            EMAIL_PROVIDER: 'resend',
            EMAIL_FROM: input.emailFrom || '',
            EMAIL_SINK: input.emailSink || '',
            OPERATIONS_EMAIL: input.operationsEmail || input.emailSink || '',
            TURNSTILE_SITE_KEY: input.turnstileSiteKey || '',
            REPORT_TOOL_ORIGIN: input.reportToolOrigin || '',
            SHEETS_WEBHOOK_URL: input.sheetsWebhookUrl || '',
            RESTRICTED_WORKFLOWS_ENABLED: 'false',
          },
          d1_databases: [
            {
              binding: 'DB',
              database_name: names.database,
              database_id: input.databaseId,
              migrations_dir: '../../database/migrations',
            },
          ],
          r2_buckets: [
            { binding: 'DOCUMENTS', bucket_name: names.documents },
            { binding: 'RESTRICTED_DOCUMENTS', bucket_name: names.restricted },
          ],
          durable_objects: { bindings: [{ name: 'SCHEDULER', class_name: 'BookingScheduler' }] },
          queues: {
            producers: [{ binding: 'EVENTS', queue: names.events }],
            consumers: [
              {
                queue: names.events,
                max_batch_size: 10,
                max_retries: 5,
                dead_letter_queue: names.deadLetter,
              },
            ],
          },
        },
      },
    },
    marketing: {
      ...marketing,
      env: {
        staging: {
          name: names.marketing,
          workers_dev: true,
          preview_urls: false,
          vars: {
            ...vars,
            APP_ORIGIN: marketingOrigin,
            PLATFORM_ORIGIN: appOrigin,
            MARKETING_TURNSTILE_SITE_KEY: input.marketingTurnstileSiteKey || '',
          },
        },
      },
    },
    receipt: {
      sourceSha: input.sourceSha,
      environment: 'staging',
      appOrigin,
      marketingOrigin,
      databaseId: input.databaseId,
      names,
      deployed: false,
    },
  };
}
export function cloudflareClient() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token || !account || !/^[a-f0-9]{32}$/.test(account))
    throw new Error(
      'Configure CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the GitHub staging environment.',
    );
  return async function api(path, method = 'GET', body, allowMissing = false) {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}${path}`,
      {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (response.status === 404 && allowMissing) return null;
    const result = await response.json();
    if (!response.ok || !result.success)
      throw new Error(
        `Cloudflare ${method} ${path.split('?')[0]} failed (${response.status}; code ${result.errors?.[0]?.code ?? 'unknown'}).`,
      );
    return result.result;
  };
}
function readConfig(path) {
  const result = ts.parseConfigFileTextToJson(path, readFileSync(path, 'utf8'));
  if (result.error) throw new Error(`Invalid configuration: ${path}`);
  return result.config;
}
export async function prepareStaging() {
  requireRepositoryAcceptance(process.env);
  const checked = checkConfiguration(process.env);
  if (!checked.ok)
    throw new Error('Complete offline configuration validation first: ' + JSON.stringify(checked));
  if (!/^[a-f0-9]{40}$/.test(process.env.SOURCE_SHA || ''))
    throw new Error('SOURCE_SHA must identify the exact verified commit before provisioning.');
  const names = resourceNames();
  const api = cloudflareClient();
  const { subdomain } = await api('/workers/subdomain');
  if (!subdomain) throw new Error('Configure the account Workers subdomain before deployment.');
  const matches = (await api(`/d1/database?name=${encodeURIComponent(names.database)}`)).filter(
    (db) => db.name === names.database,
  );
  if (matches.length > 1) throw new Error('Ambiguous staging database name.');
  const database = matches[0] ?? (await api('/d1/database', 'POST', { name: names.database }));
  for (const name of [names.documents, names.restricted]) {
    if (!(await api(`/r2/buckets/${name}`, 'GET', undefined, true)))
      await api('/r2/buckets', 'POST', { name });
  }
  for (const name of [names.deadLetter, names.events]) {
    const queues = await api(`/queues?name=${encodeURIComponent(name)}&per_page=100`);
    if (!queues.some((queue) => queue.queue_name === name))
      await api('/queues', 'POST', { queue_name: name });
  }
  const configurations = stagingConfigurations(
    readConfig('apps/platform/wrangler.jsonc'),
    readConfig('apps/marketing/wrangler.jsonc'),
    {
      subdomain,
      databaseId: database.uuid,
      sourceSha: process.env.SOURCE_SHA,
      emailFrom: process.env.EMAIL_FROM,
      emailSink: process.env.EMAIL_SINK,
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY,
      operationsEmail: process.env.OPERATIONS_EMAIL,
      marketingTurnstileSiteKey: process.env.MARKETING_TURNSTILE_SITE_KEY,
      reportToolOrigin: process.env.REPORT_TOOL_ORIGIN,
      sheetsWebhookUrl: process.env.SHEETS_WEBHOOK_URL,
    },
  );
  writeFileSync(
    'apps/platform/wrangler.jsonc',
    JSON.stringify(configurations.platform, null, 2) + '\n',
  );
  writeFileSync(
    'apps/marketing/wrangler.jsonc',
    JSON.stringify(configurations.marketing, null, 2) + '\n',
  );
  mkdirSync('artifacts', { recursive: true });
  writeFileSync(
    'artifacts/staging-deployment.json',
    JSON.stringify(configurations.receipt, null, 2),
  );
  console.log(
    JSON.stringify({ environment: 'staging', resourcesPrepared: names, deployed: false }),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--apply')) await prepareStaging();
  else
    console.log(
      JSON.stringify(
        {
          mode: 'plan',
          environment: 'staging',
          resources: resourceNames(),
          customDomainsChanged: false,
          productionChanged: false,
        },
        null,
        2,
      ),
    );
}
