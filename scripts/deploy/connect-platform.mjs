import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { cloudflareClient, resourceNames, stagingConfigurations } from './staging.mjs';
import { checkConfiguration, secretTargets } from '../configuration.mjs';

export const CONNECTED_WORKER = 'proinspect-platform';
export const CONNECTED_ENV = 'connected';
export const BUILD_SETTINGS = Object.freeze({
  root_directory: '/',
  build_command:
    'node scripts/deploy/stamp-connected.mjs && CLOUDFLARE_ENV=connected pnpm --dir apps/platform build',
  deploy_command: 'pnpm --dir apps/platform exec wrangler deploy',
});

const sha = () => execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const configPath = 'apps/platform/wrangler.jsonc';
const buildApi = () => {
  const token = process.env.CLOUDFLARE_BUILDS_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !/^[a-f0-9]{32}$/.test(account || ''))
    throw new Error('Missing Cloudflare Builds credentials.');
  return async (path, method = 'GET', body) => {
    const response = await fetch(
      'https://api.cloudflare.com/client/v4/accounts/' + account + path,
      {
        method,
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      },
    );
    const payload = await response.json();
    if (!response.ok || !payload.success)
      throw new Error(
        'Cloudflare Builds ' +
          method +
          ' failed (' +
          response.status +
          ', code ' +
          (payload.errors?.[0]?.code ?? 'unknown') +
          ').',
      );
    return payload.result;
  };
};
const artifactPath = 'artifacts/connected-platform.json';

function config(path) {
  const r = ts.parseConfigFileTextToJson(path, readFileSync(path, 'utf8'));
  if (r.error) throw new Error(`Invalid Wrangler config: ${path}`);
  return r.config;
}

export function connectedConfiguration(original, input) {
  const { platform, receipt } = stagingConfigurations(
    original,
    { name: 'unused-marketing' },
    input,
  );
  const origin = `https://${CONNECTED_WORKER}.${input.subdomain}.workers.dev`;
  const connected = {
    ...platform.env.staging,
    name: CONNECTED_WORKER,
    workers_dev: true,
    preview_urls: false,
    migrations: original.migrations,
    triggers: original.triggers,
    vars: {
      ...platform.env.staging.vars,
      APP_ORIGIN: origin,
      MARKETING_ORIGIN: input.marketingOrigin || 'https://proinspect.systems',
      BUILD_SHA: input.sourceSha,
    },
  };
  return {
    configuration: { ...original, env: { ...original.env, [CONNECTED_ENV]: connected } },
    receipt: {
      ...receipt,
      targetWorker: CONNECTED_WORKER,
      appOrigin: origin,
      marketingOrigin: connected.vars.MARKETING_ORIGIN,
      newIsolatedResources: true,
      cloudflareBuildConfigured: false,
    },
  };
}

function preflight() {
  if (
    process.env.CONFIRM_WORKER !== CONNECTED_WORKER ||
    process.env.GITHUB_REF !== 'refs/heads/main'
  )
    throw new Error(
      'This action requires main and an explicit confirmation of proinspect-platform.',
    );
  if (!/^[a-f0-9]{40}$/.test(process.env.SOURCE_SHA || '') || process.env.SOURCE_SHA !== sha())
    throw new Error('Checkout must match the exact main commit selected for this connection.');
  const result = checkConfiguration(process.env, {
    environment: 'staging',
    groups: ['core', 'deploy'],
  });
  if (!result.ok)
    throw new Error(
      `Missing or invalid staged configuration: ${JSON.stringify({ missing: result.missing, invalid: result.invalid })}`,
    );
}

async function buildTarget(api, buildsApi) {
  const workers = await api('/workers/scripts');
  const worker = workers.find((w) => w.id === CONNECTED_WORKER);
  if (!worker?.tag)
    throw new Error(
      'The existing Cloudflare Worker proinspect-platform was not found in the configured account. No alternate Worker will be used.',
    );
  const triggers = await buildsApi(`/builds/workers/${worker.tag}/triggers`);
  const matched = triggers.filter(
    (t) => t.branch_includes?.includes('main') && !t.branch_excludes?.includes('main'),
  );
  if (matched.length !== 1)
    throw new Error(
      'Expected exactly one Cloudflare Builds trigger connected to main for proinspect-platform.',
    );
  return { workerTag: worker.tag, triggerId: matched[0].trigger_uuid };
}

async function provision(api) {
  const names = resourceNames();
  const raw = await api('/workers/subdomain');
  const subdomain = raw?.subdomain;
  if (!subdomain || !/^[a-z0-9-]+$/.test(subdomain))
    throw new Error('Cloudflare Workers subdomain is missing.');
  const matches = (await api(`/d1/database?name=${encodeURIComponent(names.database)}`)).filter(
    (d) => d.name === names.database,
  );
  if (matches.length > 1) throw new Error('Ambiguous isolated D1 resource name.');
  const database = matches[0] || (await api('/d1/database', 'POST', { name: names.database }));
  if (!/^[a-f0-9-]{36}$/.test(database?.uuid || ''))
    throw new Error('Cloudflare did not return a real D1 identifier.');
  for (const bucket of [names.documents, names.restricted]) {
    if (!(await api(`/r2/buckets/${bucket}`, 'GET', undefined, true)))
      await api('/r2/buckets', 'POST', { name: bucket });
  }
  for (const queue of [names.deadLetter, names.events]) {
    const existing = await api(`/queues?name=${encodeURIComponent(queue)}&per_page=100`);
    if (!existing.some((q) => q.queue_name === queue))
      await api('/queues', 'POST', { queue_name: queue });
  }
  return { names, databaseId: database.uuid, subdomain };
}

async function prepare() {
  preflight();
  const api = cloudflareClient();
  // Check account ownership and user-scoped Builds API access before creating resources.
  const target = await buildTarget(api, buildApi());
  const resources = await provision(api);
  const { configuration, receipt } = connectedConfiguration(config(configPath), {
    subdomain: resources.subdomain,
    databaseId: resources.databaseId,
    sourceSha: process.env.SOURCE_SHA,
    emailFrom: process.env.EMAIL_FROM,
    emailSink: process.env.EMAIL_SINK,
    operationsEmail: process.env.OPERATIONS_EMAIL,
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY,
    marketingTurnstileSiteKey: process.env.MARKETING_TURNSTILE_SITE_KEY,
    marketingOrigin: process.env.MARKETING_ORIGIN,
    reportToolOrigin: process.env.REPORT_TOOL_ORIGIN,
    sheetsWebhookUrl: process.env.SHEETS_WEBHOOK_URL,
  });
  writeFileSync(configPath, JSON.stringify(configuration, null, 2) + '\n');
  mkdirSync('artifacts', { recursive: true });
  writeFileSync(artifactPath, JSON.stringify({ ...receipt, ...target }, null, 2));
  console.log(
    JSON.stringify({
      prepared: true,
      targetWorker: CONNECTED_WORKER,
      environment: 'staging',
      database: resources.names.database,
      isolatedResources: true,
      deployed: false,
    }),
  );
}

async function installSecrets(api) {
  const existing = await api(`/workers/scripts/${CONNECTED_WORKER}/secrets`);
  const summary = {};
  for (const name of secretTargets('platform')) {
    if (existing.some((s) => s.name === name)) {
      summary[name] = 'preserved';
      continue; // Never rotate existing encryption keys or signing secrets automatically.
    }
    if (!process.env[name]) {
      summary[name] = 'not-enabled';
      continue;
    }
    await api(`/workers/scripts/${CONNECTED_WORKER}/secrets`, 'PUT', {
      name,
      text: process.env[name],
      type: 'secret_text',
    });
    summary[name] = 'installed';
  }
  console.log(JSON.stringify({ worker: CONNECTED_WORKER, secretStatus: summary }));
}

async function configure() {
  preflight();
  const receipt = JSON.parse(readFileSync(artifactPath, 'utf8'));
  if (
    receipt.targetWorker !== CONNECTED_WORKER ||
    receipt.sourceSha !== process.env.SOURCE_SHA ||
    !receipt.newIsolatedResources
  )
    throw new Error('Connected deployment receipt does not match this source and target.');
  const api = cloudflareClient();
  const target = await buildTarget(api, buildApi());
  if (target.workerTag !== receipt.workerTag || target.triggerId !== receipt.triggerId)
    throw new Error('Cloudflare Worker or build trigger changed during provisioning.');
  await installSecrets(api);
  await buildApi()(`/builds/triggers/${target.triggerId}`, 'PATCH', BUILD_SETTINGS);
  await buildApi()(`/builds/triggers/${target.triggerId}/environment_variables`, 'PATCH', {
    NODE_VERSION: { value: '22.23.2', is_secret: false },
  });
  receipt.cloudflareBuildConfigured = true;
  writeFileSync(artifactPath, JSON.stringify(receipt, null, 2));
  console.log(
    JSON.stringify({
      configured: true,
      worker: CONNECTED_WORKER,
      root: BUILD_SETTINGS.root_directory,
      build: BUILD_SETTINGS.build_command,
      deploy: BUILD_SETTINGS.deploy_command,
    }),
  );
}

async function trigger() {
  const receipt = JSON.parse(readFileSync(artifactPath, 'utf8'));
  if (!receipt.cloudflareBuildConfigured || receipt.targetWorker !== CONNECTED_WORKER)
    throw new Error('Build trigger configuration was not accepted.');
  const commitHash = sha();
  if (!/^[a-f0-9]{40}$/.test(commitHash))
    throw new Error('Unable to determine committed source SHA.');
  const result = await buildApi()(`/builds/triggers/${receipt.triggerId}/builds`, 'POST', {
    branch: 'main',
    commit_hash: commitHash,
  });
  receipt.requestedBuild = result.build_uuid || result.uuid || 'requested';
  receipt.deploymentCommit = commitHash;
  writeFileSync(artifactPath, JSON.stringify(receipt, null, 2));
  console.log(
    JSON.stringify({
      requested: true,
      targetWorker: CONNECTED_WORKER,
      branch: 'main',
      commit: commitHash,
      build: receipt.requestedBuild,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--prepare')) await prepare();
  else if (process.argv.includes('--configure')) await configure();
  else if (process.argv.includes('--trigger')) await trigger();
  else
    throw new Error('Choose --prepare, --configure or --trigger. No remote action is the default.');
}