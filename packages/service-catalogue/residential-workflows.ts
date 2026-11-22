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
