import { PLAN_SCOPE, SERVICE_COVERAGE, PRIVATE_SERVICE_PRICING, RESIDENTIAL_SERVICE_GROUPS, BUILDING_SERVICE_GROUPS } from './public-facts.ts';
export type SectorOverview = {
  name: string; headline: string; summary: string; description: string; audience: string;
  outcome: string; services: Array<[string, string]>; difference: Array<[string, string]>;
  questions: Array<[string, string]>; availability?: string;
};
const groups = (items: ReadonlyArray<readonly [string, string]>) => items.map(([name, detail]) => name + ': ' + detail).join(' ');
const coverage: [string, string] = ['Where do you work?', SERVICE_COVERAGE + ' ' + PRIVATE_SERVICE_PRICING];
export const SECTOR_OVERVIEWS = {
  residential: {
    name: 'Residential', headline: 'Practical support for every stage of your rental property.',
    summary: 'Residential inspections, outsourced property operations and practical building services for self-managing landlords and property managers across Perth and Peel.',
    description: 'Keep control of your rental while we take care of the practical detail. Choose a single inspection, ongoing inspection support or a wider programme covering tenant enquiries, maintenance and property attendance.',
    audience: 'For self-managing landlords and property managers who need dependable support on the ground.',
    outcome: 'Less coordination. Better records. More time for the decisions that matter.',
    services: [
      ['Inspect, advertise and commence', groups(RESIDENTIAL_SERVICE_GROUPS.slice(0, 3))],
      ['Support the tenancy and care for the home', groups(RESIDENTIAL_SERVICE_GROUPS.slice(3, 8))],
      ['Attend, record and manage the exit', groups(RESIDENTIAL_SERVICE_GROUPS.slice(8, 11))],
      ['Help with complex property matters', groups(RESIDENTIAL_SERVICE_GROUPS.slice(11))],
    ],
    difference: [
      ['Condition records you can act on', 'Incoming PCRs, routine inspections and exit reports show what has changed and what needs attention.'],
      ['More capacity, with you in control', 'Delegate agreed inspections, administration and attendance while keeping tenancy and expenditure decisions with your authorised team.'],
      ['One Residential subscription', 'All Inclusive is AUD $50 + GST per week per property, with an initial 24-month term and 60 days’ written cancellation notice.'],
    ],
    questions: [
      ['Can I request just one inspection?', 'Yes. Choose an individual service or ask for a tailored combination. Sign in for service prices or contact us for a quote.'],
      ['How are rooms and shared areas priced?', 'The Residential subscription is per property, never per room. Co-Living operating agreements have a separately quoted site-specific scope.'],
      ['What does my plan include?', 'All Inclusive follows your agreed service schedule. Visit limits, extras and any early-exit terms are confirmed before you join.'],
      coverage,
    ],
  },
  commercial: {
    name: 'Commercial', headline: 'A practical operating partner for your commercial property.',
    summary: 'Commercial inspections, leasing administration, outsourced operations and building support for owners, asset managers and agencies across Perth and Peel.',
    description: 'Keep daily property tasks moving without chasing every visit, enquiry and contractor. ProInspect brings site inspections, occupant support and operational follow-up into one agreed service schedule. Choose one-off work, a tailored portfolio scope or Commercial All-Inclusive at $150 + GST per commercial unit each month.',
    audience: 'For commercial landlords, asset managers and agencies looking after offices, retail, industrial and mixed-use premises.',
    outcome: 'Keep your asset, your instructions and the next action connected.',
    services: [
      ['Inspections and handover records', 'See the condition of accessible premises through periodic visits, commencement records and make-good observations.'],
      ['Leasing administration', 'Support enquiries, viewings, application records and document coordination while your authorised representative makes leasing decisions.'],
      ['Everyday operations', 'Coordinate occupant requests, approved quotes, contractor access, lease diary tasks and owner updates.'],
      ['Building care', 'Bring presentation, cleaning, grounds and minor maintenance into a tailored site programme. Specialist work and costs are agreed separately.'],
    ],
    difference: [
      ['One commercial plan', 'Commercial All-Inclusive is $150 + GST per commercial unit each month. Your schedule sets the services, inspection frequency and allowances.'],
      ['Built around your site', 'Plan attendance around trading hours, inductions and access requirements, with clear reporting to your nominated contact.'],
      ['Approvals stay clear', 'You approve quotes before expenditure. Leasing, legal and technical decisions remain with the appropriately authorised people.'],
    ],
    questions: [
      ['Can you work alongside our managing agent?', 'Yes. We agree the tasks, site contacts and reporting so our work fits your existing team.'],
      ['What is included in Commercial All-Inclusive?', 'Your unit-specific schedule confirms the work, frequency, limits and extras before you join. There is no separate commercial Inspection Only plan.'],
      ['Can you support a portfolio?', 'Yes. Tell us about your sites and workload so we can prepare an appropriate proposal.'],
      coverage,
    ],
  },
  strata: {
    name: 'Strata', headline: 'Better cared-for buildings. Clearer day-to-day operations.',
    summary: 'Common-property inspections, building operations, cleaning, grounds care and maintenance coordination for strata managers and authorised building teams.',
    description: 'Well-kept shared spaces start with a clear routine. Bring common-area inspections, cleaning, waste, gardens and maintenance follow-up together in a building-specific programme, with records your manager or council can use.',
    audience: 'For strata managers, building teams and authorised councils caring for residential, commercial and mixed-use schemes.',
    outcome: 'Bring the building’s daily work into a clear, accountable routine.',
    services: [
      ['Building operations and presentation', groups(BUILDING_SERVICE_GROUPS.slice(0, 2))],
      ['Waste, gardens and grounds', groups(BUILDING_SERVICE_GROUPS.slice(2, 4))],
      ['Maintenance and specialist systems', groups(BUILDING_SERVICE_GROUPS.slice(4, 6))],
      ['Reporting and tailored support', groups(BUILDING_SERVICE_GROUPS.slice(6))],
    ],
    difference: [
      ['A scope built around the building', 'Agree areas, frequency, standards, access, reporting and approval limits. A custom scope can combine several services around the building’s needs.'],
      ['Practical delivery and specialist coordination', 'Safe general works may be delivered within agreed competence and scope. Regulated trades, pools, lifts, fire systems and technical certification require qualified providers.'],
      ['Records for the people responsible', 'Attendance, issue logs and follow-up help managers and councils see what needs action. Scheme decisions and spending approvals stay with authorised parties.'],
    ],
    questions: [
      ['Can you manage recurring building tasks?', 'Yes. Scope operations, cleaning, waste, grounds and maintenance coordination. Frequencies, after-hours needs, materials, specialist work and extra charges are agreed in the proposal.'],
      ['Does this appoint ProInspect as our strata manager?', 'A service enquiry or attendance instruction does not create that appointment. Governance, trust money, statutory and licensed functions require appropriate separate authority.'], coverage,
    ],
  },
  'co-living': {
    name: 'Co-Living', headline: 'Shared living, supported from room to common space.',
    summary: 'Tailored Co-Living and Student Living support: room and common-area inspections, resident administration, turnover coordination and practical property care.',
    description: 'Shared homes need care at room level and across the spaces everyone uses. We help with condition records, resident arrivals, room turnovers and communal care, giving operators a clearer view of what is ready and what needs attention.',
    audience: 'For shared-accommodation owners, Co-Living operators, Student Living providers and authorised accommodation managers.',
    outcome: 'A more consistent property experience for operators and residents.',
    services: [
      ['Room and shared-space inspections', 'Room-condition records, turnover observations and checks of agreed kitchens, bathrooms, living areas and grounds. Confirm lawful access, private areas and recipients of each record.'],
      ['Resident onboarding and communications', 'Welcome information, keys, orientation, ordinary requests and maintenance reporting. Agreements, eligibility, rent collection and tenancy decisions remain with the authorised operator.'],
      ['Day-to-day management support', 'Organise cleaning, waste, gardens, maintenance, contractor access and follow-up around shared living. Agree routines and escalation contacts rather than assuming an always-on response service.'],
      ['Turnovers and custom operating scopes', 'Room readiness, departure records and handover coordination. Tailor inspections, administration and building services to your rooms, occupancy pattern and site standards. Inclusions, frequency and extras are quoted before commitment.'],
    ],
    difference: [
      ['Tailored to your operation', 'Co-Living and Student Living services are available for enquiry and a tailored proposal, from a single room turnover to recurring operations.'],
      ['Considered access and privacy', 'Agree notice, permissions, safe access and information handling. A shared property does not make every resident’s information available to every other resident.'],
      ['Clear decisions and responsibilities', 'Operational support does not imply a statutory appointment or financial authority. The engagement identifies who can approve, instruct and receive records.'],
    ],
    availability: 'Choose a single room turnover or an agreed recurring programme. Private-room access and resident records stay limited to the relevant authorised relationships.',
    questions: [
      ['Can I use a residential plan for separately leased rooms?', 'The Residential subscription is AUD $50 + GST per week per property. Rooms do not create additional subscriptions. End-to-end Co-Living operations require a separate site-specific agreement and quote.'],
      ['Can you support arrivals and turnovers?', 'Yes. Agree the room records, keys, cleaning, maintenance and communication you need. Rental and resident decisions remain with the responsible operator.'],
      coverage,
    ],
  },
  'student-living': {
    name: 'Student Living', headline: 'Room-by-room support for a better student accommodation experience.',
    summary: 'Student accommodation inspections, resident move-in support, room turnovers, communal living care and operational coordination across Perth and Peel.',
    description: 'Make every arrival smoother with rooms that are ready and shared spaces that are cared for. ProInspect supports student accommodation operators with condition records, move-in tasks, turnovers and practical building routines.',
    audience: 'For student accommodation landlords, purpose-built student living operators and managers of room-by-room shared apartments and houses.',
    outcome: 'Every room and shared space has a practical next step.',
    services: [
      ['Room configuration and incoming records', 'Document agreed bedrooms, private ensuites where provided, shared bathrooms, furnishings and common facilities, with lawful access and authorised recipients.'],
      ['Resident onboarding and orientation', 'Assist with approved arrival information, key custody, move-in instructions, condition evidence and ordinary requests. The operator remains responsible for rental and occupancy decisions.'],
      ['Shared facilities and recurring care', 'Coordinate cleaning, waste, maintenance observations, contractor access and reporting for kitchens, lounges, laundries, bathrooms and grounds.'],
      ['Room turnover and readiness', 'Departure observations, inventories, issue registers, cleaning follow-up, room handovers and readiness checks ahead of the next resident.'],
    ],
    difference: [
      ['Purpose-built around occupancy', 'Arrange practical work by room, apartment or building with a defined turnover and shared-space schedule.'],
      ['Evidence and privacy by room', 'Residents may share areas but not all rooms or personal records; permissions and disclosure follow the accepted instruction.'],
      ['Operator-facing support', 'Combine agreed inspections, onboarding administration, communal care and room turnaround with documented actions and escalation.'],
    ],
    availability: 'Tailor support to your rooms, apartments and shared facilities. Resident invitations and room records follow the verified occupancy relationship.',
    questions: [
      ['Can you support an entire accommodation property?', 'Yes. We can scope room inspections, turnovers and communal care around your building and occupancy pattern.'],
      ['Can residential plans apply room by room?', 'A separately leased room is a residential billing unit where the plan is suitable for the occupancy model. Beds and shared areas need a tailored scope; they do not automatically create another standard plan charge.'],
      coverage,
    ],
  },
  construction: {
    name: 'Construction', headline: 'Keep your project’s practical details moving.',
    summary: 'Construction project support, site attendance, progress records, contractor coordination and handover follow-up for owners, developers and project teams.',
    description: 'Stay close to project progress between milestones. ProInspect helps owners and project teams organise site attendance, visible-condition records, contractor communication and handover actions alongside their appointed builder and advisers.',
    audience: 'For owners, developers, investors and project teams seeking coordination, observations and administration alongside their appointed builders and advisers.',
    outcome: 'A clearer view of progress and the actions still to be closed.',
    services: [
      ['Project setup and coordination', 'Project records, action registers, contacts, attendance and milestone follow-up. Confirm instructions, approval limits, reporting frequency and delegated authority.'],
      ['Site attendance and progress records', 'Document safely accessible visible conditions and agreed progress observations. Follow site access, induction and safety requirements. Attendance does not replace the builder’s supervision or safety duties.'],
      ['Contractor and issue follow-up', 'Authorised meetings, access, information requests and action tracking. Designs, variations, payment certification and contractual determinations stay with the appointed professionals and principal.'],
      ['Handover and completion support', 'Visible-condition records, handover information, outstanding-item registers and follow-up. Specialist defects, engineering, surveying, statutory inspections and certification require qualified providers. Scope a single stage or ongoing project support.'],
    ],
    difference: [
      ['Support shaped around your project', 'Construction project support is available for enquiry and a tailored proposal. We define work, outputs, timing and fees before accepting an instruction.'],
      ['A connected record of the next step', 'Site observations, actions and authorised communications stay in context so the responsible people can review progress and follow up.'],
      ['Your professional team keeps its responsibilities', 'General support does not imply appointment as builder, designer, engineer, certifier or legal adviser. Regulated work and technical approvals stay with the appropriate parties.'],
    ],
    availability: 'Arrange one milestone visit or a tailored project support programme. Agree site safety, deliverables and responsibilities before work starts.',
    questions: [
      ['Is construction project support available?', 'Yes. Tell us the location, project stage, appointed team and workload. We will clarify the coordination, attendance and reporting we can provide.'],
      ['Does attendance certify work or approve payment?', 'General observations and administration are distinct from engineering, certification, quantity surveying, contractual decisions and statutory inspections. Those require appropriate qualifications and authority.'], coverage,
    ],
  },
  maintenance: {
    name: 'Maintenance', headline: 'Property care that follows the issue through.',
    summary: 'Maintenance coordination, preventative care, safe minor works and specialist-contractor follow-up for residential, commercial and shared buildings.',
    description: 'Turn reported issues into an approved plan and a documented outcome. We help obtain quotes, arrange contractors and access, and follow through on completed work. Choose one task or build a recurring care routine.',
    audience: 'For owners, agencies, strata and building teams. Tenants should use their property’s nominated reporting process and the responsible manager’s urgent-maintenance instructions.',
    outcome: 'Notice the issue. Agree the work. Keep the outcome in view.',
    services: [
      ['Understand the issue', 'Record the location, visible conditions and access requirements to help identify the right next step.'],
      ['Approve the quote', 'You approve the quote before expenditure. We coordinate agreed contractors and access; labour, materials and specialist costs are separately identified.'],
      ['Care for the property', 'Arrange safe minor works, presentation, waste, gardens and preventative checks, with regulated repairs assigned to qualified trades.'],
      ['Follow through', 'Review visible completion records, outstanding items and any further work requiring your approval.'],
    ],
    difference: [
      ['A useful starting point', 'Clear observations help you choose the next action or the right specialist.'],
      ['Your approval before expenditure', 'No automatic maintenance spending allowance. Costs and variations need your approval before we proceed.'],
      ['A visible outcome', 'Keep the request, approved work and completion evidence connected to your property.'],
    ],
    questions: [
      ['Can I arrange one task or ongoing care?', 'Yes. Request a single task or a tailored recurring scope. ' + PRIVATE_SERVICE_PRICING],
      ['How should a tenant report maintenance?', 'Use the property’s nominated channel, with a clear description and safe photos. Keep access codes and sensitive evidence private. Follow your manager’s urgent instructions; this website is not an emergency service. Contact emergency services if there is immediate danger.'], coverage,
    ],
  },
} satisfies Record<string, SectorOverview>;
export type SectorKey = keyof typeof SECTOR_OVERVIEWS;
