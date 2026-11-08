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
  visual: 'residential' | 'commercial' | 'strata';
};
export const AUDIENCES: Record<string, Audience> = {
  'private-landlords': {
    name: 'Private landlords',
    title: 'Keep your rental property in view.',
    description: 'Residential inspections, condition reports and practical property attendance for Western Australian landlords who manage their own rental property.',
    purpose: 'You do not need a large property team to keep useful records. ProInspect can attend for a defined inspection or practical task, leaving you with information to consider and act on.',
    what: [
      ['Understand property condition', 'Arrange routine, incoming or outgoing condition records suited to the stage of the tenancy.'],
      ['Follow up maintenance', 'Have a reported concern or completed work observed, without mistaking an inspection for repair or certification.'],
      ['Keep work together', 'Authorised property records connect instructions, bookings and issued outcomes in your ProInspect workspace.'],
    ],
    before: 'Have the property details, lawful access arrangements, tenancy context and any previous reports available. A confirmed appointment does not replace any required notice of entry.',
    boundary: 'You remain responsible for landlord decisions and statutory obligations. ProInspect delivers the inspection or attendance agreed in the instruction; it does not become the landlord or property manager.',
    serviceIds: ['property-condition-report','routine-inspection','pre-vacate-inspection','final-exit-inspection','maintenance-attendance','completed-works-inspection'],
    visual: 'residential',
  },
  'property-management-agencies': {
    name: 'Property management agencies',
    title: 'Extra inspection capacity, without losing control.',
    description: 'Outsourced inspections, property attendance and report documentation for professional residential property management agencies in Western Australia.',
    purpose: 'Keep your team focused on the property-management decisions only it can make. Commission ProInspect for clearly assigned visits, documented follow-ups and agreed on-site support.',
    what: [
      ['Support busy inspection schedules', 'Arrange individual or recurring routine and condition inspections under an agreed instruction.'],
      ['Document work and follow-up', 'Use factual attendance and completed-works observations to support your team’s review.'],
      ['Protect client authority', 'Properties, reports and access permissions stay linked to the relevant managing organisation and authorised owners.'],
    ],
    before: 'Specify the instructing agency, property, authorised access procedure, scope, reporting audience and the person who can approve changes.',
    boundary: 'Your agency retains its property-management, leasing, statutory and client decision-making responsibilities. ProInspect acts on the agreed instruction, not as the appointed property manager.',
    serviceIds: ['routine-inspection','property-condition-report','final-exit-inspection','contractor-access-attendance','completed-works-inspection','follow-up-reinspection'],
    visual: 'residential',
  },
  'commercial-property-owners': {
    name: 'Commercial property owners',
    title: 'Clearer oversight of your commercial property.',
    description: 'Commercial condition inspections, handover observations, make-good records and on-site support for Western Australian property owners.',
    purpose: 'Whether you own an office, retail tenancy or industrial premise, a dated site record can help you understand visible condition and refer the right matters for further assessment.',
    what: [
      ['Record current condition', 'Arrange agreed commercial inspections and photographic observations.'],
      ['Prepare for tenancy changes', 'Document pre-vacate and final make-good matters against supplied instructions.'],
      ['Attend when needed', 'Arrange authorised contractor access or a property meeting without committing to full management services.'],
    ],
    before: 'Share the site address, areas to inspect, available lease or handover information, operating restrictions and suitable access contact.',
    boundary: 'Lease interpretation, disputes, technical certification and formal valuation remain separate responsibilities. An observation report is not a determination that a tenant has met lease obligations.',
    serviceIds: ['commercial-property-inspection','commercial-pre-vacate-make-good-inspection','commercial-final-make-good-inspection','contractor-access-attendance','property-meeting'],
    visual: 'commercial',
  },
  'commercial-asset-managers': {
    name: 'Commercial and asset managers',
    title: 'Site-level records for portfolio decisions.',
    description: 'On-the-ground inspections and property operations support for commercial asset managers overseeing multiple Western Australian sites.',
    purpose: 'Managing assets across locations creates practical gaps between reports, works and decisions. ProInspect can attend nominated sites and record observations in a consistent property context.',
    what: [
      ['Maintain site visibility', 'Arrange scheduled condition checks and targeted follow-up visits.'],
      ['Record contractor outcomes', 'Review visible completed works, access arrangements and outstanding matters.'],
      ['Prepare handovers', 'Document nominated commercial vacate and make-good observations without replacing lease or technical advisers.'],
    ],
    before: 'Identify the site, account authority, relevant contacts, scope, operating restrictions and agreed document recipients.',
    boundary: 'ProInspect provides the specified inspection and attendance service; asset strategy, leasing negotiations, finance and statutory approvals remain with the authorised manager.',
    serviceIds: ['commercial-property-inspection','commercial-final-make-good-inspection','maintenance-attendance','completed-works-inspection','contractor-access-attendance'],
    visual: 'commercial',
  },
  'strata-managers': {
    name: 'Strata managers',
    title: 'Practical support across common property.',
    description: 'Common-property inspections, maintenance observations, contractor attendance and building reporting for strata managers in Western Australia.',
    purpose: 'From shared corridors to building handovers, common-property issues benefit from specific instructions and a reliable record of what was observed. We attend nominated areas and report to the authorised representative.',
    what: [
      ['Inspect shared areas', 'Document visible condition, presentation and apparent maintenance concerns.'],
      ['Coordinate on-site work', 'Arrange contractor access, attendance and agreed building tasks.'],
      ['Support the next decision', 'Record defects and follow-up work for the appropriate manager or council process.'],
    ],
    before: 'Confirm the scheme, common-property areas, delegated authority, safe access and the person who can approve changes or additional work.',
    boundary: 'A ProInspect report does not create a strata resolution or grant statutory decision-making power. Approved works and scheme governance remain with the authorised parties.',
    serviceIds: ['common-property-inspection','maintenance-attendance','defect-rectification-inspection','contractor-supervision-attendance','building-handover-attendance'],
    visual: 'strata',
  },
  'building-operators': {
    name: 'Building operators',
    title: 'Reliable records for everyday building work.',
    description: 'Building attendance, shared-area checks, access coordination and maintenance observations for Western Australian building operations teams.',
    purpose: 'Practical building work depends on accurate information from the site. ProInspect supports specifically instructed attendances so the building team can track what occurred and what needs follow-up.',
    what: [
      ['Help coordinate access', 'Document approved contractor entry, devices and move-related attendance.'],
      ['Observe building issues', 'Record visible maintenance, damage and defect matters in nominated areas.'],
      ['Assist with transitions', 'Support an agreed operational handover and identify missing information.'],
    ],
    before: 'Provide the building rules, authorised contact, access arrangements, safety restrictions, agreed attendance window and required record.',
    boundary: 'A nominated attendance is not a 24-hour response promise, technical sign-off or automatic appointment as building manager.',
    serviceIds: ['building-management-attendance','contractor-access-attendance','move-in-move-out-attendance','building-handover-attendance','defect-rectification-inspection'],
    visual: 'strata',
  },
};
