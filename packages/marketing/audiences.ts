// Audience-specific editorial content. Distinct from operational permissions and contracted service scope.
type Audience = {
  name: string;
  title: string;
  description: string;
  purpose: string;
  what: Array<[string, string]>;
  before: string;
  boundary: string;
  serviceIds: string[];
  programme?: string;
  deliverables?: string[];
  visual: 'residential' | 'commercial' | 'strata';
};
const ALL_AUDIENCES: Record<string, Audience> = {
  'private-landlords': {
    name: 'Private landlords',
    title: 'Keep your rental property in view.',
    description: 'Residential inspections, condition reports and practical property attendance for Western Australian landlords who manage their own rental property.',
    purpose: 'Keep control of your rental without managing every inspection and contractor attendance alone. Choose individual services, the Residential All Inclusive Subscription with reporting and practical tenancy administration.',
    what: [
      ['Understand property condition', 'Arrange routine, incoming or outgoing condition records suited to the stage of the tenancy.'],
      ['Follow up maintenance', 'Have a reported concern or completed work observed, without mistaking an inspection for repair or certification.'],
      ['Keep work together', 'Authorised property records connect instructions, bookings and issued outcomes in your ProInspect workspace.'],
    ],
    before: 'Have the property details, lawful access arrangements, tenancy context and any previous reports available. A confirmed appointment does not replace any required notice of entry.',
    boundary: 'You remain responsible for landlord decisions and statutory obligations. ProInspect delivers the inspection or attendance agreed in the instruction; it does not become the landlord or property manager.',
    programme: '/residential-property-support', deliverables: ['Dated incoming, routine or outgoing condition records','Recorded maintenance and access follow-up','A property-linked record for authorised review'],
    serviceIds: ['property-condition-report','routine-inspection','pre-vacate-inspection','final-exit-inspection','maintenance-attendance','completed-works-inspection'],
    visual: 'residential',
  },
  'property-management-agencies': {
    name: 'Property management agencies',
    title: 'Extra inspection capacity, without losing control.',
    description: 'Outsourced inspections, property attendance and report documentation for professional residential property management agencies in Western Australia.',
    purpose: 'Give property managers additional operational capacity without transferring their client relationships. ProInspect can undertake inspections, approved tenant administration support, site attendance and maintenance follow-up so agency teams can focus on approvals and relationships.',
    what: [
      ['Support busy inspection schedules', 'Arrange individual or recurring routine and condition inspections under an agreed instruction.'],
      ['Document work and follow-up', 'Use factual attendance and completed-works observations to support your team’s review.'],
      ['Protect client authority', 'Properties, reports and access permissions stay linked to the relevant managing organisation and authorised owners.'],
    ],
    before: 'Specify the instructing agency, property, authorised access procedure, scope, reporting audience and the person who can approve changes.',
    boundary: 'Your agency retains its property-management, leasing, statutory and client decision-making responsibilities. ProInspect acts on the agreed instruction, not as the appointed property manager.',
    programme: '/residential', deliverables: ['Scheduled inspection and condition reports','Contractor access and maintenance follow-up records','Documented portfolio workload and outstanding issues'],
    serviceIds: ['routine-inspection','property-condition-report','final-exit-inspection','contractor-access-attendance','completed-works-inspection','follow-up-reinspection'],
    visual: 'residential',
  },
  'commercial-property-owners': {
    name: 'Commercial property owners',
    title: 'Clearer oversight of your commercial property.',
    description: 'Commercial condition inspections, handover observations, make-good records and on-site support for Western Australian property owners.',
    purpose: 'Reduce everyday landlord coordination through an agreed operating contact who can organise tenant requests, approved works, site inspections, lease-diary support and useful owner updates. Commercial All-Inclusive is $150 + GST per commercial unit each month under an initial 24-month term.',
    what: [
      ['Record current condition', 'Arrange agreed commercial inspections and photographic observations.'],
      ['Prepare for tenancy changes', 'Document pre-vacate and final make-good matters against supplied instructions.'],
      ['Attend when needed', 'Arrange authorised contractor access or a property meeting without committing to full management services.'],
    ],
    before: 'Share the site address, areas to inspect, available lease or handover information, operating restrictions and suitable access contact.',
    boundary: 'Lease interpretation, disputes, technical certification and formal valuation remain separate responsibilities. An observation report is not a determination that a tenant has met lease obligations.',
    programme: '/commercial', deliverables: ['Commercial condition and handover evidence','Delegated tenant enquiries and maintenance action records','An agreed landlord reporting and escalation process'],
    serviceIds: ['commercial-property-inspection','commercial-pre-vacate-make-good-inspection','commercial-final-make-good-inspection','contractor-access-attendance','property-meeting'],
    visual: 'commercial',
  },
  'commercial-asset-managers': {
    name: 'Commercial and asset managers',
    title: 'Site-level records for portfolio decisions.',
    description: 'On-the-ground inspections and property operations support for commercial asset managers overseeing multiple Western Australian sites.',
    purpose: 'Coordinate recurring site work, approved contractors, lease and handover diary items, and issue registers across multiple assets. The operational report identifies the outstanding action, delegated contact and supporting observations for portfolio review.',
    what: [
      ['Maintain site visibility', 'Arrange scheduled condition checks and targeted follow-up visits.'],
      ['Record contractor outcomes', 'Review visible completed works, access arrangements and outstanding matters.'],
      ['Prepare handovers', 'Document nominated commercial vacate and make-good observations without replacing lease or technical advisers.'],
    ],
    before: 'Identify the site, account authority, relevant contacts, scope, operating restrictions and agreed document recipients.',
    boundary: 'ProInspect provides the specified inspection and attendance service; asset strategy, leasing negotiations, finance and statutory approvals remain with the authorised manager.',
    programme: '/commercial', deliverables: ['Site inspection and issue records','Contractor completion and action follow-up','Portfolio reporting against approved work instructions'],
    serviceIds: ['commercial-property-inspection','commercial-final-make-good-inspection','maintenance-attendance','completed-works-inspection','contractor-access-attendance'],
    visual: 'commercial',
  },
  'strata-managers': {
    name: 'Strata managers',
    title: 'Practical support across common property.',
    description: 'Common-property inspections, maintenance observations, contractor attendance and building reporting for strata managers in Western Australia.',
    purpose: 'Combine common-property inspections with scoped cleaning, bin presentation, grounds care, minor maintenance and specialist contractor coordination. Records help the appointed strata manager maintain oversight while retaining statutory and financial authority.',
    what: [
      ['Inspect shared areas', 'Document visible condition, presentation and apparent maintenance concerns.'],
      ['Coordinate on-site work', 'Arrange contractor access, attendance and agreed building tasks.'],
      ['Support the next decision', 'Record defects and follow-up work for the appropriate manager or council process.'],
    ],
    before: 'Confirm the scheme, common-property areas, delegated authority, safe access and the person who can approve changes or additional work.',
    boundary: 'A ProInspect report does not create a strata resolution or grant statutory decision-making power. Approved works and scheme governance remain with the authorised parties.',
    programme: '/strata', deliverables: ['Common-property issue and condition logs','A recurring cleaning, waste or grounds work programme','Contractor access and building handover evidence'],
    serviceIds: ['common-property-inspection','maintenance-attendance','defect-rectification-inspection','contractor-supervision-attendance','building-handover-attendance'],
    visual: 'strata',
  },
  'co-living-operators': {
    name: 'Co-Living owners and operators', title: 'A working routine for every room and shared space.',
    description: 'Room inspections, shared-area care, resident arrivals, departures and ongoing operational support for Co-Living owners and accommodation operators.',
    purpose: 'Coordinate condition evidence, keys, resident arrivals, turnovers, communal cleaning and maintenance under a property-specific operating programme. The operator retains resident agreements, rent and accommodation decisions.',
    what: [
      ['Inspect private and shared spaces', 'Define lawful room visits and shared-area condition records without exposing unrelated resident information.'],
      ['Make turnovers easier', 'Coordinate departures, keys, cleaning follow-up, readiness and room handover records.'],
      ['Keep communal areas functioning', 'Arrange approved cleaning, waste, grounds, maintenance and contractor support.'],
    ],
    before: 'Provide the room plan, shared facilities, resident/tenancy arrangements, operator authority and proposed cleaning and turnover standards.',
    boundary: 'ProInspect provides scoped operational support. Statutory tenancy, financial, licensing and resident acceptance decisions remain with the authorised accommodation operator.',
    programme: '/co-living', deliverables: ['Room-level condition and handover records','Shared-area presentation and maintenance logs','A turnover action and readiness list'],
    serviceIds: ['routine-inspection','common-property-inspection','key-handover-collection','move-in-move-out-attendance','maintenance-attendance'], visual: 'residential',
  },
  'student-accommodation-operators': {
    name: 'Student accommodation operators', title: 'Room-ready operations for Student Living.',
    description: 'Student Living room turnover, resident onboarding, communal care and inspections for accommodation owners and operators.',
    purpose: 'Support furnished bedrooms, private ensuites where applicable, shared bathrooms, kitchens and communal facilities. Establish room and apartment inventories, authorised resident arrivals, turnover workflows and recurring building care.',
    what: [
      ['Prepare each room', 'Record furnishings, fittings, room condition, handover and cleaning requirements before a new resident arrives.'],
      ['Support resident changes', 'Coordinate approved keys, orientation, departure observations and ordinary requests with the operator.'],
      ['Care for the shared environment', 'Maintain agreed checks, waste and cleaning standards, contractor follow-up and issue reports for shared facilities.'],
    ],
    before: 'Provide the building or apartment plan, room identifiers, inclusions, operating rules, shared-area standards and delegated contacts.',
    boundary: 'Student agreements, rent, eligibility, disputes, tenancy notices and statutory responsibilities remain with the authorised operator.',
    programme: '/student-living', deliverables: ['Room-by-room readiness and condition records','Resident arrival and departure action lists','Shared-space care and issue reports'],
    serviceIds: ['property-condition-report','common-property-inspection','key-handover-collection','maintenance-attendance','move-in-move-out-attendance'], visual: 'residential',
  },
  'construction-project-owners': {
    name: 'Construction project owners', title: 'Stay informed between project milestones.',
    description: 'Site observations, milestone reporting, defect follow-up and handover administration for owners, investors and developers.',
    purpose: 'A project produces site visits, records, contractors and decisions that need a clear trail. ProInspect helps track instructed milestones, visible progress, outstanding defects, site meetings and handover tasks.',
    what: [
      ['Record visible progress', 'Request dated observations and photographs at agreed project stages.'],
      ['Track open issues', 'Use action and rectification records to identify nominated work still requiring follow-up.'],
      ['Organise handover', 'Coordinate approved meetings, keys, records and outstanding-item checklists.'],
    ],
    before: 'Identify the project stage, builder, site authority, induction, milestone register, reporting recipients and safe areas.',
    boundary: 'ProInspect does not replace the builder, principal contractor, engineer, site supervisor or certifier. Safety and specialist technical approvals remain with appointed parties.',
    programme: '/construction', deliverables: ['Milestone attendance observations','Defect and outstanding action registers','Handover attendance and records'],
    serviceIds: ['defect-rectification-inspection','completed-works-inspection','property-meeting','other-custom-appointment'], visual: 'commercial',
  },
  'construction-teams': {
    name: 'Construction project teams', title: 'Keep site actions and handovers organised.',
    description: 'Operational attendance, contractor communication and issue follow-up for builders and authorised project teams.',
    purpose: 'Support an appointed builder or project manager with specific site visits, action registers, progress observations, contractor meetings and handover follow-up under clear instruction.',
    what: [
      ['Maintain an action register', 'Document nominated issues, assigned contacts and next steps from approved visits and meetings.'],
      ['Coordinate practical attendance', 'Arrange authorised access, observations and follow-up around project milestones.'],
      ['Prepare handover evidence', 'Record outstanding items and visible completion observations for the responsible professionals.'],
    ],
    before: 'Provide appointed builder authority, inductions, site requirements, work instructions and reporting contacts.',
    boundary: 'ProInspect does not assume site safety control, specialist supervision, certification or variation and payment approval.',
    programme: '/construction', deliverables: ['Site attendance reports','Issue and follow-up registers','Handover observations'],
    serviceIds: ['other-custom-appointment','property-meeting','defect-rectification-inspection','completed-works-inspection'], visual: 'commercial',
  },
  'building-operators': {
    name: 'Building operators',
    title: 'Reliable records for everyday building work.',
    description: 'Building attendance, shared-area checks, access coordination and maintenance observations for Western Australian building operations teams.',
    purpose: 'Build recurring daily or periodic site routines covering presentation, contractor access, waste facilities, resident moves, minor maintenance, issue escalation and building handovers. Agree standards, frequencies and evidence with the authorised building operator.',
    what: [
      ['Help coordinate access', 'Document approved contractor entry, devices and move-related attendance.'],
      ['Observe building issues', 'Record visible maintenance, damage and defect matters in nominated areas.'],
      ['Assist with transitions', 'Support an agreed operational handover and identify missing information.'],
    ],
    before: 'Provide the building rules, authorised contact, access arrangements, safety restrictions, agreed attendance window and required record.',
    boundary: 'A nominated attendance is not a 24-hour response promise, technical sign-off or automatic appointment as building manager.',
    programme: '/strata', deliverables: ['Building tasks and access logs','Presentation and minor maintenance follow-up','Operational handover and issue records'],
    serviceIds: ['building-management-attendance','contractor-access-attendance','move-in-move-out-attendance','building-handover-attendance','defect-rectification-inspection'],
    visual: 'strata',
  },
};

export const AUDIENCES: Record<string, Audience> = Object.fromEntries(Object.entries(ALL_AUDIENCES).filter(([key]) => ['private-landlords','property-management-agencies','tenants','co-living-operators','student-accommodation-providers'].includes(key)));
