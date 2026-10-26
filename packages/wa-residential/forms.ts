import {FORM_1AA_FIELDS} from './form1aa';
/**
 * WA residential tenancy forms registry.
 * This is a workflow/index contract, not an authorised reproduction of a
 * prescribed document or a substitute for current legal advice.
 *
 * Every official template needs separate source/version/legal approval
 * before an application can issue its reviewed PDF.
 */
export type WaStage = 'commencement' | 'active' | 'breach' | 'ending' | 'bond';
export type WaAudience = 'tenant' | 'manager' | 'both' | 'specialist';
export type WaField = { key: string; label: string; type: 'text' | 'date' | 'number' | 'textarea'; required: boolean };
export type WaDefinition = {
  code: string;
  name: string;
  stage: WaStage;
  audience: WaAudience;
  kind: 'official' | 'external' | 'restricted';
  purpose: string;
  fields: WaField[];
  signature: 'review' | 'external' | 'physical' | 'none';
  responseDays?: number;
};
const t = (key: string, label: string, required = true): WaField => ({ key, label, type: 'text', required });
const d = (key: string, label: string, required = true): WaField => ({ key, label, type: 'date', required });
const n = (key: string, label: string, required = true): WaField => ({ key, label, type: 'number', required });
const m = (key: string, label: string, required = true): WaField => ({ key, label, type: 'textarea', required });
const F = (
  code: string, name: string, stage: WaStage, audience: WaAudience,
  purpose: string, fields: WaField[],
  signature: WaDefinition['signature'] = 'review',
  kind: WaDefinition['kind'] = 'official',
  responseDays?: number,
): WaDefinition => ({ code, name, stage, audience, purpose, fields, signature, kind, responseDays });
export const OFFICIAL_WA_FORMS_URL = 'https://www.consumerprotection.wa.gov.au/rental-forms-and-notices';
export const WA_BOND_FORMS_URL = 'https://www.consumerprotection.wa.gov.au/bonds-manual-forms';
export const WA_BOND_2026_RELEASE_URL = 'https://www.consumerprotection.wa.gov.au/publications/new-bonds-process-faqs';

/** Ordinary forms: confidential Form 2 is deliberately NOT in this catalogue. */
export const WA_RESIDENTIAL_FORMS: readonly WaDefinition[] = [
  F('WA_FORM_1AA','Form 1AA — Residential tenancy agreement','commencement','manager',
    'Prepare a reviewed copy of the prescribed residential agreement.',FORM_1AA_FIELDS.map(f=>({...f,required:['startsAt','rentFrequency','rentAmount','bondAmount'].includes(f.key)})),'external'),
  F('WA_FORM_1AC','Form 1AC — Information for tenant','commencement','manager',
    'Provide the prescribed information for a written residential agreement.',[d('issueDate','Proposed issue date')],'none'),
  F('WA_FORM_1AD','Form 1AD — Information for non-written agreement','commencement','manager',
    'Provide the prescribed information for an oral/non-written residential agreement.',[d('issueDate','Proposed issue date')],'none'),
  F('WA_FORM_1','Form 1 — Property condition report','commencement','manager',
    'Coordinate the prescribed PCR with the issued inspection report.',[d('inspectionDate','Inspection date'),t('inspectionReference','Related inspection or booking reference')],'external'),
  F('WA_FORM_18','Form 18 — Application to rent residential premises','commencement','manager',
    'Record the application using the approved application document.',[t('applicationReference','Application reference')],'external'),
  F('WA_FORM_18A','Form 18A — Tenancy database notice','commencement','manager',
    'Record use of a tenancy database and associated required notices.',[t('databaseName','Database or application reference')],'none'),
  F('WA_BOND_LODGEMENT','Security bond lodgement','commencement','manager',
    'Prepare and track a government bond lodgement without claiming to lodge automatically.',[n('bondAmount','Bond amount'),d('receivedAt','Date bond received'),t('bondContributors','Bond contributors')],'physical','external'),
  F('WA_FORM_19','Form 19 — Notice of proposed entry','active','manager',
    'Link entry purpose, planned appointment, prescribed notice and evidence of service.',[t('entryPurpose','Reason for entry'),d('entryDate','Proposed entry date'),t('appointmentReference','Booking reference',false)]),
  F('WA_FORM_10','Form 10 — Rent increase notice','active','manager',
    'Prepare a reviewed rent-increase notice where applicable.',[n('newRentAmount','New rent amount'),d('effectiveDate','Proposed effective date'),t('frequency','Payment frequency')]),
  F('WA_FORM_11','Form 11 — Income-linked rent increase','active','manager',
    'Income-calculated rent adjustment in applicable tenancy circumstances.',[n('newRentAmount','New rent amount'),d('effectiveDate','Proposed effective date')]),
  F('WA_FORM_24','Form 24 — Furniture affixing request','active','tenant',
    'Request approval to affix furniture safely.',[m('proposal','What furniture needs securing?'),t('location','Proposed position')],'none'),
  F('WA_FORM_25','Form 25 — Pet request','active','tenant',
    'Request permission to keep a pet; record the actual receipt date and written response.',[t('animal','Type and description of pet'),m('arrangements','Proposed arrangements')],'none','official',14),
  F('WA_FORM_26','Form 26 — Minor modification request','active','tenant',
    'Request a minor modification with relevant documentation and conditions.',[m('proposedWork','Description of modification'),t('location','Affected area')],'none','official',14),
  F('WA_FORM_27','Form 27 — Major modification request','active','tenant',
    'Request a major modification for landlord review.',[m('proposedWork','Description of major modification'),t('location','Affected area')],'none'),
  F('WA_FORM_28','Form 28 — Landlord request to modify','active','manager',
    'Seek the tenant’s consent for a landlord-proposed modification.',[m('proposedWork','Description of work'),d('proposedDate','Proposed works date')],'none'),
  F('WA_FORM_20','Form 20 — Non-rent breach notice to tenant','breach','manager',
    'Record alleged non-rent breach and prepare a reviewed notice.',[m('breachDetails','Alleged breach and evidence'),d('incidentDate','Incident date'),m('remedy','Proposed remedy')]),
  F('WA_FORM_21','Form 21 — Rent non-payment breach notice','breach','manager',
    'Prepare a reviewed rent arrears breach notice based on reconciled records.',[n('arrearsAmount','Verified arrears'),d('arrearsAsAt','Arrears calculated as at'),t('ledgerReference','Rent ledger reference')]),
  F('WA_FORM_23','Form 23 — Tenant notice of lessor breach','breach','tenant',
    'Record the tenant’s alleged lessor breach with supporting material.',[m('breachDetails','Alleged breach'),d('incidentDate','Relevant date'),m('remedy','Requested remedy')]),
  F('WA_FORM_22','Form 22 — Tenant notice of termination','ending','tenant',
    'Prepare an approved tenant termination notice for applicable circumstances.',[d('proposedEndDate','Proposed end date'),t('reason','Grounds or reason')]),
  F('WA_FORM_1A','Form 1A — Non-payment termination following Form 21','ending','manager',
    'Termination process linked to a qualifying earlier Form 21 notice.',[t('breachFormReference','Prior Form 21 notice reference'),d('proposedEndDate','Proposed termination date')]),
  F('WA_FORM_1B','Form 1B — Non-payment termination without prior breach notice','ending','manager',
    'Alternative prescribed non-payment pathway with reviewed conditions.',[n('arrearsAmount','Verified arrears'),t('ledgerReference','Rent ledger reference'),d('proposedEndDate','Proposed termination date')]),
  F('WA_FORM_1C','Form 1C — Termination on other prescribed grounds','ending','manager',
    'Specific statutory termination grounds other than non-payment.',[t('statutoryGround','Applicable statutory ground'),m('evidence','Evidence for ground'),d('proposedEndDate','Proposed termination date')]),
  F('WA_FORM_12','Form 12 — Notice of suspected abandonment','ending','manager',
    'Record basis for suspected abandonment and prescribed notice.',[m('grounds','Evidence supporting suspected abandonment'),d('observedAt','Relevant observation date')]),
  F('WA_FORM_13','Form 13 — Termination following abandonment','ending','manager',
    'Review termination requirements following suspected abandonment.',[t('form12Reference','Prior Form 12 reference'),d('proposedEndDate','Termination date')]),
  F('WA_FORM_14','Form 14 — Mortgagee notice to vacate','ending','specialist',
    'Externally initiated mortgagee process; recording and review only.',[t('mortgageeReference','Mortgagee document reference')],'external','external'),
  F('WA_FORM_17','Form 17 — Superior title recovery notice','ending','specialist',
    'Externally initiated superior-title process; recording and review only.',[t('authorityReference','Official notice or authority reference')],'external','external'),
  F('WA_FORM_CP2','Form CP2 — Disposal of goods to former tenant','ending','manager',
    'Coordinate mandatory goods-disposal notice under applicable conditions.',[m('goodsDescription','Goods left behind'),d('discoveryDate','Date goods identified')]),
  F('WA_FORM_3','Form 3 — Notice as to disposal of goods','ending','manager',
    'Record the applicable alternative goods-disposal notice.',[m('goodsDescription','Goods left behind'),d('discoveryDate','Date goods identified')]),
  F('WA_BOND_VARIATION','Variation of security bond','bond','manager',
    'Coordinate government variation of bond details.',[t('bondReference','Bonds Administration reference'),m('variationDetails','Change requested')],'physical','external'),
  F('WA_BOND_RELEASE','Security Bond Release Application (2026)','bond','both',
    'Use the current bond-release procedure, not the superseded joint disposal application.',[t('bondReference','Bonds Administration reference'),n('claimAmount','Amount proposed for landlord/agent'),m('allocation','Proposed allocations and reasons')],'physical','external'),
  F('WA_BOND_DISPUTE','Bond dispute / Commissioner determination','bond','both',
    'Track external objections, determinations and appeals without purporting to decide them.',[t('bondReference','Bond release application reference'),m('disputeDetails','Dispute and evidence')],'external','external'),
  F('WA_BOND_DISPOSAL','Legacy bond disposal coordination','bond','both',
    'Historical records only; use the Security Bond Release Application for new matters.',[t('legacyReference','Historical bond disposal reference')],'external','external'),
] as const;
export function waForm(code: string): WaDefinition | undefined {
  return WA_RESIDENTIAL_FORMS.find((f) => f.code === code);
}
export function waAvailableForms(kind: string): WaDefinition[] {
  if (!['tenant','landlord','property-manager','staff'].includes(kind)) return [];
  if (kind === 'tenant')
    return WA_RESIDENTIAL_FORMS.filter((f) => ['tenant','both'].includes(f.audience) && f.code !== 'WA_BOND_DISPOSAL');
  if (kind === 'staff') return WA_RESIDENTIAL_FORMS.filter((f) => f.code !== 'WA_BOND_DISPOSAL');
  return WA_RESIDENTIAL_FORMS.filter((f) => ['manager','both'].includes(f.audience) && f.code !== 'WA_BOND_DISPOSAL');
}
