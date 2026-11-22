/**
 * Co-Living property onboarding: presentation and testable workflow metadata.
 *
 * This does NOT persist a project, authorise expenditure, verify property access,
 * approve a legal agreement, publish a listing or enable payments.
 * Every meaningful transition must be revalidated server-side against evidence.
 *
 * Prepared for the PR #118 descendant branch (not a production feature flag).
 */

export const CO_LIVING_ONBOARDING_STAGES = [
  'enquiry',
  'site_visit',
  'proposal',
  'implementation',
  'advertising',
  'tenanted',
] as const;

export type CoLivingOnboardingStage =
  (typeof CO_LIVING_ONBOARDING_STAGES)[number];

export type CoLivingOnboardingProjectStatus =
  | 'active'
  | 'on_hold'
  | 'withdrawn'
  | 'completed';

export type CoLivingOnboardingStageStatus =
  | 'not_started'
  | 'in_progress'
  | 'waiting_for_owner'
  | 'blocked'
  | 'completed';

export const CO_LIVING_ONBOARDING_GUIDE = {
  enquiry: {
    label: 'Enquiry',
    summary: 'Tell us about your property and investment objectives.',
    ownerAction: 'Share initial property details, a floor plan if available and existing leasing information.',
    deliverable: 'Recorded enquiry and arranged property assessment.',
  },
  site_visit: {
    label: 'Site Visit',
    summary: 'We assess the property, suitable room layout, furnishing requirements and necessary works.',
    ownerAction: 'Provide access and relevant tenancy, building and utility information.',
    deliverable: 'Reviewed site assessment and preliminary establishment scope.',
  },
  proposal: {
    label: 'Proposal',
    summary: 'Review potential room income, establishment budget, service inclusions and agreement.',
    ownerAction: 'Approve, decline or request changes to the exact proposal and expenditure scope.',
    deliverable: 'Versioned proposal and confirmed owner instructions.',
  },
  implementation: {
    label: 'Implementation',
    summary: 'We coordinate approved furnishings, appliances, contractors and property preparation.',
    ownerAction: 'Respond to any new scope or cost approvals not included in your agreed budget.',
    deliverable: 'Installation, inventory, progress record and independently checked readiness.',
  },
  advertising: {
    label: 'Advertising',
    summary: 'We market only approved rooms and coordinate enquiries and tenancy applications.',
    ownerAction: 'Review pricing exceptions where they fall outside your approved leasing instructions.',
    deliverable: 'Approved room listings and verified tenancy arrangements.',
  },
  tenanted: {
    label: 'Tenanted',
    summary: 'Residents move in and the agreed ongoing Co-Living services commence.',
    ownerAction: 'Follow property activity and approve additional maintenance expenditure when required.',
    deliverable: 'First verified resident move-in, room condition records and ongoing services.',
  },
} as const satisfies Record<CoLivingOnboardingStage, {
  label: string;
  summary: string;
  ownerAction: string;
  deliverable: string;
}>;

/**
 * Requirements are names of independently reviewed server-side evidence.
 * The pure evaluator is only a UI/test helper. It cannot grant authority.
 */
export const CO_LIVING_STAGE_EXIT_GATES = {
  enquiry: ['contact_recorded', 'consent_recorded', 'assessment_assigned'],
  site_visit: [
    'visit_completed', 'assessment_reviewed', 'existing_tenancy_reviewed',
    'room_use_risks_documented', 'preliminary_budget_recorded',
  ],
  proposal: [
    'verified_owner_authority', 'current_proposal_issued',
    'agreement_executed', 'establishment_budget_approved',
  ],
  implementation: [
    'approved_works_completed', 'room_use_approved', 'inventory_verified',
    'utilities_and_cleaning_ready', 'readiness_independently_approved',
  ],
  advertising: [
    'approved_listing_published', 'first_tenancy_active',
    'first_room_pcr_completed', 'first_room_inventory_completed',
    'ongoing_services_scheduled',
  ],
  tenanted: [],
} as const satisfies Record<CoLivingOnboardingStage, readonly string[]>;

export function nextCoLivingOnboardingStage(
  stage: CoLivingOnboardingStage,
): CoLivingOnboardingStage | null {
  const index = CO_LIVING_ONBOARDING_STAGES.indexOf(stage);
  return CO_LIVING_ONBOARDING_STAGES[index + 1] ?? null;
}

export function evaluateCoLivingOnboardingStageExit(
  stage: CoLivingOnboardingStage,
  reviewedEvidence: Readonly<Record<string, boolean>>,
): { ready: boolean; missing: string[] } {
  const missing = CO_LIVING_STAGE_EXIT_GATES[stage].filter(
    (key) => reviewedEvidence[key] !== true,
  );
  return { ready: missing.length === 0, missing };
}
