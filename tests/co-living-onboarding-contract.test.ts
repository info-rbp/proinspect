import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CO_LIVING_ONBOARDING_STAGES,
  CO_LIVING_ONBOARDING_GUIDE,
  CO_LIVING_STAGE_EXIT_GATES,
  evaluateCoLivingOnboardingStageExit,
  nextCoLivingOnboardingStage,
} from '../packages/domain/co-living-onboarding.ts';

test('Co-Living onboarding has the six agreed stages in customer order', () => {
  assert.deepEqual([...CO_LIVING_ONBOARDING_STAGES], [
    'enquiry', 'site_visit', 'proposal',
    'implementation', 'advertising', 'tenanted',
  ]);
  for (const stage of CO_LIVING_ONBOARDING_STAGES) {
    assert.ok(CO_LIVING_ONBOARDING_GUIDE[stage].label.length > 0);
    assert.ok(CO_LIVING_ONBOARDING_GUIDE[stage].ownerAction.length > 0);
    assert.ok(CO_LIVING_ONBOARDING_GUIDE[stage].deliverable.length > 0);
  }
});

test('stage order is linear and ends at Tenanted', () => {
  for (const [index, stage] of CO_LIVING_ONBOARDING_STAGES.entries()) {
    assert.equal(nextCoLivingOnboardingStage(stage),
      CO_LIVING_ONBOARDING_STAGES[index + 1] ?? null);
  }
});

test('unreviewed or missing evidence never satisfies stage exit', () => {
  for (const stage of CO_LIVING_ONBOARDING_STAGES.slice(0, -1)) {
    const result = evaluateCoLivingOnboardingStageExit(stage, {});
    assert.equal(result.ready, false, stage);
    assert.deepEqual(result.missing, [...CO_LIVING_STAGE_EXIT_GATES[stage]]);
    const missingOne = CO_LIVING_STAGE_EXIT_GATES[stage][0];
    const evidence = Object.fromEntries(
      CO_LIVING_STAGE_EXIT_GATES[stage].map(key => [key, key !== missingOne]),
    );
    assert.deepEqual(evaluateCoLivingOnboardingStageExit(stage, evidence), {
      ready: false,
      missing: [missingOne],
    });
  }
});

test('reviewed evidence satisfies only that stage gate', () => {
  for (const stage of CO_LIVING_ONBOARDING_STAGES) {
    const evidence = Object.fromEntries(
      CO_LIVING_STAGE_EXIT_GATES[stage].map(key => [key, true]),
    );
    assert.deepEqual(evaluateCoLivingOnboardingStageExit(stage, evidence), {
      ready: true,
      missing: [],
    });
  }
});

test('implementation cannot progress without room-use and independent readiness evidence', () => {
  const evidence = Object.fromEntries(
    CO_LIVING_STAGE_EXIT_GATES.implementation.map(key => [key, true]),
  );
  evidence.room_use_approved = false;
  evidence.readiness_independently_approved = false;
  assert.deepEqual(evaluateCoLivingOnboardingStageExit('implementation', evidence).missing, [
    'room_use_approved', 'readiness_independently_approved',
  ]);
});

test('advertising cannot become Tenanted solely on a published room listing', () => {
  const result = evaluateCoLivingOnboardingStageExit('advertising', {
    approved_listing_published: true,
  });
  assert.equal(result.ready, false);
  assert.ok(result.missing.includes('first_tenancy_active'));
  assert.ok(result.missing.includes('first_room_pcr_completed'));
  assert.ok(result.missing.includes('first_room_inventory_completed'));
});
