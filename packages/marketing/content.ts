import { PLAN_TERM, PLAN_SCOPE, PRIVATE_SERVICE_PRICING, INSPECTION_ONLY_SERVICES, INSPECTION_ONLY_SCOPE, RESIDENTIAL_BILLING_UNIT, MAINTENANCE_APPROVAL } from './public-facts.ts';
/** Editorial draft; no invented prices, credentials, turnaround promises or testimonials. */
export const SERVICE_FOCUS: Record<string, [string, string, string]> = {
  'routine-inspection': [
    'Accessible rooms, visible condition and maintenance observations.',
    'Current access arrangements, nominated areas and issues to follow up.',
    'A visit record of observations and next actions, not a specialist diagnosis.',
  ],
  'property-condition-report': [
    'An incoming condition record organised around the property.',
    'Property details, scope and relevant tenancy context.',
    'A photographic condition record; review and tenant response remain separate steps.',
  ],
  'pre-vacate-inspection': [
    'Presentation and apparent rectification matters before the final visit.',
    'Planned vacate timing and earlier condition records.',
    'An advance observation list rather than the final handover record.',
  ],
  'final-exit-inspection': [
    'Outgoing condition compared with supplied incoming information.',
    'Incoming report, keys and confirmed handover access.',
    'A dated outgoing record, not an automatic decision on deductions or liability.',
  ],
  'commercial-property-inspection': [
    'Accessible commercial areas and visible operational condition.',
    'Site use, restrictions, nominated areas and purpose.',
    'A condition record with specialist matters identified for separate assessment.',
  ],
  'commercial-pre-vacate-make-good-inspection': [
    'Apparent make-good matters ahead of handover.',
    'The supplied works scope and planned handover date.',
    'Advance observations for review, not a legal interpretation of the lease.',
  ],
  'commercial-final-make-good-inspection': [
    'Visible commercial handover condition and apparent incomplete work.',
    'The agreed scope, earlier reports and access.',
    'A final observation record for the authorised parties.',
  ],
  'common-property-inspection': [
    'Shared areas, accessways and nominated building facilities.',
    'Scheme, buildings, common areas and known access or safety restrictions.',
    'Location-linked observations and follow-up items.',
  ],
  'building-management-attendance': [
    'Defined on-site tasks and operational coordination.',
    'Tasks, authorised contact and attendance limits.',
    'An attendance record and outstanding actions, not unrestricted scheme management.',
  ],
  'maintenance-attendance': [
    'An on-site review of a reported maintenance concern.',
    'The concern, location, photographs and safe access arrangements.',
    'Observations to support the next instruction; not every repair is included.',
  ],
  'completed-works-inspection': [
    'Visible results of completed work.',
    'The original works instruction and items needing verification.',
    'Comparison of visible results with supplied scope, not concealed-work certification.',
  ],
  'follow-up-reinspection': [
    'Previously recorded items that need another look.',
    'The previous report and follow-up list.',
    'Updated observations on specified items rather than a new whole-property inspection.',
  ],
  'damage-incident-inspection': [
    'Visible condition after an incident.',
    'Location, background, known hazards and confirmation of safe access.',
    'Dated observations and photographs, not emergency response or an insurance decision.',
  ],
  'cleaning-presentation-inspection': [
    'Nominated areas and visible presentation.',
    'Presentation instruction and expected access.',
    'Observed presentation and follow-up items, not a cleaning service.',
  ],
  'defect-rectification-inspection': [
    'Identified defects or reported rectification work.',
    'Defect list, works scope and earlier photographs.',
    'Itemised visible observations; technical certification needs a separately scoped specialist.',
  ],
  'property-meeting': [
    'An agreed on-site discussion.',
    'Purpose, participants, location and authority to act.',
    'Attendance notes and agreed actions within the instruction.',
  ],
  'contractor-access-attendance': [
    'Authorised access for an agreed contractor visit.',
    'Contractor, approved areas, appointment and key arrangements.',
    'An access record, not continuous supervision.',
  ],
  'key-handover-collection': [
    'Handover or collection of nominated access devices.',
    'Recipient authority, device list and handover arrangements.',
    'A record of the handover; access secrets remain private.',
  ],
  'contractor-supervision-attendance': [
    'An agreed period of observation and contractor coordination.',
    'Scope, timing, reporting expectations and escalation contacts.',
    'Attendance notes within the instruction, not specialist safety or technical certification.',
  ],
  'move-in-move-out-attendance': [
    'An agreed property or building attendance around a move.',
    'Location, building instructions, permitted access and move window.',
    'An attendance record, not an automatic facility reservation or tenancy approval.',
  ],
  'urgent-building-attendance': [
    'A reviewed urgent operational request.',
    'Issue, exact location, known hazards and authorised contact.',
    'Attendance confirmed after capacity and scope review. Do not rely on an online enquiry for emergency assistance.',
  ],
  'building-handover-attendance': [
    'An agreed handover and record of operational matters.',
    'Scope, participants, documents and nominated areas/devices.',
    'A handover record, not automatic acceptance of all defects.',
  ],
  'other-custom-appointment': [
    'A property task requiring a specific instruction.',
    'Desired outcome, property, access and preferred timing.',
    'A scoped proposal first; a request is not an appointment confirmation.',
  ],
};
export const ENGAGEMENTS: Record<string,{ title: string; intro: string; sections: [string,string][] }> = {
  'pay-as-you-go': {
    title:'One-off property services',
    intro:'Commission an individual inspection, attendance or defined piece of property work without subscribing.',
    sections:[
      ['1. Identify the outcome','Choose a service and provide the property type, suburb, timing, and whether you need an inspection record, access visit or practical follow-up. Individual service prices are available in authorised accounts; tailored requirements are quoted.'],
      ['2. Approve the instruction','Review what is included, expected deliverables, lawful entry and access arrangements, GST and any approved extras. Only the confirmed appointment or accepted quotation authorises the work.'],
      ['3. We attend or coordinate','The assigned team undertakes the defined task and reports exceptions through the agreed contact; we do not assume wider maintenance or management authority.'],
      ['4. Receive and act on the outcome','The dated inspection or attendance record is issued to authorised recipients. New repairs, return visits or specialist assessment are separate approved instructions.'],
    ],
  },
  'inspection-plans': {
    title:'Residential Inspection Only',
    intro:'Keep condition and tenant communication on track for $20 + GST a month per whole property or separately leased room.',
    sections:[
      ['Five included service types', INSPECTION_ONLY_SERVICES.join('; ') + '.'],
      ['A clear inspection rhythm', INSPECTION_ONLY_SCOPE],
      ['The right unit for your property', RESIDENTIAL_BILLING_UNIT],
      ['Know your terms', PLAN_TERM + ' Your schedule confirms the detailed scope and any early-exit terms before you join. Account registration is free; subscribing is a separate choice.'],
    ],
  },
  'standard-support': {
    title:'All-Inclusive operational support',
    intro:'Take everyday coordination off your list. Residential All-Inclusive is $150 + GST a month per whole property or separately leased room; Commercial All-Inclusive is $150 + GST per commercial unit a month.',
    sections:[
      ['Residential support', 'Build a service schedule around inspections, tenant enquiries, administration, access and vacate support.'],
      ['Commercial support', 'Coordinate site records, occupant requests, lease diary tasks, contractor access and owner updates. Inspection frequency and allowances are agreed for each unit.'],
      ['Your agreed service schedule', PLAN_SCOPE + ' ' + MAINTENANCE_APPROVAL],
      ['Get started', PLAN_TERM + ' Tell us about your property and workload. We will confirm the responsibilities, included work and costs before you accept.'],
    ],
  },
  'outsourced-operations': {
    title:'Outsourced property operations',
    intro:'Combine administration, attendance and building care around your portfolio, facility or accommodation operating model while retaining the appropriate legal and financial authorities.',
    sections:[
      ['Initial consultation','Identify your sites or portfolio, the problems to solve, estimated workload, service locations and appropriate decision-maker.'],
      ['Operational discovery and handover','Map active tenancies or occupants, building facilities, contractors, existing records, instructions, access constraints, known issues and current responsibilities.'],
      ['Document the responsibility matrix','Agree the tasks ProInspect coordinates, the person who approves spending, who communicates with residents, reporting cadence, service boundaries and any professional appointments.'],
      ['Commence the programme','Confirm onboarding, service standards, staff and contractor access, scheduled activities and nominated escalation routes.'],
      ['Maintain accountability','Issue agreed property-linked updates, log open items and request approvals before non-included expenditure, specialist works or scope changes.'],
    ],
  },
};
export const GUIDES: Record<string,{ title: string; intro: string; sections: [string,string][]; services: string[] }> = {
  'routine-inspection-vs-pcr': {
    title:'Routine inspection or Property Condition Report?',
    intro:'Compare the purpose, timing and evidence before commissioning the next residential inspection.',
    sections:[
      ['Start with the tenancy stage','A Property Condition Report (PCR) records the incoming condition of a property when a tenancy begins. A routine inspection takes a later point-in-time look at presentation, visible condition and matters requiring review.'],
      ['What an incoming PCR records','For a WA residential tenancy PCR, the applicable prescribed Form 1 and its required content must be used. Room-by-room fixture, fitting, inventory and relevant photograph information provides a reference for the tenancy. Statutory issue and response duties remain with the responsible lessor or manager.'],
      ['What a routine inspection records','An agreed attendance documents accessible areas, the visible condition at the date of inspection, maintenance observations and suitable photographs. Routine entry must follow the applicable notice and frequency requirements.'],
      ['What the client receives','A PCR creates an incoming record for later comparison; a routine visit provides an observation and issue-follow-up record. Neither is a technical building safety certification.'],
      ['How to decide','Choose a PCR for tenancy commencement, a routine inspection for periodic oversight, or separately agree a targeted revisit for a previously recorded issue. Provide the tenancy stage and earlier records to obtain the right service.'],
    ],
    services:['routine-inspection','property-condition-report'],
  },
  'pre-vacate-vs-final': {
    title:'Pre-vacate or final inspection?',
    intro:'An early condition review and final outgoing record support different tenancy decisions.',
    sections:[
      ['Before the resident leaves','A pre-vacate attendance can identify visible cleaning, maintenance and presentation matters while the resident still has time to consider them. It is preparatory and does not finally determine liability.'],
      ['At outgoing handover','A final inspection records visible property condition at the agreed exit stage. Where reliable incoming records and documented changes are available, observations may be compared item by item.'],
      ['What to prepare','Provide lawful access instructions, the tenancy end stage, incoming report, relevant permitted inventory and any earlier condition or maintenance records.'],
      ['Separate evidence from decisions','A difference between two records does not itself prove damage liability, a particular bond deduction or breach. The authorised parties and statutory process resolve those matters.'],
      ['Which service to request','Book pre-vacate for early observations, final inspection for outgoing condition evidence, and separately approve any later defect follow-up or contractor coordination.'],
    ],
    services:['pre-vacate-inspection','final-exit-inspection'],
  },
  'verify-completed-works': {
    title:'Checking completed contractor work',
    intro:'Keep the approved works instruction, visible completion evidence and outstanding tasks in one review process.',
    sections:[
      ['Begin with the work instruction','Identify the original issue, approved contractor scope, locations, required result and any agreed completion notice. A photograph without its instruction may not explain whether the right work was performed.'],
      ['Select the observation scope','A Completed Works Inspection documents visible outcomes of named work. Defect or Rectification Inspection follows nominated items against a prior list. Specialist testing requires the relevant qualified provider.'],
      ['Capture comparable evidence','Record the work area, apparent completion, relevant photographs and any obvious outstanding matters. Use earlier images and contractor descriptions where available.'],
      ['Escalate unresolved matters','The client or authorised manager decides whether an item requires contractor return, further inspection, technical certification or another approval. A visual check does not authorise payment or warrant workmanship.'],
      ['Close with a traceable record','Keep the issued record with the original request, work order, authorised correspondence and any separately instructed reinspection.'],
    ],
    services:['completed-works-inspection','defect-rectification-inspection'],
  },
  'access-or-supervision': {
    title:'Contractor access or supervision?',
    intro:'Distinguish a short authorised entry task from an agreed period of operational works observation.',
    sections:[
      ['Access-only attendance','For access support, confirm the contractor, lawful entry permission, permitted areas and arrival window. ProInspect can facilitate agreed entry and document the handover or access exception.'],
      ['Operational works observation','An agreed longer attendance may record arrival, progress, visible activity and operational exceptions, with a designated escalation contact and time limit.'],
      ['Decide who controls the work','The appointed contractor, builder or professional remains responsible for technical work and safety obligations. Operational observation does not make ProInspect the licensed supervisor or principal contractor.'],
      ['Plan additional time and charges','Confirm whether the visitor needs a key handover, continuous attendance, follow-up photographs or completion inspection. These are distinct tasks unless included in an accepted scope.'],
      ['Select the right service','Choose Contractor Access Attendance for entry, Contractor Supervision Attendance for defined operational presence, or a Completed Works Inspection to record apparent finished work.'],
    ],
    services:['contractor-access-attendance','contractor-supervision-attendance'],
  },
  'self-managed-property-workflow': {
    title:'A workflow for self-managing landlords',
    intro:'Follow a structured property lifecycle while retaining decisions and oversight of your residential tenancy.',
    sections:[
      ['Before a tenancy starts','Prepare approved listing information, lawful inspection access, applicant handling, incoming condition records and key handover. The landlord or appointed licensed representative retains applicant and lease decisions.'],
      ['During the tenancy','Maintain a diary for lawful routine inspections, tenant requests, repairs, contractor access and the required notices. Use property-linked records rather than scattered messages.'],
      ['When maintenance is reported','Describe the problem, location and safe access requirements. Obtain approved quotes where relevant, instruct qualified trades where needed, then retain completion evidence and outstanding items.'],
      ['Before and after vacate','Consider an early pre-vacate check, document final condition against available incoming records, manage authorised key returns and use the applicable bond process.'],
      ['Choose individual work or a plan','Request PAYG services when needed, compare Residential Inspection Only ($20 + GST/month) with Residential All-Inclusive ($150 + GST/month), each per whole property or separately leased room, and obtain the exact service entitlements and 24-month conditions before enrolling.'],
    ],
    services:['routine-inspection','maintenance-attendance'],
  },
  'building-issue-routing': {
    title:'Reporting a building issue',
    intro:'A useful description and the right recipient help building problems reach the authorised decision-maker.',
    sections:[
      ['Describe exactly where it occurs','Identify the building, level, room, lot or shared space, issue type, observations and when it was noticed. Do not include private access codes in a general enquiry.'],
      ['Determine the appropriate recipient','Private tenancy concerns generally go to the responsible landlord or property manager; shared areas go through the authorised strata or building channel. Occupying a lot does not confer authority to instruct works on common property.'],
      ['Record and triage','Provide clear photographs where safe and permitted. A report may need an inspection, specialist assessment, quoted repair, or action by the responsible manager. Location alone does not determine legal boundaries or liability.'],
      ['Urgent hazards need the correct pathway','Follow the manager’s emergency directions and contact emergency services where there is immediate danger. Public enquiries are not a monitored emergency-response channel.'],
      ['Keep an issue record','Track the reported concern, approval, assigned contractor, visible completion and remaining actions using the relevant property or scheme record.'],
    ],
    services:['common-property-inspection','maintenance-attendance'],
  },
};