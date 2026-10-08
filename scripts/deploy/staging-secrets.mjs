import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { cloudflareClient, resourceNames } from './staging.mjs';
import {
  secretTargets,
  requireRepositoryAcceptance,
  checkConfiguration,
} from '../configuration.mjs';
export async function configureStagingSecrets() {
  requireRepositoryAcceptance(process.env);
  if (!checkConfiguration(process.env).ok)
    throw new Error('Run offline configuration validation first.');
  const receipt = JSON.parse(readFileSync('artifacts/staging-deployment.json', 'utf8')),
    names = resourceNames();
  if (
    receipt.environment !== 'staging' ||
    receipt.sourceSha !== process.env.SOURCE_SHA ||
    receipt.names.platform !== names.platform ||
    receipt.names.marketing !== names.marketing
  )
    throw new Error('Staging receipt scope mismatch.');
  const api = cloudflareClient(),
    existing = {},
    configured = {};
  for (const app of ['platform', 'marketing'])
    existing[app] = await api(`/workers/scripts/${names[app]}/secrets`);
  const gateway = ['platform', 'marketing'].map((app) =>
    existing[app].some((s) => s.name === 'ENQUIRY_GATEWAY_SECRET'),
  );
  if (gateway[0] !== gateway[1])
    throw new Error(
      'Gateway secret exists on only one Worker. Reconcile its backed-up value explicitly; automatic rotation is prohibited.',
    );
  for (const app of ['platform', 'marketing']) {
    configured[app] = {};
    for (const name of secretTargets(app)) {
      if (existing[app].some((s) => s.name === name)) {
        configured[app][name] = 'preserved-existing';
        continue;
      }
      if (!process.env[name]) {
        configured[app][name] = 'not-configured';
        continue;
      }
      await api(`/workers/scripts/${names[app]}/secrets`, 'PUT', {
        name,
        text: process.env[name],
        type: 'secret_text',
      });
      configured[app][name] = 'configured';
    }
  }
  console.log(JSON.stringify({ environment: 'staging', secretStatus: configured }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await configureStagingSecrets();
