import type { Service } from '../domain/index';
/**
 * Customer-facing residential services from the approved service-scope review.
 * Source: ProInspect Schedule of Fees – Updated, Pay-As-You-Go pages 1–6,
 * subsequently amended by the owner on 22 November 2026.
 *
 * These are discovery and intake definitions, NOT permission to charge or book:
 * live fees, scheduling, service fulfilment and legal issuance remain gated by
 * the existing source-specific release controls and Staff approval.
 */
export const RESIDENTIAL_BOOKING_GROUPS = [
  {
    id: 'inspections',
    title: 'Book an inspection',
    description: 'Property condition reports, routine and exit visits, inventory and maintenance inspections.',
    services: [
      'property-condition-report', 'routine-inspection',
      'follow-up-routine-inspection', 'final-exit-inspection',
      'property-inventory-report', 'vacant-property-check', 'maintenance-inspection',
    ],
  },
  {
    id: 'leasing',
    title: 'Open Homes & leasing',
    description: 'Group open homes, private viewings, property videos and approved tenant handovers.',
    services: [
      'open-home', 'private-open-home', 'video-walkthrough-property',
      'tenant-move-in-handover',
    ],
  },
  {
    id: 'access',
    title: 'Keys & access control',
    description: 'Secure storage, collection, lockboxes, audits, key duplication and locksmiths.',
    services: [
      'off-site-key-storage', 'key-collection', 'key-safe-installation',
      'key-safe-removal-relocation', 'key-audit-register-update',
      'key-cutting-tagging', 'locksmith-services',
    ],
  },
  {
    id: 'urgent',
    title: 'Urgent maintenance',
    description: 'Request an urgent make-good attendance, subject to triage and availability.',
    services: ['urgent-maintenance-make-good'],
  },
] as const;

export type ResidentialBookingGroupId = (typeof RESIDENTIAL_BOOKING_GROUPS)[number]['id'];
export type ResidentialServiceId =
 (typeof RESIDENTIAL_BOOKING_GROUPS)[number]['services'][number];

export const RESIDENTIAL_SERVICE_IDS = new Set<string>(
  RESIDENTIAL_BOOKING_GROUPS.flatMap(group=>[...group.services]),
);
export function isResidentialBookingGroupId(value: string | null): value is ResidentialBookingGroupId {
  return RESIDENTIAL_BOOKING_GROUPS.some(group=>group.id===value);
}
export function groupForResidentialService(id: string | null | undefined): ResidentialBookingGroupId | null {
  return RESIDENTIAL_BOOKING_GROUPS.find(g=>g.services.some(s=>s===id))?.id??null;
}

// Social marketing and tenant application assistance are available ONLY as
// explicitly opted-in Open Home attachments, never standalone catalogue sales.
export const RESIDENTIAL_REQUEST_ONLY = [
  {id:'real-estate-platform-marketing',name:'Real Estate Platform Marketing',kind:'quote'},
  {id:'rent-review-renewal',name:'Rent Review and Renewal Support',kind:'service_request'},
  {id:'abandoned-goods',name:'Abandoned Goods Administration',kind:'enquiry'},
  {id:'court-form-lodgement',name:'Lodgement of Magistrates Court Forms',kind:'enquiry'},
  {id:'maintenance',name:'Maintenance Request',kind:'property_request'},
  {id:'insurance',name:'Insurance Request',kind:'property_request'},
] as const;

export const RESIDENTIAL_SUPPRESSED_BOOKING_IDS = [
  'pre-vacate-inspection',
  'follow-up-reinspection',
  'maintenance-attendance',
  'completed-works-inspection',
  'property-meeting',
  'other-custom-appointment',
  'contractor-access-attendance',
  'key-handover-collection',
] as const;

/** Only displayed as unapproved source candidates, never used for payment. */
export const RESIDENTIAL_SOURCE_FEES = {
  'property-condition-report':20000,
  'routine-inspection':6000,
  'follow-up-routine-inspection':6000,
  'final-exit-inspection':10000,
  'property-inventory-report':20000,
  'vacant-property-check':5000,
  'maintenance-inspection':12000,
  'open-home':5000,
  'private-open-home':5000,
  'video-walkthrough-property':15000,
  'tenant-move-in-handover':10000,
  'off-site-key-storage':500,
  'key-collection':10000,
  'key-safe-installation':12000,
  'key-safe-removal-relocation':12000,
  'key-cutting-tagging':500,
  'locksmith-services':55000,
  'urgent-maintenance-make-good':10000,
} as const satisfies Record<string,number>;

export const RESIDENTIAL_ADD_ONS = {
  inventory_with_pcr:{
    label:'Property Inventory Report (with PCR)',
    parentServices:['property-condition-report'],exGstCents:15000,
    requires:'furnished',kind:'staff_review',
  },
  form19_service:{
    label:'ProInspect to prepare and send Form 19',
    parentServices:['routine-inspection','follow-up-routine-inspection'],
    exGstCents:4000,requires:'notice_applicable',kind:'staff_review',
  },
  tenant_attendance_coordination:{
    label:'ProInspect to coordinate tenant attendance',
    parentServices:['final-exit-inspection'],
    exGstCents:4000,requires:'tenant_attending',kind:'staff_review',
  },
} as const;
export type ResidentialAddOnCode = keyof typeof RESIDENTIAL_ADD_ONS;
export function addOnCandidateTotal(codes: readonly ResidentialAddOnCode[]):number {
  return codes.reduce((sum,code)=>sum+RESIDENTIAL_ADD_ONS[code].exGstCents,0);
}

const residentialRows: Array<[string,string,string,string[],number,number,string]> = [
  ['follow-up-routine-inspection','Follow-Up Routine Inspections','inspections',
    ['residential'],45,24,'Return inspection linked to the previous routine report and outstanding findings.'],
  ['property-inventory-report','Property Inventory Report','inspections',
    ['residential'],90,48,'Document the included inventory at the property; can also be requested with a PCR.'],
  ['vacant-property-check','Vacant Property Check','inspections',
    ['residential'],45,24,'Check a vacant property and provide room photographs and a summary report.'],
  ['maintenance-inspection','Maintenance Inspection','inspections',
    ['residential'],60,24,'Inspect defects, follow up on observable repair completion or capture updated photographs.'],
  ['open-home','Open Home','leasing',['residential'],15,72,
    'Grouped vacant-property viewing; request a date and morning, afternoon or evening window.'],
  ['private-open-home','Open Home (Private)','leasing',['residential'],15,72,
    'Private viewing for an identified attendee; appointment confirmation remains subject to availability.'],
  ['video-walkthrough-property','Video Walkthrough of Property','leasing',['residential'],90,48,
    'Record a property walkthrough and securely share with authorised recipients.'],
  ['tenant-move-in-handover','Tenant Move-In and Handover Support','leasing',['residential'],60,24,
    'Arrange practical move-in tasks, keys and handover for an approved tenancy.'],
  ['off-site-key-storage','Off-Site Key Storage','access',['residential'],30,24,
    'Arrange secure ongoing key custody with a monthly status record.'],
  ['key-collection','Key Collection','access',['residential'],45,24,
    'Collect authorised keys from a named person or collection location.'],
  ['key-safe-installation','Key Safe Installation','access',['residential'],60,24,
    'Install a key safe at an approved location and provide installation evidence.'],
  ['key-safe-removal-relocation','Key Safe Removal or Relocation','access',['residential'],60,24,
    'Remove or relocate an existing safe as instructed.'],
  ['key-audit-register-update','Key Audit and Register Update','access',['residential'],60,24,
    'Scope a property key audit and reconcile custody records.'],
  ['key-cutting-tagging','Key Cutting and Tagging','access',['residential'],30,24,
    'Arrange authorised duplicate keys and identifying tags.'],
  ['locksmith-services','Locksmith Services','access',['residential'],60,24,
    'Arrange and coordinate locksmith access and authorised works.'],
  ['urgent-maintenance-make-good','Urgent Maintenance / Make Good Works','maintenance',
    ['residential'],60,0,'Urgent attendance request requiring safety triage and availability confirmation.'],
];
/** Separate D1/service-seed identities: do not expand the legacy 23 public
    marketing/legal publication IDs or silently publish those service pages. */
export const RESIDENTIAL_NEW_SERVICE_SEEDS: Service[] = residentialRows.map(
  ([id,name,family,sectors,duration_minutes,notice_hours,summary])=>({
    id,name,family,sectors,duration_minutes,notice_hours,summary,
    buffer_before:15,buffer_after:15,horizon_days:60,
    price_ex_gst_cents:null,booking_mode:'request',active:1,
  }),
);
