import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
const path = 'apps/platform/wrangler.jsonc';
const parsed = ts.parseConfigFileTextToJson(path, readFileSync(path, 'utf8'));
if (parsed.error) throw new Error('Invalid platform Wrangler config.');
const config = parsed.config;
const connected = config.env?.connected;
if (connected?.name !== 'proinspect-platform' || connected.vars?.APP_ENV !== 'staging')
  throw new Error(
    'Connected platform config is absent or not staging. Refusing a local/production deploy.',
  );
const db = connected.d1_databases?.find((d) => d.binding === 'DB');
if (
  !/^[a-f0-9-]{36}$/.test(db?.database_id || '') ||
  /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(db.database_id)
)
  throw new Error('Connected platform requires the real isolated D1 database ID.');
if (connected.r2_buckets?.length !== 2 || !connected.queues?.producers?.length)
  throw new Error('Connected platform resources are incomplete.');
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Unable to identify source commit.');
connected.vars.BUILD_SHA = sha;
writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
console.log(`Prepared proinspect-platform staging configuration for ${sha}.`);