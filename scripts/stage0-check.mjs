/** Source-only Stage 0 checks. This never queries or changes live infrastructure. */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const read = p => readFileSync(resolve(root, p), 'utf8');
const register = JSON.parse(read('config/handbook-tasks.json'));
const trace = JSON.parse(read('config/handbook-traceability.json'));
const failures = [];
const tasks = register.tasks ?? [];
const ids = new Set(tasks.map(x => x.id));
if (tasks.length !== 110 || ids.size !== 110) failures.push('Canonical 110 task IDs missing or duplicated');
if (trace.packages?.length !== 20 || new Set(trace.packages.map(x => x.id)).size !== 20) failures.push('20 F package IDs missing or duplicated');
for (const t of tasks) {
  const r = t.stage0Routing;
  if (!r || !Number.isInteger(r.implementationStage) || r.implementationStage < 0 || r.implementationStage > 6 ||
      !r.primarySurface || !r.nextAction || typeof r.evidenceRequiredBeforeAccepted !== 'boolean')
    failures.push('Missing routing for ' + t.id);
  if (!t.leadRole || !t.acceptance || !t.retainedEvidence) failures.push('Incomplete acceptance contract for ' + t.id);
}
const doc = read('docs/handbook/task-register.md');
const shown = [...doc.matchAll(/^\| \*\*([A-Z]\d{2})\*\* \|/gm)].map(x => x[1]);
if (shown.length !== tasks.length || new Set(shown).size !== tasks.length || shown.some(x => !ids.has(x))) failures.push('Human-readable register is out of sync with canonical task IDs');
const files = readdirSync(resolve(root, 'database/migrations')).filter(x => /^\d{4}_.+\.sql$/.test(x)).sort();
for (let i = 0; i < files.length; i++) if (Number(files[i].slice(0, 4)) !== i + 1) failures.push('Collision/gap in source migrations: ' + files[i]);
if (files.length < register.stage0Snapshot.sourceMigrationCount) failures.push('Historical source migration baseline missing');
const baseline = JSON.parse(read('config/handbook-migration-baseline.json'));
for (const p of Object.keys(baseline.files)) if (!files.includes(p.split('/').at(-1))) failures.push('Applied historical filename missing: ' + p);
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log('Stage 0: 110 routed tasks, 20 F-packages, '+files.length+' collision-free SQL migrations, single canonical register. No acceptance implied.');
