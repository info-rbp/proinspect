import { PLAN_SCOPE, PLAN_TERM, SERVICE_COVERAGE, PRIVATE_SERVICE_PRICING, RESIDENTIAL_SERVICE_GROUPS, BUILDING_SERVICE_GROUPS } from './public-facts.ts';
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
    description: 'Keep control of your property while we help with the work behind it. From an incoming condition record to an open home, maintenance follow-up or coordinated vacate, ProInspect brings inspections, administration and attendance together. Choose an individual service, an inspection plan or broader outsourced operations. Residential Inspection Only is $20 + GST per property per month; Residential All-Inclusive is $150 + GST per property per month. ' + PLAN_TERM,
    audience: 'For self-managing landlords, rental property owners and residential agencies needing operational capacity. Your scope identifies who instructs, who approves and who receives the records.',
    outcome: 'Less coordination. Better records. More time for the decisions that matter.',
    services: [
      ['Inspect, advertise and commence', groups(RESIDENTIAL_SERVICE_GROUPS.slice(0, 3))],
      ['Support the tenancy and care for the home', groups(RESIDENTIAL_SERVICE_GROUPS.slice(3, 8))],
      ['Attend, record and manage the exit', groups(RESIDENTIAL_SERVICE_GROUPS.slice(8, 11))],
      ['Help with complex property matters', groups(RESIDENTIAL_SERVICE_GROUPS.slice(11))],
    ],
    difference: [
      ['Inspections with a useful outcome', 'Incoming PCRs, routine visits, follow-ups, vacancy checks, inventories, pre-leasing reviews and final inspections answer different questions. We confirm the purpose, accessible areas and required record before attending.'],
      ['Outsourced operations, with your authority clear', 'Choose support across fourteen service groups. Notices, rent collection, expenditure, bond decisions, legal representation and regulated work require the appropriate appointment, authority or specialist.'],
      ['Two clear subscription options', 'Inspection Only: $20 + GST per property/month. All-Inclusive: $150 + GST per property/month. ' + PLAN_TERM + ' ' + PLAN_SCOPE],
    ],
    questions: [
      ['Can I request one inspection or a tailored service?', 'Yes. Request a single service or tailored combination. ' + PRIVATE_SERVICE_PRICING],
      ['What does a subscription include?', PLAN_SCOPE + ' Account registration is separate from subscribing; no paid plan starts merely because you sign up.'], coverage,
    ],
  },
  commercial: {
    name: 'Commercial', headline: 'A practical operating partner for your commercial property.',
    summary: 'Commercial inspections, leasing administration, outsourced operations and building support for owners, asset managers and agencies across Perth and Peel.',
    description: 'Connect your premises, its occupants and the people making decisions. We combine inspections, property administration, contractor coordination and site attendance so you can act on clear records. Commercial All-Inclusive is $150 + GST per property per month. ' + PLAN_TERM + ' It is our sole commercial subscription; tailored and individual services can also be scoped.',
    audience: 'For commercial landlords, managing agents, asset managers and facilities teams responsible for retail, offices, industrial, warehouse and mixed-use assets.',
    outcome: 'Keep your asset, your instructions and the next action connected.',
    services: [
      ['Inspections and condition records', 'Periodic visual inspections, commencement and exit records, vacancy observations and make-good evidence document accessible premises. Agree areas, trading constraints and outputs. Lease interpretation, valuations and certification remain with appropriate advisers.'],
      ['Leasing and tenancy administration', 'Listing information, viewings, enquiries, private application administration, authorised references and lease-document coordination. Tenant selection, offers, execution and statutory roles remain with authorised parties. An application is not a lease or approval.'],
      ['Outsourced property operations', 'Approved access, maintenance requests, quotes, work follow-up, utilities administration and owner reporting. Spending authority, arrears or notice decisions and licensed functions must be expressly agreed; attendance alone does not confer them.'],
      ['Building support and tailored scopes', 'Combine presentation, cleaning coordination, grounds care, minor maintenance and specialist-provider coordination. Custom scopes address site operations, access, reporting and projects. ' + PLAN_SCOPE],
    ],
    difference: [
      ['One commercial subscription', 'Commercial All-Inclusive: $150 + GST per property/month. ' + PLAN_TERM + ' There is no separate commercial inspection-only subscription.'],
      ['Continuity around your site', 'Agree inductions, trading hours, access and reporting contacts. Defined work and property-linked records help your team follow through across one premises or a portfolio.'],
      ['Clear authority and specialist boundaries', 'Your appointed representative retains leasing and expenditure decisions. Trades, legal advisers, certifiers and insurers retain their professional responsibilities. Extra costs and any early-exit terms are disclosed before agreement.'],
    ],
    questions: [
      ['Can you work alongside our managing agent?', 'Yes. Agree the authorised contact, workstream, frequency, site requirements and outputs. After-hours attendance and specialist costs are separately scoped; no continuous response commitment is implied.'],
      ['Can you tailor a commercial package?', 'Yes. Tell us the asset, workload and desired outcome. The proposal identifies tasks, responsibilities, limits and extras. ' + PRIVATE_SERVICE_PRICING], coverage,
    ],
  },
  strata: {
    name: 'Strata', headline: 'Better cared-for buildings. Clearer day-to-day operations.',
    summary: 'Common-property inspections, building operations, cleaning, grounds care and maintenance coordination for strata managers and authorised building teams.',
    description: 'A shared building works best when small tasks have an owner and issues are followed through. ProInspect supports schemes and operators with practical attendance, recurring care and useful records across eight building service groups. Select individual work or a tailored building scope with agreed frequencies, reporting and costs. Appointed representatives retain governance, budgets and statutory responsibilities.',
    audience: 'For strata managers, building operators, councils and authorised scheme representatives overseeing residential, commercial and mixed-use shared property.',
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
    description: 'Rooms, shared spaces and resident turnover create a workload that ordinary whole-property routines can miss. We offer tailored support to inspect rooms, coordinate authorised access, organise onboarding and departure tasks, maintain presentation and track property issues. We agree your operating model, resident privacy, responsibilities and reporting before work begins.',
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
    availability: 'Co-Living and Student Living services are offered through an agreed tailored scope. Dedicated room, bed and occupancy software features are subject to their own approved release; an enquiry does not activate an unapproved module.',
    questions: [
      ['Is Co-Living or Student Living support available now?', 'Yes. Contact us to scope the property, rooms, shared areas and workload. We confirm delivery, responsibilities and commercial terms before accepting the engagement.'],
      ['Can you help onboard residents and manage turnovers?', 'Yes, within agreed authority and scope. Resident agreements, permissions and regulated functions remain with the responsible operator and appropriate professionals.'], coverage,
    ],
  },
  construction: {
    name: 'Construction', headline: 'Keep your project’s practical details moving.',
    summary: 'Construction project support, site attendance, progress records, contractor coordination and handover follow-up for owners, developers and project teams.',
    description: 'Projects create visits, questions, records and actions that need follow-through. ProInspect offers tailored construction project support, connecting practical attendance and administration with clear progress and handover records. Agree the project stage, authority, safety requirements, deliverables and escalation contacts before starting.',
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
    availability: 'Construction project support is offered through a tailored scope. Dedicated project, milestone and contractor-management software features remain subject to a separate approved release.',
    questions: [
      ['Is construction project support available?', 'Yes. Tell us the location, project stage, appointed team and workload. We will clarify the coordination, attendance and reporting we can provide.'],
      ['Does attendance certify work or approve payment?', 'General observations and administration are distinct from engineering, certification, quantity surveying, contractual decisions and statutory inspections. Those require appropriate qualifications and authority.'], coverage,
    ],
  },
  maintenance: {
    name: 'Maintenance', headline: 'Property care that follows the issue through.',
    summary: 'Maintenance coordination, preventative care, safe minor works and specialist-contractor follow-up for residential, commercial and shared buildings.',
    description: 'Connect the reported issue with an approved action and a clear outcome. ProInspect helps organise requests, observe conditions, coordinate quotes and access, and follow up completed work. Combine individual tasks with recurring care for the property, gardens and shared spaces under a tailored scope.',
    audience: 'For owners, agencies, strata and building teams. Tenants should use their property’s nominated reporting process and the responsible manager’s urgent-maintenance instructions.',
    outcome: 'Notice the issue. Agree the work. Keep the outcome in view.',
    services: [
      ['Assessment and preventative care', 'Record the issue, location and visible conditions; identify the next step and plan agreed checks. General observations are distinct from specialist diagnosis or certification.'],
      ['Quotes, contractors and access', 'Seek scoped quotes, coordinate approved trades and arrange authorised keys or attendance. Owners or appointed managers approve expenditure and variations within agreed authority.'],
      ['Practical property and building care', 'Safe general minor works, cleaning and presentation, waste routines, gardens and reticulation observations. Electrical, gas, plumbing and other regulated work is referred to qualified contractors.'],
      ['Completion and ongoing support', 'Document visible results, outstanding items and follow-up. Agree frequency, materials, travel, after-hours and specialist costs before work proceeds; no unlimited repairs or emergency response is implied.'],
    ],
    difference: [
      ['Useful detail before a decision', 'A clear request and property observations help the authorised decision-maker choose the right contractor or next action.'],
      ['Delivery with clear limits', 'Distinguish agreed general work from regulated repairs and specialist assessment. Record repair approvals and spending limits before work proceeds.'],
      ['Follow-through you can review', 'Keep requests, attendance and outcomes connected to the property. Extra work and third-party costs need the appropriate approval.'],
    ],
    questions: [
      ['Can I arrange one task or ongoing care?', 'Yes. Request a single task or a tailored recurring scope. ' + PRIVATE_SERVICE_PRICING],
      ['How should a tenant report maintenance?', 'Use the property’s nominated channel, with a clear description and safe photos. Keep access codes and sensitive evidence private. Follow your manager’s urgent instructions; this website is not an emergency service. Contact emergency services if there is immediate danger.'], coverage,
    ],
  },
} satisfies Record<string, SectorOverview>;
export type SectorKey = keyof typeof SECTOR_OVERVIEWS;
