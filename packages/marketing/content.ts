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
export const ENGAGEMENTS: Record<
  string,
  { title: string; intro: string; sections: [string, string][] }
> = {
  'pay-as-you-go': {
    title: 'One-off property services',
    intro: 'Arrange an inspection or attendance without assuming an ongoing commitment.',
    sections: [
      [
        'Choose the task',
        'Confirm the property, service scope, price, access and appointment before work starts.',
      ],
      [
        'Keep the outcome',
        'Issued records stay in the authorised property account; follow-up is a separate instruction.',
      ],
    ],
  },
  'inspection-plans': {
    title: 'Inspection planning',
    intro: 'Organise recurring needs across a property or portfolio.',
    sections: [
      [
        'Plan before booking',
        'Record the service and due date. An authorised person confirms each booking and access arrangement.',
      ],
      [
        'No surprise appointments',
        'A plan is not an automatically scheduled visit or tenancy entry notice. A successful matching booking advances the occurrence.',
      ],
    ],
  },
  'standard-support': {
    title: 'Ongoing operational support',
    intro: 'Discuss a defined workload and responsibilities.',
    sections: [
      [
        'Agree the arrangement',
        'Define properties, tasks, instructions, reporting and commercial terms.',
      ],
      [
        'Retain control',
        'Your workspace connects requests, decisions and resulting documents. Support does not mean an unlimited subscription.',
      ],
    ],
  },
  'outsourced-operations': {
    title: 'Outsourced property operations',
    intro: 'Arrange on-the-ground work while retaining your management responsibilities.',
    sections: [
      [
        'Define the boundary',
        'Agree who instructs, coordinates access, reviews reports and approves additional work.',
      ],
      [
        'One operational record',
        'Inspections, attendance and reporting share the property or scheme context. Capacity and coverage are confirmed before engagement.',
      ],
    ],
  },
};
export const GUIDES: Record<
  string,
  { title: string; intro: string; sections: [string, string][]; services: string[] }
> = {
  'routine-inspection-vs-pcr': {
    title: 'Routine inspection or Property Condition Report?',
    intro: 'Choose around the purpose of the record.',
    sections: [
      ['Routine visit', 'Observe current visible condition and matters needing follow-up.'],
      ['Incoming record', 'A PCR focuses on an incoming record for later reference.'],
      [
        'Before you choose',
        'Explain the tenancy stage and the decision the record needs to support.',
      ],
    ],
    services: ['routine-inspection', 'property-condition-report'],
  },
  'pre-vacate-vs-final': {
    title: 'Pre-vacate or final inspection?',
    intro: 'An early review and outgoing handover serve different purposes.',
    sections: [
      ['Before vacating', 'Identify apparent matters while there is time to consider follow-up.'],
      [
        'Final handover',
        'Record outgoing condition using supplied incoming records where relevant.',
      ],
      [
        'Separate the decision',
        'Inspection observations do not by themselves decide liability or deductions.',
      ],
    ],
    services: ['pre-vacate-inspection', 'final-exit-inspection'],
  },
  'verify-completed-works': {
    title: 'Checking completed contractor work',
    intro: 'Start with the original instruction and the outcome requiring verification.',
    sections: [
      ['Provide the scope', 'Identify the task, location and earlier issue report.'],
      [
        'Record what is visible',
        'Document visible results and apparent outstanding items. Concealed systems may need a specialist.',
      ],
      [
        'Close the loop',
        'Keep follow-up with the request and work order. Additional work still needs a separate instruction.',
      ],
    ],
    services: ['completed-works-inspection', 'defect-rectification-inspection'],
  },
  'access-or-supervision': {
    title: 'Contractor access or supervision?',
    intro: 'Letting someone in differs from an agreed supervision attendance.',
    sections: [
      [
        'Access attendance',
        'Provide authorised access at the agreed time and record the handover.',
      ],
      [
        'Supervision attendance',
        'Agree duration, observations, reporting expectations and limits.',
      ],
      ['Keep authority clear', 'Specify areas and who can authorise changes.'],
    ],
    services: ['contractor-access-attendance', 'contractor-supervision-attendance'],
  },
  'self-managed-property-workflow': {
    title: 'A workflow for self-managing landlords',
    intro: 'Keep tenancy requests, inspections and reports connected.',
    sections: [
      [
        'Your relationship',
        'The Landlord Portal is for private residential landlords managing their own rentals. Agencies have a separate workspace.',
      ],
      ['Work from the property', 'Review the need, then arrange the relevant service.'],
      [
        'Appropriate visibility',
        'A tenant sees their tenancy information, not all owner and contractor records.',
      ],
    ],
    services: ['routine-inspection', 'maintenance-attendance'],
  },
  'building-issue-routing': {
    title: 'Reporting a building issue',
    intro: 'Identify the location and let the authorised manager review the route.',
    sections: [
      [
        'Describe the location',
        'Select inside a lot, shared area or uncertain, and add relevant observations.',
      ],
      [
        'Separate relationships',
        'A tenant may also be a resident; private tenancy and shared building matters follow different access rules.',
      ],
      [
        'Uncertain cases',
        'Request triage. Location selection does not determine legal boundaries or liability. Immediate danger needs immediate assistance rather than a portal response.',
      ],
    ],
    services: ['common-property-inspection', 'maintenance-attendance'],
  },
};
