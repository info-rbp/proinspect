import { SERVICE_SEEDS } from '../service-catalogue/index';

/** Draft scope schedules for exactly the 23 active seed services. Not a rate card. */
type Scope = { work: string; output: string; limits: string };
export const SERVICE_SCOPE_DETAILS: Record<string, Scope> = {
  'routine-inspection': {
    work: 'Attend an authorised residential rental at the agreed time; visually record presentation, accessible fixtures and visible maintenance concerns. Entry notice is arranged by the legally responsible party.',
    output: 'Dated factual inspection report with relevant photographs and identified items for client review.',
    limits: 'Not a structural, pest, electrical or safety certification. A booking does not itself issue WA Form 19 or authorise entry. Routine entry frequency and notice comply with WA tenancy law.',
  },
  'property-condition-report': {
    work: 'Document the incoming condition of a residential rental, its fixtures, fittings and relevant inventory using the current statutory Form 1 where the report is intended as a WA residential tenancy PCR.',
    output: 'Detailed factual condition record, relevant photographs and a versioned report available to authorised recipients.',
    limits: 'Must preserve all required Form 1 content; tenant distribution and response deadlines remain the responsible lessor or authorised manager\'s obligations. Not a building inspection.',
  },
  'pre-vacate-inspection': {
    work: 'Record apparent presentation, cleaning and maintenance matters before the planned end of occupancy where entry is lawful.',
    output: 'Dated pre-vacate observations and photographs highlighting matters for the tenant and client to consider.',
    limits: 'Not a final determination of bond deductions, damage liability or entitlement to possession.',
  },
  'final-exit-inspection': {
    work: 'Record the visible outgoing condition following lawful access and compare it with an available incoming PCR and documented changes.',
    output: 'Outgoing condition observations and comparative factual evidence for authorised review.',
    limits: 'Not a determination of bond disputes or tenant liability. The current WA statutory PCR requirements apply when used as a prescribed report.',
  },
  'commercial-property-inspection': {
    work: 'Inspect reasonably accessible commercial premises for visible condition, presentation and operational concerns within an agreed area.',
    output: 'Dated photographic commercial condition report with observations and action items.',
    limits: 'No engineering, fire, electrical, hazardous-material or regulatory certification; site-specific safety and access rules prevail.',
  },
  'commercial-pre-vacate-make-good-inspection': {
    work: 'Document visible premises condition and nominated handover items before commercial vacate, referencing client-supplied lease information as factual context.',
    output: 'Photographic pre-vacate condition and apparent make-good evidence list.',
    limits: 'No legal interpretation of lease terms, final make-good liability or valuation unless separately appointed and qualified.',
  },
  'commercial-final-make-good-inspection': {
    work: 'Inspect the visible condition of agreed commercial premises following vacate or completion of nominated works.',
    output: 'Dated final handover evidence and observed outstanding items.',
    limits: 'Not legal certification of discharge of lease obligations, a structural assessment or a warranty of completed works.',
  },
  'common-property-inspection': {
    work: 'Inspect agreed and lawfully accessible common-property areas, amenities and pathways for visible condition and presentation.',
    output: 'Photographic findings and factual maintenance observations for the authorised scheme representative.',
    limits: 'No statutory strata management authority, binding council decisions, hazardous-area entry or specialist certification.',
  },
  'building-management-attendance': {
    work: 'Attend a building for agreed operational observations, access support or coordination requested by an authorised building representative.',
    output: 'Attendance register, dated notes, photographs and authorised follow-up items as agreed.',
    limits: 'No automatic authority to manage the scheme, direct contractors, approve expenditure or act as a 24-hour emergency responder.',
  },
  'maintenance-attendance': {
    work: 'Attend an identified issue to observe visible condition, collect evidence and report the need for qualified assessment or approved repair.',
    output: 'Issue-specific attendance notes, condition photographs and recommended administrative next steps.',
    limits: 'Does not include repair labour, diagnostic testing, contractor appointment or approval to spend without separate authorisation.',
  },
  'completed-works-inspection': {
    work: 'Visually review agreed areas following authorised works to document whether the nominated work appears complete.',
    output: 'Completion photographs, observed omissions and an evidence record.',
    limits: 'Not a workmanship warranty, building certification, occupational safety sign-off or evidence of concealed works.',
  },
  'follow-up-reinspection': {
    work: 'Revisit a previously reported condition or nominated rectification matter where safe and lawful access is available.',
    output: 'Updated observations compared with the relevant earlier issue and photographic evidence.',
    limits: 'Limited to nominated items; no comprehensive reassessment of unrelated property components.',
  },
  'damage-incident-inspection': {
    work: 'Document visible incident-related damage in an agreed area without disturbing the scene or undertaking specialist analysis.',
    output: 'Dated photographs, location notes and factual damage observations.',
    limits: 'Does not determine cause, insurance coverage, liability or the safety of structurally compromised premises.',
  },
  'cleaning-presentation-inspection': {
    work: 'Check the apparent cleanliness and presentation of agreed common or operational areas against the accepted checklist.',
    output: 'Presentation checklist, photographs and observed rectification points.',
    limits: 'No microbiological testing, hazardous waste assessment or performance certification of a cleaning contractor.',
  },
  'defect-rectification-inspection': {
    work: 'Record an agreed defect or rectification item, its observable status and supporting photographs.',
    output: 'Issue register update and factual evidence showing observed condition.',
    limits: 'No diagnosis of hidden defects, engineering determination or compulsory direction to a trade contractor.',
  },
  'property-meeting': {
    work: 'Meet a nominated authorised client, manager, occupier or contractor onsite for the agreed practical purpose.',
    output: 'Attendance record and agreed factual action list.',
    limits: 'Does not confer power to sign contracts, make statutory decisions or approve expenditure on behalf of the client.',
  },
  'contractor-access-attendance': {
    work: 'Facilitate lawful access for an approved contractor and document arrival, handover and return of access devices.',
    output: 'Attendance and access record; photographs where agreed and lawful.',
    limits: 'The principal appoints and pays the contractor; ProInspect does not independently authorise work or certify quality.',
  },
  'key-handover-collection': {
    work: 'Collect, deliver or return specified keys, fobs and remotes between approved parties, recording chain of custody.',
    output: 'Dated handover receipt and access-device register update.',
    limits: 'Does not include locksmith works, replacement hardware or authority to grant occupancy or possession.',
  },
  'contractor-supervision-attendance': {
    work: 'Provide defined operational observation while approved trades attend, and relay factual progress information to the instructing party.',
    output: 'Dated attendance and observed progress log.',
    limits: 'Not technical supervision, WHS principal-contractor appointment, design sign-off or authority to change contractor scope.',
  },
  'move-in-move-out-attendance': {
    work: 'Coordinate approved building access and practical shared-area requirements for an authorised move.',
    output: 'Access/attendance record and observed common-area condition notes.',
    limits: 'No tenancy decision, removalist service, bond determination or unapproved handling of personal property.',
  },
  'urgent-building-attendance': {
    work: 'Assess and triage a requested urgent site attendance subject to availability, safe access and specific acceptance.',
    output: 'Urgent attendance record and escalation to the responsible party.',
    limits: 'Not a 24/7 response promise or an emergency-services, qualified trade or statutory urgent-repair substitute.',
  },
  'building-handover-attendance': {
    work: 'Support operational transfer between authorised building representatives, recording agreed assets, contacts and devices.',
    output: 'Handover checklist, outstanding-information list and dated receipt.',
    limits: 'Not certification of building compliance, legal handover of ownership or acceptance of hidden defects.',
  },
  'other-custom-appointment': {
    work: 'Carry out the site visit specifically described in an approved quotation or signed work order.',
    output: 'Only the factual deliverable identified in that accepted instruction.',
    limits: 'No unspecified scope, specialist services, spending authority or guaranteed result. A bespoke task is not accepted until its scope and commercial terms are agreed.',
  },
};

export const SERVICE_SCOPE_SECTIONS: Array<[string, string]> = SERVICE_SEEDS.map((service) => {
  const detail = SERVICE_SCOPE_DETAILS[service.id];
  if (!detail) throw new Error('Missing legal scope for service: '+service.id);
  return [
    service.name+' — '+service.sectors.join(', '),
    'Agreed work: '+detail.work+'\\n\\nDeliverable: '+detail.output+'\\n\\nScope limitations: '+detail.limits+
    '\\n\\nPricing: The current service catalogue or individually accepted quote, not this draft schedule. Booking availability, access and applicable terms must be confirmed.',
  ];
});
