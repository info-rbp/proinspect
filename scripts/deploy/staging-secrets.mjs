import { readFileSync } from 'node:fs';
import { cloudflareClient, resourceNames } from './staging.mjs';
const receipt = JSON.parse(readFileSync('artifacts/staging-deployment.json', 'utf8'));
const name = resourceNames().platform;
if (receipt.environment !== 'staging' || receipt.names.platform !== name) throw new Error('Staging scope mismatch.');
const api = cloudflareClient();
const existing = await api(`/workers/scripts/${name}/secrets`);
const configured = {};
for (const variable of ['DATA_ENCRYPTION_KEY', 'RESEND_API_KEY', 'TURNSTILE_SECRET_KEY']) {
  const present = existing.some(secret => secret.name === variable);
  const value = process.env[variable];
  if (variable === 'DATA_ENCRYPTION_KEY' && present) { configured[variable] = 'preserved-existing'; continue; }
  if (!value) { configured[variable] = present ? 'preserved-existing' : 'configuration-required'; continue; }
  if (variable === 'DATA_ENCRYPTION_KEY' && Buffer.from(value, 'base64').length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes encoded as base64.');
  await api(`/workers/scripts/${name}/secrets`, 'PUT', { name: variable, text: value, type: 'secret_text' });
  configured[variable] = 'configured';
}
console.log(JSON.stringify({ environment: 'staging', secretStatus: configured }));
