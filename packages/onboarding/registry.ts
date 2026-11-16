/**
 * ProInspect onboarding registry — every customer-facing flow has a stable tag and
 * independent version. This is presentation/validation metadata, never authority.
 * Actual membership, delegated actions and document grants remain server-enforced.
 */
export type PortalFamily = 'residential' | 'commercial' | 'strata' | 'resident' | 'operations';
export type EntryPolicy = 'self-registration' | 'reviewed-application' | 'invitation-only' | 'staff-provisioned';
export type OnboardingFlow = {
  id: string;
  version: string;
  family: PortalFamily;
  entry: EntryPolicy;
  title: string;
  summary: string;
  requiredAtStart: readonly string[];
  laterWhenRelevant: readonly string[];
  steps: readonly string[];
  href?: string;
};

export const ONBOARDING_FLOWS = {
  'ONB-AUTH': {
    id: 'ONB-AUTH', version: '1.1.0', family: 'residential', entry: 'self-registration',
    title: 'One ProInspect identity', summary: 'Verify an email address before opening an authorised workspace.',
    requiredAtStart: ['email', 'emailVerification'],
    laterWhenRelevant: ['displayName', 'platformTerms', 'mobile'],
    steps: ['AUTH-01', 'AUTH-02', 'AUTH-03', 'AUTH-04'],
  },
  'ONB-RES-OWNER': {
    id: 'ONB-RES-OWNER', version: '1.0.0', family: 'residential', entry: 'self-registration',
    title: 'Private residential landlord', summary: 'Own and self-manage residential property.',
    requiredAtStart: ['displayName', 'clientName', 'ownershipAttestation', 'legalConsent'],
    laterWhenRelevant: ['propertyAddress', 'propertyType', 'ownershipEvidence', 'tenancyDetails'],
    steps: ['RES-OWNER-01', 'RES-OWNER-02', 'RES-OWNER-03', 'RES-OWNER-04'],
    href: '/onboarding?flow=ONB-RES-OWNER',
  },
  'ONB-RES-AGENCY': {
    id: 'ONB-RES-AGENCY', version: '1.0.0', family: 'residential', entry: 'reviewed-application',
    title: 'Residential property manager', summary: 'Apply for a professional management organisation.',
    requiredAtStart: ['organisationName', 'verifiedApplicant', 'businessReference'],
    laterWhenRelevant: ['abn', 'businessContact', 'agencyAuthority', 'managedPropertyAssignments'],
    steps: ['RES-AGENCY-01', 'RES-AGENCY-02', 'RES-AGENCY-03', 'RES-AGENCY-04'],
    href: '/organisation?flow=ONB-RES-AGENCY',
  },
  'ONB-COM-OWNER': {
    id: 'ONB-COM-OWNER', version: '1.0.0', family: 'commercial', entry: 'self-registration',
    title: 'Commercial property owner', summary: 'Own and manage commercial premises.',
    requiredAtStart: ['displayName', 'clientName', 'ownershipAttestation', 'legalConsent'],
    laterWhenRelevant: ['owningEntity', 'propertyAddress', 'premisesType', 'leaseDetails'],
    steps: ['COM-OWNER-01', 'COM-OWNER-02', 'COM-OWNER-03', 'COM-OWNER-04'],
    href: '/onboarding?flow=ONB-COM-OWNER',
  },
  'ONB-COM-MANAGER': {
    id: 'ONB-COM-MANAGER', version: '1.0.0', family: 'commercial', entry: 'reviewed-application',
    title: 'Commercial asset manager', summary: 'Apply to manage commercial property for clients.',
    requiredAtStart: ['organisationName', 'verifiedApplicant', 'businessReference'],
    laterWhenRelevant: ['abn', 'assetAuthority', 'portfolioAssignments', 'businessContact'],
    steps: ['COM-MANAGER-01', 'COM-MANAGER-02', 'COM-MANAGER-03', 'COM-MANAGER-04'],
    href: '/organisation?flow=ONB-COM-MANAGER',
  },
  'ONB-STR-MANAGER': {
    id: 'ONB-STR-MANAGER', version: '1.0.0', family: 'strata', entry: 'reviewed-application',
    title: 'Strata management organisation', summary: 'Apply for authorised strata scheme management.',
    requiredAtStart: ['organisationName', 'verifiedApplicant', 'businessReference'],
    laterWhenRelevant: ['schemeNumber', 'schemeAddress', 'managementAppointment', 'delegations'],
    steps: ['STR-MANAGER-01', 'STR-MANAGER-02', 'STR-MANAGER-03', 'STR-MANAGER-04'],
    href: '/organisation?flow=ONB-STR-MANAGER',
  },
  'ONB-STR-BUILDING': {
    id: 'ONB-STR-BUILDING', version: '1.0.0', family: 'strata', entry: 'invitation-only',
    title: 'Building or facilities manager', summary: 'Accept an authorised building assignment.',
    requiredAtStart: ['verifiedIdentity', 'approvedBuildingAssignment'],
    laterWhenRelevant: ['delegatedFunctions', 'assignmentDates'],
    steps: ['STR-BUILDING-01', 'STR-BUILDING-02', 'STR-BUILDING-03'],
  },
  'ONB-INV-CORE': {
    id: 'ONB-INV-CORE', version: '1.0.0', family: 'resident', entry: 'invitation-only',
    title: 'Secure Resident invitation', summary: 'An approved property or scheme relationship is mandatory.',
    requiredAtStart: ['recipientEmail', 'existingPropertyScope', 'relationshipKind', 'inviterAuthority'],
    laterWhenRelevant: ['membershipDates', 'appointmentReference'],
    steps: ['INV-CORE-01', 'INV-CORE-02', 'INV-CORE-03', 'INV-CORE-04', 'INV-CORE-05', 'INV-CORE-06'],
  },
  'ONB-INV-RES': {
    id: 'ONB-INV-RES', version: '1.0.0', family: 'resident', entry: 'invitation-only',
    title: 'Residential tenant', summary: 'Invite an individual to an existing tenancy.',
    requiredAtStart: ['recipientEmail', 'existingTenancyId', 'inviterAuthority'],
    laterWhenRelevant: ['tenancyEndDate'],
    steps: ['INV-CORE-01', 'INV-CORE-05', 'INV-CORE-06'],
  },
  'ONB-INV-COM': {
    id: 'ONB-INV-COM', version: '1.1.0', family: 'resident', entry: 'invitation-only',
    title: 'Commercial premises occupant', summary: 'Invite an occupant to a verified, property-bound commercial premises relationship.',
    requiredAtStart: ['recipientEmail', 'propertyId', 'premisesLabel', 'relationshipKind', 'authorityReference', 'inviterAuthority'],
    laterWhenRelevant: ['occupantDelegation'],
    steps: ['INV-CORE-01', 'INV-CORE-05', 'INV-CORE-06'],
  },
  'ONB-INV-STR': {
    id: 'ONB-INV-STR', version: '1.0.0', family: 'resident', entry: 'invitation-only',
    title: 'Building resident or lot owner', summary: 'Invite a verified member of an existing scheme and lot.',
    requiredAtStart: ['recipientEmail', 'schemeId', 'lotId', 'relationshipKind', 'inviterAuthority'],
    laterWhenRelevant: ['membershipEndDate'],
    steps: ['INV-CORE-01', 'INV-CORE-05', 'INV-CORE-06'],
  },
  'ONB-INV-COUNCIL': {
    id: 'ONB-INV-COUNCIL', version: '1.1.0', family: 'resident', entry: 'invitation-only',
    title: 'Strata council member', summary: 'A council appointment and its term require verification.',
    requiredAtStart: ['recipientEmail', 'schemeId', 'termEndDate', 'appointmentAuthority', 'independentStaffReview'],
    laterWhenRelevant: ['appointmentEvidence'],
    steps: ['INV-CORE-01', 'INV-CORE-05', 'INV-CORE-06'],
  },
  'ONB-STAFF': {
    id: 'ONB-STAFF', version: '1.0.0', family: 'operations', entry: 'staff-provisioned',
    title: 'ProInspect operations', summary: 'Staff accounts must be provisioned internally.',
    requiredAtStart: ['verifiedIdentity', 'staffProvisioning'],
    laterWhenRelevant: ['assignmentScope'],
    steps: ['STAFF-01', 'STAFF-02'],
  },
  'UX-DASH': {
    id: 'UX-DASH', version: '1.1.0', family: 'residential', entry: 'self-registration',
    title: 'My ProInspect', summary: 'Group authorised workspaces without combining their permissions.',
    requiredAtStart: ['activeSession'],
    laterWhenRelevant: ['workspaceSelection'],
    steps: ['DASH-01', 'DASH-02'],
  },
  'UX-BOOK': {
    id: 'UX-BOOK', version: '1.0.0', family: 'residential', entry: 'self-registration',
    title: 'Registered service booking', summary: 'Commissioning a ProInspect service requires an account; priced one-off appointments have a separate verified payment obligation.',
    requiredAtStart: ['verifiedIdentity', 'propertyAuthority'],
    laterWhenRelevant: ['paymentOrQuote'],
    steps: ['BOOK-01', 'BOOK-02', 'BOOK-03'],
  },
} as const satisfies Record<string, OnboardingFlow>;

export type OnboardingFlowId = keyof typeof ONBOARDING_FLOWS;
export function isOnboardingFlowId(value: unknown): value is OnboardingFlowId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ONBOARDING_FLOWS, value);
}
export function getOnboardingFlow(value: unknown) {
  return isOnboardingFlowId(value) ? ONBOARDING_FLOWS[value] : null;
}
export function isPublicOnboardingFlow(value: unknown): boolean {
  const flow = getOnboardingFlow(value);
  return flow?.entry === 'self-registration' || flow?.entry === 'reviewed-application';
}
export function isResidentInvitationFlow(value: unknown): boolean {
  return getOnboardingFlow(value)?.family === 'resident';
}
export function portalFamilyForWorkspace(kind: string): PortalFamily {
  if (kind === 'landlord' || kind === 'property-manager') return 'residential';
  if (kind === 'commercial') return 'commercial';
  if (kind === 'strata-manager' || kind === 'building-manager') return 'strata';
  if (kind === 'tenant' || kind === 'commercial-occupant' || kind === 'building' || kind === 'council') return 'resident';
  return 'operations';
}
export const PORTAL_FAMILIES = {
  residential: { label: 'Residential', description: 'My homes, rentals and managed portfolios' },
  commercial: { label: 'Commercial', description: 'Commercial properties and assets' },
  strata: { label: 'Strata', description: 'Schemes and building operations' },
  resident: { label: 'Resident', description: 'Invited tenancies, buildings and council memberships' },
  operations: { label: 'ProInspect Operations', description: 'Internal team operations' },
} as const;
