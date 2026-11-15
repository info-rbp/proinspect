/** Operator-confirmed marketing facts, 15 November 2026. Does not activate billing. */
export const PUBLIC_COMPANY = { name: 'ProInspect Property Services Pty Ltd', abn: '52 703 550 609', acn: '703 550 609', email: 'info@proinspect.systems' } as const;
export const PUBLIC_PLANS = [
  { id: 'residential-inspection-only', name: 'Residential Inspection Only', monthlyExGst: 20 },
  { id: 'residential-all-inclusive', name: 'Residential All-Inclusive', monthlyExGst: 150 },
  { id: 'commercial-all-inclusive', name: 'Commercial All-Inclusive', monthlyExGst: 150 },
] as const;
export const PLAN_TERM = 'An initial 24-month term, followed by month-to-month continuation with 60 days’ written cancellation notice.';
export const PLAN_SCOPE = 'The property-specific agreement confirms included work, frequency, allowances, exclusions, authorised extras and any early-exit obligations before you commit. “All-Inclusive” is a plan name, not a promise of unlimited services or third-party costs.';
export const SERVICE_COVERAGE = 'Scheduled services cover approved suburb and postcode combinations across Perth and Peel, subject to the task, access and capacity. Other Western Australian locations are considered by request. Island, regional and postal-only entries require manual confirmation.';
export const PRIVATE_SERVICE_PRICING = 'Sign in to view individual service pricing or request a quote. Travel, specialist work, urgency and additional attendance are scoped and agreed before work proceeds.';
export const RESIDENTIAL_SERVICE_GROUPS = [
  ['Property inspections & condition reports', 'Incoming PCRs using the applicable WA Form 1 requirements, routine and follow-up inspections, vacant-property checks, inventory records, pre-leasing and final inspections. Visual reports cover accessible conditions; specialist certification is separate.'],
  ['Marketing & property viewings', 'Listing information, enquiry coordination, advertised open homes, private viewings and attendance records under the responsible representative’s authority.'],
  ['Tenant applications & tenancy commencement', 'Secure application administration, authorised reference follow-up, commencement records and handover coordination. The landlord or appointed representative selects applicants and approves terms.'],
  ['Lease reviews, breaches & formal notices', 'Diary, evidence and document preparation support for the authorised decision-maker. Prescribed notices, service and legal interpretation require appropriate authority and advice.'],
  ['Tenant requests & communications', 'Organise ordinary requests and follow-up without taking over decisions on pets, modifications, permissions or tenancy rights.'],
  ['Maintenance requests & contractor works', 'Triage reported issues, seek approved quotes, coordinate authorised attendance and record completion. Spending limits and contractor instructions are agreed first.'],
  ['Preventative care & condition monitoring', 'Planned checks and practical observations identify matters for review. Frequency and scope are property-specific.'],
  ['Residential safety & compliance', 'Record visible concerns and coordinate qualified providers. General attendance does not certify electrical, gas, fire, structural or other regulated compliance.'],
  ['Keys, access & property attendance', 'Authorised key collection, access coordination, handovers and attendance with clear custody and entry instructions.'],
  ['Utilities, records & owner reporting', 'Agreed utility administration, property records and owner updates. Rent collection and licensed or statutory management functions are not implied.'],
  ['Vacate, exit & bond administration', 'Vacate coordination, final condition evidence and bond administration support. Liability, deductions, bond release and disputes remain with the authorised parties and applicable process.'],
  ['Abandonment, goods & property recovery', 'Document observations and coordinate authorised next steps. An inspection alone does not establish abandonment, disposal, possession or a right of entry.'],
  ['Disputes, court & sensitive tenancy matters', 'Factual records and administrative support with restricted access. Legal advice, representation and sensitive-case decisions require the appropriate professional and authority.'],
  ['Insurance, incidents & specialist support', 'Factual incident records and approved provider or insurer coordination. Coverage decisions, loss assessment and specialist advice are separately determined.'],
] as const;
export const BUILDING_SERVICE_GROUPS = [
  ['Building management & operations', 'Attendance, common-area checks, access, contractor coordination, handovers and agreed routines. Governance, budgets and statutory decisions remain with authorised representatives.'],
  ['Cleaning & presentation', 'Common-area cleaning, presentation checks and specialist cleaning coordination with agreed standards and frequencies.'],
  ['Waste management & recycling', 'Bin presentation, waste-area checks, recycling coordination and contractor follow-up within the building schedule.'],
  ['Gardening & reticulation', 'Grounds care, garden presentation and reticulation observations, with regulated or specialist work referred to appropriate providers.'],
  ['Minor maintenance & repairs', 'Safe general minor works within agreed competence and scope, plus licensed-trade coordination. Materials and additional works are agreed separately.'],
  ['Pools & specialist building systems', 'Operational observations and qualified pool, lift, fire and mechanical contractor coordination. Technical servicing and certification remain with those providers.'],
  ['Records, reporting & technology', 'Building logs, issue registers, attendance records and authorised reporting keep the next action connected to the site.'],
  ['Specialist & enhanced services', 'Tailored project and exceptional building tasks. Frequency, after-hours requirements and third-party costs are quoted rather than assumed included.'],
] as const;
