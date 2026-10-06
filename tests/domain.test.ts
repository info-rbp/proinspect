import test from 'node:test';
import assert from 'node:assert/strict';
import { WORKSPACES, CLIENT_TYPES, safeReturnTo, canTransition } from '../packages/domain/index.ts';
import { seal, unseal, digest, randomToken } from '../packages/auth/crypto.ts';
test('portal family preserves distinct landlord, agency, strata, occupancy and staff workspaces', () => {
  assert.equal(Object.keys(WORKSPACES).length, 8);
  assert.ok(CLIENT_TYPES.includes('landlord'));
  assert.ok(!CLIENT_TYPES.includes('individual' as never));
});
test('return destinations cannot escape the application', () => {
  for (const bad of ['//evil.test', 'https://evil.test', '/\\evil.test', '/\nLocation: evil'])
    assert.equal(safeReturnTo(bad), '/workspaces');
  assert.equal(
    safeReturnTo('/book/routine-inspection?property=p_1'),
    '/book/routine-inspection?property=p_1',
  );
});
test('terminal work order states cannot be reopened accidentally', () => {
  assert.equal(canTransition('completed', 'in_progress'), false);
  assert.equal(canTransition('scheduled', 'in_progress'), true);
  assert.equal(canTransition('triage', 'completed'), false);
});
test('encrypted values are bound to their record context', async () => {
  const key = btoa('x'.repeat(32));
  const envelope = await seal(key, 'booking:a', { code: '1234' });
  assert.ok(!envelope.includes('1234'));
  assert.deepEqual(await unseal(key, 'booking:a', envelope), { code: '1234' });
  await assert.rejects(() => unseal(key, 'booking:b', envelope));
});
test('tokens are random and only hashed values are persisted', async () => {
  const a = randomToken(),
    b = randomToken();
  assert.equal(a.length, 64);
  assert.notEqual(a, b);
  assert.notEqual(await digest(a), a);
});
