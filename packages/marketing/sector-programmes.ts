/**
 * Public-facing descriptions of available delivery programmes, not contractual
 * entitlements, response-time commitments, statutory appointments or fee schedules.
 * Each programme is scoped to the client's location, authority and workload.
 */
export type SectorProgramme = {
  benefit: string;
  outputs: Array<[string, string]>;
  onboarding: Array<[string, string]>;
  nextStep: string;
};
export const SECTOR_PROGRAMMES: Record<string, SectorProgramme> = {
  residential: {
    benefit: 'From a new tenancy through routine care and vacate, use one coordinated instruction pathway and keep the resulting evidence connected to your property.',
    outputs: [
      ['A condition record at each key stage', 'Incoming PCRs, routine visit observations, follow-up reports and outgoing comparisons are selected to suit the tenancy stage.'],
      ['Less back-and-forth for ordinary tasks', 'Agreed tenant enquiries, viewing attendance, maintenance requests and contractor access are routed to the person who can act.'],
      ['An organised next-action list', 'Reports identify visible issues, outstanding tasks and follow-up information for landlord or agency review.'],
      ['A practical property history', 'Authorised documents, photographs and attendance records can be reviewed with the property rather than across unrelated emails.'],
    ],
    onboarding: [
      ['Confirm the property and responsible parties', 'Identify the owner, managing agency if any, the authorised service contact and the decisions ProInspect may support.'],
      ['Review tenancy and access requirements', 'Provide existing condition records, notice procedures, property instructions and known risks through approved channels.'],
      ['Choose the engagement model', 'Select an individual service, the Residential All Inclusive Subscription.'],
      ['Agree the working schedule', 'Confirm visits, included allowances, approvals, extras, communication and reporting before work starts.'],
    ],
    nextStep: 'Compare the residential plans or ask us to develop an outsourced workload proposal.',
  },
  commercial: {
    benefit: 'A nominated operational contact can coordinate day-to-day property tasks and give the landlord or asset manager a clearer view of decisions requiring approval.',
    outputs: [
      ['Tenancy and site issue coordination', 'Receive and log agreed occupant enquiries, access issues and maintenance reports, then route them to the responsible party.'],
      ['Lease and handover administration', 'Track instructed diary events, supplied lease information, commencement records and make-good observations without interpreting lease obligations.'],
      ['Works and contractor follow-through', 'Seek agreed quotations, arrange approved attendance and document apparent completion or outstanding items.'],
      ['Owner-facing action reports', 'Provide agreed status records identifying the issue, action taken, next decision, responsible person and supporting evidence.'],
    ],
    onboarding: [
      ['Map the ownership and management structure', 'Identify the contracting client, tenants, existing agent, site contacts and authority for instructions or approvals.'],
      ['Review site operations', 'Record premises type, use, access restrictions, existing services, open issues, contractors and required reporting.'],
      ['Agree the operating matrix', 'Define requests to receive, lease dates to monitor, approved workstreams, frequency, spending authority and escalation.'],
      ['Commence the reporting cycle', 'Confirm what is reported to the landlord, what remains with an appointed agent and how extras are approved.'],
    ],
    nextStep: 'Discuss the Commercial All-Inclusive plan or a portfolio-level operational proposal.',
  },
  strata: {
    benefit: 'Keep cleaning, waste, gardens, minor works and contractor activity aligned to a building programme that the appointed strata or building manager can oversee.',
    outputs: [
      ['A scheduled building care programme', 'Combine agreed shared-area checks, presentation, cleaning, waste routines and garden attention with documented frequencies.'],
      ['Visible issue and defect records', 'Log locations, observations, photographs, outstanding tasks and appropriate escalation contacts.'],
      ['Contractor oversight and access records', 'Coordinate approved access, handovers and operational follow-up while specialist contractors retain certification duties.'],
      ['Building reporting for authorised representatives', 'Provide attendance summaries, issue registers and agreed updates to the manager or council process.'],
    ],
    onboarding: [
      ['Walk the property and identify assets', 'Agree common-property boundaries, facilities, access routes, amenities and known maintenance issues.'],
      ['Agree service standards and schedules', 'Set cleaning areas, bin routines, grounds requirements, building checks and permitted minor works.'],
      ['Establish authority and escalation', 'Confirm council/manager instructions, spending limits, specialist contacts and emergency procedures.'],
      ['Mobilise and review', 'Implement the agreed work programme, record outcomes and revisit scope or frequency at agreed reviews.'],
    ],
    nextStep: 'Request a building-specific scope with work frequencies and reporting responsibilities.',
  },
  'co-living': {
    benefit: 'Manage the work created by multiple residents and shared facilities without treating individual rooms as an ordinary single-house tenancy.',
    outputs: [
      ['Room and shared-space condition records', 'Record the condition of nominated private rooms and communal kitchens, bathrooms, lounges and outdoor areas with lawful access.'],
      ['Resident arrival and departure support', 'Coordinate instructions for keys, orientation, room readiness, inventory checks and outgoing evidence.'],
      ['Shared-area presentation and care', 'Plan agreed cleaning, waste, gardens, maintenance and repairs around occupancy and site standards.'],
      ['A room-turnover action list', 'Track outstanding cleaning, damages for review, access devices, contractor visits and readiness for the next resident.'],
    ],
    onboarding: [
      ['Understand the operating model', 'Identify the accommodation operator, rooms, bed spaces, resident agreements and decision-making authority.'],
      ['Establish room and common-area standards', 'Agree how inspections, privacy, notice, inventories, cleaning and handover records will be handled.'],
      ['Set the resident communication route', 'Confirm where ordinary requests go and who decides eligibility, rent, disputes and tenancy matters.'],
      ['Agree turnover and recurring support', 'Set room turnover tasks, shared-area routines, escalation and quotation or subscription scope.'],
    ],
    nextStep: 'Discuss a single room turnover or a recurring shared-accommodation service programme.',
  },
  'student-living': {
    benefit: 'Support room-by-room occupancy and the communal experience through coordinated turnovers, resident arrivals, condition records and property care.',
    outputs: [
      ['Room-level readiness and handovers', 'Record bedroom, ensuite where applicable, inventory and shared-bathroom conditions for each instructed room.'],
      ['Resident onboarding support', 'Coordinate arrival information, authorised key handovers, move-in orientation and ordinary property enquiries.'],
      ['Communal living standards', 'Arrange inspections and agreed cleaning or maintenance follow-up for shared kitchens, lounges, laundries and grounds.'],
      ['Turnover and occupancy-change records', 'Prepare departure observations, cleaning follow-up, room readiness and action reports for the operator.'],
    ],
    onboarding: [
      ['Map rooms and configurations', 'Record room identifiers, private and shared facilities, furnishings, common areas and operational contacts.'],
      ['Confirm the resident model', 'Identify the responsible operator, rental or licence arrangement, notice requirements and approval boundaries.'],
      ['Build the turnover procedure', 'Agree condition photos, inventories, keys, inspections, cleaning, maintenance, move-in and move-out responsibilities.'],
      ['Mobilise recurring care', 'Schedule agreed common-area routines, resident support contacts, reporting and approval pathways.'],
    ],
    nextStep: 'Request a Student Living scope for a building, apartment mix or room-by-room accommodation.',
  },
  construction: {
    benefit: 'Give owners and project teams a documented view of site progress, outstanding actions and handover readiness without replacing the appointed builder or certifier.',
    outputs: [
      ['Milestone and progress records', 'Document visible work at agreed stages, with dated photographs and factual notes for the project team.'],
      ['A live issue and follow-up trail', 'Record nominated defects, incomplete items, responses and reinspection status against supplied lists.'],
      ['Contractor and meeting coordination', 'Assist with authorised site meetings, access, action registers and document follow-up.'],
      ['Completion and handover support', 'Compile agreed access records, visible handover observations, outstanding items and follow-up documentation.'],
    ],
    onboarding: [
      ['Confirm project stage and stakeholders', 'Identify the principal, builder, consultants, site contact, contractor responsibilities and ProInspect instructions.'],
      ['Agree safe access', 'Confirm inductions, site rules, hazards, permitted areas and scheduling around active work.'],
      ['Define records and milestones', 'Specify the progress checkpoints, issue register, photographic format and reporting recipients.'],
      ['Run the follow-up cycle', 'Record observations, escalate decisions to authorised professionals and revisit nominated items when instructed.'],
    ],
    nextStep: 'Scope a single project milestone, ongoing progress attendance or a practical handover programme.',
  },
  maintenance: {
    benefit: 'Move from a reported concern to an authorised work plan and a documented outcome, rather than losing tasks between emails and contractor visits.',
    outputs: [
      ['A clear maintenance intake record', 'Capture the reported issue, area, severity and known access or safety constraints.'],
      ['Approved contractor and works coordination', 'Arrange quotations, instructions and site access only within the client’s delegated authority.'],
      ['Practical preventative and minor care', 'Scope safe general minor works, presentation, waste, garden and recurring checks separately from regulated trades.'],
      ['Completed-work and outstanding-item reports', 'Photograph visible results and identify follow-up decisions or specialist assessment needs.'],
    ],
    onboarding: [
      ['Identify maintenance contacts', 'Agree who reports issues, who approves expenditure and which contractors are nominated.'],
      ['Record property and access conditions', 'Confirm location, facilities, hazards, service boundaries and permitted attendance times.'],
      ['Set routine or one-off work instructions', 'Choose initial inspection, approved repairs, preventive checks and records required.'],
      ['Review and close tasks', 'Log completion evidence, unresolved matters and the person responsible for next decisions.'],
    ],
    nextStep: 'Tell us the issue, location and whether you need one repair follow-up or a scheduled care programme.',
  },
};
