import test from 'node:test';
import assert from 'node:assert/strict';
import {WA_FORM_ROLLOUT,WA_PHASES,verifyRolloutCompleteness} from '../packages/wa-residential/rollout.ts';
test('32 registry forms must all be mapped to four gated release phases',()=>{
 assert.equal(verifyRolloutCompleteness(),true);
 assert.equal(WA_PHASES.length,4);
 const phase1=WA_FORM_ROLLOUT.filter(f=>f.phase==='foundation').map(f=>f.code).sort();
 assert.deepEqual(phase1,['WA_FORM_1','WA_FORM_19','WA_FORM_1AA','WA_FORM_25'].sort());
 assert.ok(WA_FORM_ROLLOUT.every(f=>f.releaseChecks.length>=7&&f.status==='blocked'));
 assert.ok(WA_FORM_ROLLOUT.some(f=>f.code==='WA_BOND_DISPOSAL'&&f.phase==='specialist'));
 assert.ok(!WA_FORM_ROLLOUT.some(f=>f.code==='WA_FORM_2'));
});
