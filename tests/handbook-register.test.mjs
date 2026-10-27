import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateHandbook } from '../scripts/handbook-check.mjs';
const register = JSON.parse(readFileSync('config/handbook-tasks.json', 'utf8'));
const trace = JSON.parse(readFileSync('config/handbook-traceability.json', 'utf8'));
test('all 110 original task contracts and all 20 F-packages remain represented', () =>
  assert.deepEqual(validateHandbook(register, trace), []));
test('missing tasks and speculative engineering verification fail the register', () => {
  const changed = structuredClone(register);
  changed.tasks.pop();
  changed.tasks[0].state = 'Engineering verified';
  assert.ok(validateHandbook(changed, trace).some((e) => e.includes('110')));
  assert.ok(validateHandbook(changed, trace).some((e) => e.includes('Engineering evidence')));
});
test('synthetic tests cannot become independent acceptance or unapproved deferral', () => {
  const changed = structuredClone(register),
    task = changed.tasks.find((t) => t.id === 'O05');
  task.state = 'Accepted';
  task.implementationOwner = 'same-person';
  task.independentReviewer = 'same-person';
  task.acceptanceOwner = 'same-person';
  task.externalEvidence = [
    { kind: 'independent-acceptance', reference: 'synthetic-local-run', synthetic: true },
  ];
  const errors = validateHandbook(changed, trace);
  assert.ok(errors.some((e) => e.includes('Independent acceptance')));
  assert.ok(errors.some((e) => e.includes('Independent evidence')));
  task.state = 'Deferred by decision';
  assert.ok(validateHandbook(changed, trace).some((e) => e.includes('Deferral requires')));
});
