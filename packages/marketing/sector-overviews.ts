export type SectorOverview = {
  name: string;
  headline: string;
  summary: string;
  description: string;
  audience: string;
  outcome: string;
  services: Array<[string, string]>;
  difference: Array<[string, string]>;
  questions: Array<[string, string]>;
  planned?: string;
};

export const SECTOR_OVERVIEWS = {
  residential: {
    name: 'Residential',
    headline: 'More clarity. Less chasing. A better cared-for property.',
    summary:
      'Residential property inspections, condition reports and practical on-site support for landlords and property managers in Western Australia.',
    description:
      'A home is a significant investment, and the small details matter. ProInspect helps you understand its condition, arrange the right attendance and keep a useful record of what happens next. From a single inspection to recurring property support, we work to an agreed scope that fits your property.',
    audience:
      'For self-managing landlords, residential agencies and rental property owners who need dependable support on the ground.',
    outcome:
      'Spend less time coordinating visits and more time making informed property decisions.',
    services: [
      [
        'Inspections and condition reports',
        'Build a clearer picture with routine inspections, incoming property condition reports, pre-vacate visits and final inspections. Record visible condition and items that need your attention.',
      ],
      [
        'Maintenance assessment and follow-up',
        'Have a reported issue attended, relevant observations documented and completed work checked against the agreed instruction. Keep the next action connected to the property.',
      ],
      [
        'Access, keys and handovers',
        'Arrange authorised contractor access, key collection or a property handover when you cannot be there yourself. Confirm the purpose, access arrangements and responsibilities before the visit.',
      ],
      [
        'Support as your portfolio grows',
        'Discuss a one-off task or a recurring inspection arrangement across several homes. Your account brings together the properties and services you are authorised to manage.',
      ],
    ],
    difference: [
      [
        'The visit and the record, together',
        'On-site attendance and its resulting documentation stay in the same property context, helping you pick up the next step without piecing together separate email chains.',
      ],
      [
        'Your property, your decisions',
        'You retain control of approvals, expenditure and tenancy decisions. We provide the agreed observations and practical support to help you act.',
      ],
      [
        'Support that fits the task',
        'Start with the service you need. Broader support and any subscription are separately agreed, with scope and availability confirmed first.',
      ],
    ],
    questions: [
      [
        'Can I arrange just one inspection?',
        'Yes. Start with an individual service enquiry or use the Client Portal to see services relevant to your verified account and property. Availability and pricing are confirmed before work proceeds.',
      ],
      [
        'Do you replace my property manager?',
        'An inspection or attendance instruction does not transfer property management authority. We can support a self-managing landlord or work alongside an authorised agency within an agreed scope.',
      ],
      [
        'What information should I provide?',
        'Tell us the suburb, property type, service required and preferred timeframe. Access instructions and private tenancy information should be shared through the appropriate secure process.',
      ],
    ],
  },
  commercial: {
    name: 'Commercial',
    headline: 'Keep your commercial property moving.',
    summary:
      'Commercial property inspections, condition documentation, access and site attendance for owners, asset managers and commercial agencies in WA.',
    description:
      'Commercial property work needs to fit around tenants, contractors and the way a site operates. ProInspect provides a practical presence on the ground, with clear instructions and documented outcomes that help you manage the next decision from wherever you are.',
    audience:
      'For commercial owners, asset managers, facilities teams and agencies overseeing offices, retail premises and other commercial assets.',
    outcome:
      'Get a clearer view of your asset without needing to attend every site visit yourself.',
    services: [
      [
        'Condition inspections',
        'Document visible property condition at an agreed point in time, including tenancy transitions, periodic reviews and specific areas of concern. Confirm the inspected areas and reporting requirements in advance.',
      ],
      [
        'Make-good and handover observations',
        'Record the visible state of the premises and items for review at handover. A practical record helps the responsible parties assess the next step against their own agreements.',
      ],
      [
        'Contractor and site access',
        'Coordinate authorised access, keys and agreed attendance around site requirements. Set clear expectations for who is attending, the purpose of the visit and the areas involved.',
      ],
      [
        'Facilities and completed-work checks',
        'Arrange a defined visit to observe reported issues or completed work. Keep observations and follow-up items available to the authorised property team.',
      ],
    ],
    difference: [
      [
        'A practical extension of your team',
        'Use defined on-site support to reduce unnecessary travel and coordination across a single building or a wider commercial portfolio.',
      ],
      [
        'Context for the next decision',
        'Keep the instruction, attendance and resulting record linked to the asset, making the outcome easier to review and share with authorised colleagues.',
      ],
      [
        'Clear responsibilities from the start',
        'Agree access, site requirements and reporting boundaries first. Technical certification, valuations and lease determinations require the appropriate specialist.',
      ],
    ],
    questions: [
      [
        'Can you work alongside our managing agent?',
        'Yes. The instruction can sit alongside an authorised agent, asset manager or facilities team. We confirm who can instruct the work and receive the resulting record.',
      ],
      [
        'Can attendance be arranged around site operations?',
        'Tell us about trading hours, inductions and access constraints when enquiring. Timing and any site-specific requirements must be confirmed before attendance.',
      ],
      [
        'Is a make-good observation a legal assessment?',
        'No. We document the agreed visible condition. Interpretation of a lease, responsibility for costs and specialist assessments remain with the relevant parties and advisers.',
      ],
    ],
  },
  strata: {
    name: 'Strata',
    headline: 'Shared spaces deserve clear follow-through.',
    summary:
      'Common-property inspections, contractor access and practical building support for strata managers and authorised scheme representatives in Western Australia.',
    description:
      'A well-run building depends on the details being noticed and followed through. ProInspect helps strata and building teams maintain a practical view of common property, coordinate agreed attendance and keep the resulting observations available to the people responsible.',
    audience:
      'For strata managers, building operators and authorised council or scheme representatives managing shared property.',
    outcome: 'Turn scattered building tasks into defined instructions and useful records.',
    services: [
      [
        'Common-property inspections',
        'Arrange an agreed review of accessible shared areas, with visible observations and matters for further attention documented for the authorised representative.',
      ],
      [
        'Building attendance',
        'Have a practical presence on site for a defined task, meeting or follow-up visit when the managing team cannot be there. Confirm the areas, purpose and expected outcome first.',
      ],
      [
        'Contractor access and coordination',
        'Support authorised contractor attendance and access to agreed common areas. Specialist trades remain responsible for their own technical work and site obligations.',
      ],
      [
        'Maintenance follow-up',
        'Connect reported building issues, observations and completed-work checks to the scheme context so the responsible people can review what needs to happen next.',
      ],
    ],
    difference: [
      [
        'A record for the building',
        'Keep instructions and issued records in the relevant property or scheme context, with access reflecting each person’s authorised relationship.',
      ],
      [
        'Support for the people responsible',
        'Give managers and representatives practical on-site assistance while keeping approvals, budgets and scheme decisions with the authorised parties.',
      ],
      [
        'A scope everyone can understand',
        'Define what will be attended, observed and reported before work starts, especially where several stakeholders are involved.',
      ],
    ],
    questions: [
      [
        'Can a council member instruct work?',
        'The person instructing must have the appropriate authority for the scheme and the task. We confirm the relationship and scope before proceeding.',
      ],
      [
        'Do inspections include technical certification?',
        'A general visual inspection does not certify structural, fire, electrical or other specialist compliance. Where specialist assessment is needed, the scope must be referred to the appropriate provider.',
      ],
      [
        'Can support cover recurring building tasks?',
        'Discuss the building, the tasks and the required frequency with us. Any recurring arrangement needs agreed responsibilities, service availability and commercial terms.',
      ],
    ],
  },
  'co-living': {
    name: 'Co-Living',
    headline: 'Better shared living starts with the details.',
    summary:
      'Explore property inspection and shared-space support for co-living operators, with future room and occupancy management being developed separately.',
    description:
      'Shared homes bring together private rooms, communal spaces and several people’s expectations. A clear view of property condition and practical follow-up can help operators create a better everyday experience. Talk to ProInspect about the inspection or attendance task your property needs.',
    audience:
      'For shared-accommodation owners and co-living operators planning practical support for rooms and communal areas.',
    outcome:
      'Build a clearer picture of shared property needs, from room condition to common-space follow-up.',
    services: [
      [
        'Room-condition requirements',
        'Discuss the areas that need to be observed and the record you need at a change of occupancy. Any available inspection must be confirmed under its own agreed scope.',
      ],
      [
        'Shared-space observations',
        'Identify practical inspection requirements for kitchens, living areas and other communal spaces, with privacy and access arrangements clarified before any attendance.',
      ],
      [
        'Maintenance and access support',
        'Enquire about defined property attendance, authorised contractor access or follow-up observations for a shared accommodation property.',
      ],
      [
        'Planning ongoing support',
        'Describe your property, operating model and recurring workload so we can assess what existing services may suit and what remains a future capability.',
      ],
    ],
    difference: [
      [
        'Start with the property task',
        'An enquiry helps establish whether an existing inspection or attendance service is appropriate, without assuming a full management package is available.',
      ],
      [
        'Respect for shared and private spaces',
        'Clear instructions identify the permitted areas, access arrangements and people authorised to receive any resulting record.',
      ],
      [
        'A considered path forward',
        'Future room, bed and occupancy features are being developed separately. Interest in them does not activate a service or create a subscription.',
      ],
    ],
    planned:
      'Full Co-Living management is planned and is not yet available to book. Room, bed and occupancy management will require a separate approved release. Enquire about the suitability of existing property services.',
    questions: [
      [
        'Can I book full Co-Living management now?',
        'No. Full Co-Living management is planned. Contact us to discuss whether an existing property inspection or attendance service can meet a specific requirement.',
      ],
      [
        'Does signing up activate room or occupancy management?',
        'No. Your account only shows services available for your verified relationships. Registering interest does not activate a planned module.',
      ],
      [
        'What should an operator include in an enquiry?',
        'Include the general location, property layout, shared and private areas involved, and the task you need addressed. Leave personal occupant details out of an initial enquiry.',
      ],
    ],
  },
  construction: {
    name: 'Construction',
    headline: 'A clearer view of what is happening on site.',
    summary:
      'Discuss construction-related property attendance, observations and handover requirements. Full construction project management is a planned future capability.',
    description:
      'Site visits are more useful when everyone understands the question they need to answer. ProInspect can review a defined requirement for property attendance or documentation and clarify whether an existing service is suitable, including its access, safety and reporting boundaries.',
    audience:
      'For property owners, developers and project teams seeking a defined on-site observation or attendance requirement.',
    outcome:
      'Start with a clear instruction and understand what the resulting record can help you decide.',
    services: [
      [
        'Site attendance requirements',
        'Discuss the purpose of a visit, the relevant areas and any induction or safety arrangements. Attendance is subject to service suitability, authorisation and confirmed access.',
      ],
      [
        'Visible-condition documentation',
        'Explore a record of agreed visible property conditions or observations at a point in time. This is distinct from building certification or technical construction assessment.',
      ],
      [
        'Handover and follow-up',
        'Clarify the observations or follow-up information you need for a property handover. Specialist defect assessment and certification require separately qualified providers.',
      ],
      [
        'Future project coordination',
        'Tell us about your project-linked workflow needs. Full project, milestone and contractor-management functionality will be considered through a separate approved release.',
      ],
    ],
    difference: [
      [
        'The right question before the visit',
        'Agree the purpose and reporting output so the record addresses the task you actually need help with.',
      ],
      [
        'A practical record of attendance',
        'Where a service is available and confirmed, retain the resulting observations in the appropriate authorised property context.',
      ],
      [
        'Clear technical boundaries',
        'Construction expertise, certification and contractual decisions are not implied by general attendance. We clarify suitability before accepting an instruction.',
      ],
    ],
    planned:
      'Full Construction project management is planned and is not yet available to book. Project, milestone and contractor-management features remain subject to separate development and approval.',
    questions: [
      [
        'Is full construction project management available?',
        'No. This is a planned future capability. Contact us about a defined attendance or property observation task so we can assess existing service suitability.',
      ],
      [
        'Do you certify building work?',
        'General property attendance does not provide building certification, engineering advice or specialist compliance assessment. Those requirements must be addressed by the appropriate professional.',
      ],
      [
        'What does a site enquiry need to include?',
        'Tell us the location, project stage, reason for attendance and known access or induction requirements. We confirm suitability and scope before any instruction proceeds.',
      ],
    ],
  },
  maintenance: {
    name: 'Maintenance',
    headline: 'From a reported issue to a clear next step.',
    summary:
      'Property maintenance assessment, contractor access and completed-work follow-up for residential, commercial and strata properties in WA.',
    description:
      'A maintenance report is only the beginning. ProInspect helps owners and managers clarify what has been reported, arrange agreed on-site support and retain a record of the follow-up. You can focus on the decision while the practical property task gets the attention it needs.',
    audience:
      'For property owners, managers, strata teams and tenants using the authorised maintenance reporting process for their property.',
    outcome:
      'Understand the issue, coordinate the next action and keep track of what was observed.',
    services: [
      [
        'Reported-issue assessment',
        'Arrange a defined visit to observe the reported problem and document relevant visible conditions. A clear description and supporting record help the authorised decision-maker choose the next step.',
      ],
      [
        'Authorised contractor access',
        'Coordinate agreed attendance, access or key arrangements for the contractor instructed by the responsible owner or manager.',
      ],
      [
        'Completed-work observations',
        'Have the visible outcome of a repair or other work checked against an agreed instruction, with follow-up items documented for review.',
      ],
      [
        'Property-linked follow-up',
        'Keep maintenance requests, attendance and resulting records connected to the relevant property and authorised account. Existing tenants should use their property’s nominated reporting channel.',
      ],
    ],
    difference: [
      [
        'Useful detail for a practical decision',
        'Focus the attendance on what needs to be understood, where it is and what the responsible person needs recorded.',
      ],
      [
        'Approvals stay in the right hands',
        'Repair instructions, spending approvals and technical work remain with the authorised owner, manager and appointed trade unless separately agreed.',
      ],
      [
        'A clearer handover between steps',
        'Keep the property context available as an issue moves from a report to attendance and follow-up, reducing the need to explain the same task again.',
      ],
    ],
    questions: [
      [
        'Do you carry out every repair yourselves?',
        'Maintenance attendance and observations do not automatically include a trade repair. The responsible party confirms repair approval and the appropriate contractor under the agreed arrangement.',
      ],
      [
        'How should a tenant report an issue?',
        'Use the maintenance process nominated by your landlord or property manager, or your authorised tenant workspace where available. Include the location, description and relevant photos without sharing private access details publicly.',
      ],
      [
        'What if the issue is urgent?',
        'This website and its enquiry form are not an emergency response service. Follow the urgent-maintenance instructions in your tenancy or building information and contact emergency services if there is immediate danger.',
      ],
    ],
  },
} satisfies Record<string, SectorOverview>;

export type SectorKey = keyof typeof SECTOR_OVERVIEWS;
