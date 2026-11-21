/** Operator-confirmed marketing facts, 16 November 2026; reconciled to the subscription decision workbook. Does not activate billing. */
export const PUBLIC_COMPANY = { name: 'ProInspect Property Services Pty Ltd', abn: '52 703 550 609', acn: '703 550 609', email: 'info@proinspect.systems' } as const;
export const PUBLIC_PLANS = [{ id: 'residential-all-inclusive-weekly-2026-11', name: 'Residential All Inclusive Subscription', weeklyExGst: 50, weeklyIncGst: 55, billingUnit: 'property', billingBasis: 'residential-property' }] as const;
export const PLAN_TERM = 'An initial 24-month term and 60 days’ written cancellation notice.';
export const INSPECTION_ONLY_SERVICES = ['Quarterly routine inspection', 'Incoming Property Condition Report', 'Exit inspection', 'Report generated on the ProInspect Platform', 'Tenant communication'] as const;
export const RESIDENTIAL_BILLING_UNIT = 'AUD $50 + GST per week per property ($55 including GST). No per-room subscription. Co-Living operating agreements are separately scoped and quoted.';
export const INSPECTION_ONLY_SCOPE = 'Routine visits follow lawful access requirements, with no more than four in any rolling 12 months and no carry-over of unused visits. Your schedule confirms PCR and exit allowances, tenant communication, notice responsibilities and report delivery before you join.';
export const MAINTENANCE_APPROVAL = 'You approve the quote before expenditure. Trade labour, materials and specialist costs are separate from coordination unless expressly included in your agreement.';
export const PLAN_SCOPE = 'Your agreed service schedule sets inclusions, visit limits, extras and any early-exit terms before you join. All-Inclusive covers that agreed scope; trade costs and specialist work are separate unless expressly included.';
export const SERVICE_COVERAGE = 'Scheduled services across approved Perth and Peel suburbs. Other WA locations, islands and special-access sites are considered by request, subject to travel, access and availability.';
export const PRIVATE_SERVICE_PRICING = 'Sign in for individual service prices or ask for a tailored quote. Any travel, urgency or specialist extras are agreed before work starts.';
export const RESIDENTIAL_SERVICE_GROUPS = [
  ['Property inspections & condition reports', 'Incoming PCRs, routine visits, vacancy checks, inventories and exit records give you a useful view of property condition.'],
  ['Marketing & property viewings', 'Listing support, enquiries, open homes and private viewings help move your leasing campaign forward.'],
  ['Tenant applications & tenancy commencement', 'Application administration, reference follow-up and handovers support your choice of tenant.'],
  ['Lease reviews, breaches & formal notices', 'Keep review dates, evidence and notice preparation organised for the authorised decision-maker.'],
  ['Tenant requests & communications', 'Give everyday tenant enquiries a clear contact and a recorded next step.'],
  ['Maintenance requests & contractor works', 'Record issues, obtain quotes and coordinate approved work through to completion.'],
  ['Preventative care & condition monitoring', 'Plan practical checks that bring emerging maintenance needs to your attention.'],
  ['Residential safety & compliance', 'Record visible concerns and arrange qualified providers for specialist checks or certification.'],
  ['Keys, access & property attendance', 'Arrange keys, contractor access and handovers with clear custody records.'],
  ['Utilities, records & owner reporting', 'Keep agreed utility administration, property records and owner updates together.'],
  ['Vacate, exit & bond administration', 'Coordinate vacates, outgoing condition records and bond paperwork for the responsible parties.'],
  ['Abandonment, goods & property recovery', 'Prepare factual records and coordinate lawful next steps with the responsible manager or adviser.'],
  ['Disputes, court & sensitive tenancy matters', 'Organise factual records and private administration alongside the appropriate professional advice.'],
  ['Insurance, incidents & specialist support', 'Document incidents and coordinate approved insurer or specialist follow-up.'],
] as const;
export const BUILDING_SERVICE_GROUPS = [
  ['Building management & operations', 'Common-area checks, contractor access and handovers keep daily building tasks moving.'],
  ['Cleaning & presentation', 'Maintain shared-space presentation through an agreed cleaning schedule.'],
  ['Waste management & recycling', 'Keep bins, recycling and waste areas on an organised routine.'],
  ['Gardening & reticulation', 'Support garden presentation, grounds care and reticulation checks.'],
  ['Minor maintenance & repairs', 'Arrange safe minor works and coordinate licensed trades, with costs approved first.'],
  ['Pools & specialist building systems', 'Coordinate qualified providers for pools, lifts, fire and other building systems.'],
  ['Records, reporting & technology', 'Give your team clear attendance records, issue logs and action updates.'],
  ['Specialist & enhanced services', 'Scope projects, unusual tasks and after-hours work around your building.'],
] as const;
