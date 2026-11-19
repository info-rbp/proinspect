import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const baseline = '15382bea37d05b0a9533b040e6d79591a7883442';
const files = execFileSync('git', ['ls-tree', '-r', '--name-only', baseline], { encoding: 'utf8' }).trim().split('\n');
const patterns = {
  d1: /D1Database|D1PreparedStatement|\b(?:env|this\.env)\.DB\b/, batches: /\.batch\(/,
  sqlite: /\bchanges\(\)|strftime\(|json_extract\(|INSERT OR (?:IGNORE|REPLACE)|RAISE\(ABORT|\bSTRICT\b/,
  durableObjects: /DurableObject|\bSCHEDULER\b|cloudflare:workers/,
  storage: /R2Bucket|\bRESTRICTED_DOCUMENTS\b|\bDOCUMENTS\b/,
  queueCron: /waitUntil\(|consumeQueue|dispatchOutbox|scheduled\(|MessageBatch|\bEVENTS\b/,
  crypto: /AES-GCM|additionalData|ENCRYPTION_KEY|SIGNING_KEY|ENCRYPTION_KEYS_JSON/,
  releaseFlags: /[A-Z_]+_ENABLED/,
};
const evidence = {}, hashes = {};
for (const file of files.filter(f => /^(apps|packages|database)\//.test(f) && /\.(ts|tsx|sql|jsonc)$/.test(f))) {
  const content = execFileSync('git', ['show', `${baseline}:${file}`], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  hashes[file] = createHash('sha256').update(content).digest('hex');
  for (const [category, pattern] of Object.entries(patterns)) {
    const lines = content.split('\n').flatMap((line, i) => pattern.test(line) ? [i + 1] : []);
    if (lines.length) (evidence[category] ??= []).push({ file, lines });
  }
}
const manifests = Object.fromEntries(files.filter(f => /(^|\/)package.json$/.test(f)).map(f => [f, JSON.parse(execFileSync('git', ['show', `${baseline}:${f}`], { encoding: 'utf8' }))]));
const result = { baseline, manifests, migrations: files.filter(f => /^database\/migrations\/.*\.sql$/.test(f)), counts: Object.fromEntries(Object.entries(evidence).map(([k, v]) => [k, { files: v.length, matches: v.reduce((n, x) => n + x.lines.length, 0) }])), evidence, sha256: hashes };
const rendered = JSON.stringify(result, null, 2) + '\n';
const target = 'docs/migration/source-inventory.json';
if (process.argv.includes('--check')) { if (readFileSync(target, 'utf8') !== rendered) throw Error('Source inventory differs'); }
else writeFileSync(target, rendered);
console.log(JSON.stringify({ baseline, migrations: result.migrations.length, counts: result.counts }));
