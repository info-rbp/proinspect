import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(path.join(root, p), 'utf8'));
export function validateHandbook(register, traceability, rootDirectory = root) {
  const failures = [],
    seen = new Set(),
    priorities = { P0: 0, P1: 0, P2: 0 };
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };
  const counts = { G: 7, C: 9, B: 14, I: 10, R: 9, L: 15, U: 13, O: 11, M: 9, X: 13 };
  const safePath = (p) =>
    typeof p === 'string' &&
    !path.isAbsolute(p) &&
    !p.split(/[\\/]/).includes('..') &&
    existsSync(path.join(rootDirectory, p));
  check(register.tasks?.length === 110, 'The complete handbook contains exactly 110 tasks.');
  for (const task of register.tasks ?? []) {
    check(!seen.has(task.id), 'Duplicate task ' + task.id);
    seen.add(task.id);
    check(
      /^[GCBIRLUOMX]\d{2}$/.test(task.id) &&
        Number(task.id.slice(1)) >= 1 &&
        Number(task.id.slice(1)) <= counts[task.id[0]],
      'Unknown task ' + task.id,
    );
    if (task.priority in priorities) priorities[task.priority]++;
    else failures.push('Unknown priority ' + task.id);
    check(register.states.includes(task.state), 'Unknown state ' + task.id);
    check(
      task.actions?.length > 0 && task.acceptance && task.retainedEvidence,
      'Missing acceptance contract ' + task.id,
    );
    for (const p of task.implementationPaths ?? [])
      check(safePath(p), 'Unresolved implementation path ' + task.id + ': ' + p);
    for (const e of task.verification ?? [])
      check(safePath(e.test), 'Unresolved test ' + task.id + ': ' + e.test);
    if (['Engineering verified', 'Awaiting external acceptance', 'Accepted'].includes(task.state))
      check(
        task.implementationPaths.length > 0 && task.verification.length > 0,
        'Engineering evidence missing ' + task.id,
      );
    if (task.state === 'Accepted') {
      const d = task.acceptanceDecision;
      check(
        Boolean(task.implementationOwner && task.independentReviewer && task.acceptanceOwner),
        'Named authorities missing ' + task.id,
      );
      check(
        task.implementationOwner !== task.independentReviewer &&
          task.implementationOwner !== task.acceptanceOwner,
        'Independent acceptance missing ' + task.id,
      );
      check(
        Boolean(
          d?.reference &&
          d?.sourceSha &&
          /^[a-f0-9]{40}$/.test(d.sourceSha) &&
          ['staging', 'production'].includes(d.environment) &&
          Number.isFinite(Date.parse(d.acceptedAt)),
        ),
        'Source/environment acceptance missing ' + task.id,
      );
      check(
        task.externalEvidence?.some(
          (e) =>
            e.kind === 'independent-acceptance' &&
            e.reference &&
            e.sourceSha === d?.sourceSha &&
            e.environment === d?.environment &&
            !e.synthetic,
        ),
        'Independent evidence missing ' + task.id,
      );
    }
    if (task.state === 'Deferred by decision')
      check(
        Boolean(
          task.acceptanceDecision?.reference &&
          task.acceptanceDecision?.approvedBy &&
          task.acceptanceDecision?.reviewAt,
        ),
        'Deferral requires an authorised dated decision ' + task.id,
      );
  }
  check(
    JSON.stringify(priorities) === JSON.stringify({ P0: 77, P1: 30, P2: 3 }),
    'Handbook priority mix differs from 77/30/3.',
  );
  check(
    traceability.packages?.length === 20 &&
      new Set(traceability.packages.map((p) => p.id)).size === 20,
    'F01-F20 traceability is incomplete.',
  );
  check(
    traceability.sourceDocumentSha256 === register.sourceDocumentSha256,
    'Traceability and task source hashes differ.',
  );
  return failures;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = validateHandbook(
    read('config/handbook-tasks.json'),
    read('config/handbook-traceability.json'),
  );
  const baseline = read('config/handbook-migration-baseline.json');
  for (const [p, hash] of Object.entries(baseline.files))
    if (
      createHash('sha256')
        .update(readFileSync(path.join(root, p)))
        .digest('hex') !== hash
    )
      failures.push('Deployed migration modified: ' + p);
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else
    console.log(
      '110 task contracts, 20 F-packages and 46 immutable migrations verified. This is not an acceptance certificate.',
    );
}
