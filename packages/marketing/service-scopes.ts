/**
 * Marketing guidance, NOT a quotation, contracted service specification or statutory promise.
 * These descriptions identify typical activity and boundaries. The accepted instruction,
 * approved service terms, authority, access and price always determine what is supplied.
 * Business editorial sign-off is tracked separately in publication-register.ts.
 */
export type MarketingServiceScope = {
  included: readonly string[];
  excluded: readonly string[];
  deliverables: readonly string[];
};
export const SERVICE_SCOPE_DETAILS: Record<string, MarketingServiceScope> = {
  "routine-inspection": {
    "included": [
      "Observe accessible nominated internal and external areas within the agreed routine-inspection scope.",
      "Note visible condition and presentation matters relevant to the instruction.",
      "Capture supporting images of selected observations where appropriate and authorised."
    ],
    "excluded": [
      "Repairs, cleaning or other corrective work.",
      "Specialist building, safety or statutory compliance certification."
    ],
    "deliverables": [
      "A dated record of the areas observed and relevant findings.",
      "Identified matters for the owner or authorised manager to consider."
    ]
  },
  "property-condition-report": {
    "included": [
      "Record the incoming visible condition of the agreed residential premises and its nominated fixtures.",
      "Document room-by-room observations and any relevant supplied inventory.",
      "Capture appropriate photographic evidence for the condition record."
    ],
    "excluded": [
      "Independent expert assessment of hidden defects or building compliance.",
      "Determination of a party's legal responsibility or automatic statutory service."
    ],
    "deliverables": [
      "A structured incoming-condition report prepared using the approved applicable template.",
      "Supporting recorded observations and photographs where relevant."
    ]
  },
  "pre-vacate-inspection": {
    "included": [
      "Attend the agreed property areas before a planned vacate.",
      "Note visible cleaning, presentation and apparent maintenance matters.",
      "Identify items that may need attention before the final inspection."
    ],
    "excluded": [
      "A final exit condition determination.",
      "Repair authorisation, contractor work or a bond deduction decision."
    ],
    "deliverables": [
      "A pre-vacate observations record.",
      "A practical list of matters for the instructing party to review."
    ]
  },
  "final-exit-inspection": {
    "included": [
      "Observe the accessible property condition at the agreed exit attendance.",
      "Record visible differences against available incoming-condition evidence where provided.",
      "Identify unresolved visible matters requiring further consideration."
    ],
    "excluded": [
      "A legal bond disposal, liability finding or tenancy dispute decision.",
      "Specialist defect testing or rectification work."
    ],
    "deliverables": [
      "An outgoing condition record linked to the agreed property.",
      "Comparison observations where reliable earlier records are available."
    ]
  },
  "commercial-property-inspection": {
    "included": [
      "Observe nominated accessible commercial spaces and operational areas.",
      "Record apparent condition, presentation and agreed maintenance matters.",
      "Capture evidence of relevant findings within the approved access scope."
    ],
    "excluded": [
      "Building, fire, structural or trade compliance certification.",
      "Financial, valuation or legal assessment of lease obligations."
    ],
    "deliverables": [
      "A commercial-property inspection record.",
      "Listed visible issues or recommended follow-up areas for the client."
    ]
  },
  "commercial-pre-vacate-make-good-inspection": {
    "included": [
      "Attend the agreed commercial premises before vacating.",
      "Record visible fit-out, finishes and condition matters for review.",
      "Refer to supplied make-good schedules where explicitly included in the instruction."
    ],
    "excluded": [
      "Legal interpretation or enforcement of make-good lease clauses.",
      "Issuing contractor directions or completing rectification work."
    ],
    "deliverables": [
      "A pre-vacate make-good observations summary.",
      "Documented potential action items for authorised review."
    ]
  },
  "commercial-final-make-good-inspection": {
    "included": [
      "Attend the agreed commercial handover areas.",
      "Record visible condition at exit and outstanding apparent items.",
      "Compare with supplied schedules or earlier records where included and reliable."
    ],
    "excluded": [
      "Certification of full contractual make-good compliance.",
      "Determining disputes, settlement amounts or liability."
    ],
    "deliverables": [
      "A final commercial condition/make-good observations record.",
      "Relevant photographic evidence and noted follow-up points."
    ]
  },
  "common-property-inspection": {
    "included": [
      "Observe accessible agreed common-property spaces and amenities.",
      "Note visible presentation, maintenance and safety concerns for referral.",
      "Record locations of findings and appropriate photographic evidence."
    ],
    "excluded": [
      "A regulated building, fire or electrical compliance inspection.",
      "Strata governance, legal decisions or automatic work approvals."
    ],
    "deliverables": [
      "A common-property inspection record.",
      "A list of observations requiring the authorised manager's attention."
    ]
  },
  "building-management-attendance": {
    "included": [
      "Attend an agreed building-management task on site.",
      "Check and record the specified operational matter within authority.",
      "Communicate any observed exceptions to the nominated contact."
    ],
    "excluded": [
      "Ongoing building management beyond the accepted instruction.",
      "Technical trade repairs, certifications or emergency response."
    ],
    "deliverables": [
      "A dated attendance and task-completion record.",
      "An exception or follow-up summary where needed."
    ]
  },
  "maintenance-attendance": {
    "included": [
      "Attend the nominated reported maintenance concern.",
      "Observe and document accessible visible symptoms and context.",
      "Record information useful for the authorised next decision."
    ],
    "excluded": [
      "Carrying out repairs or engaging contractors without approval.",
      "Diagnosing concealed faults or providing specialist technical certification."
    ],
    "deliverables": [
      "A maintenance attendance record.",
      "Documented observations for owner, manager or specialist review."
    ]
  },
  "completed-works-inspection": {
    "included": [
      "Visit the specified completed work area.",
      "Document visible condition and apparent completion of nominated tasks.",
      "Photograph relevant finished works within the agreed scope."
    ],
    "excluded": [
      "Trade certification or warranty of workmanship.",
      "Testing concealed systems or authorising contract payment."
    ],
    "deliverables": [
      "A completed-works observation record with relevant images.",
      "A list of obvious outstanding items for further review, if any."
    ]
  },
  "follow-up-reinspection": {
    "included": [
      "Revisit nominated previously recorded issues or areas.",
      "Compare visible condition with the provided earlier observations.",
      "Record whether the identified matters appear changed, resolved or outstanding."
    ],
    "excluded": [
      "Rectification work or enforcement action.",
      "Technical verification of concealed or regulated works."
    ],
    "deliverables": [
      "A follow-up comparison record.",
      "Relevant photographic evidence and remaining items for review."
    ]
  },
  "damage-incident-inspection": {
    "included": [
      "Attend affected nominated property or common-property areas when safe.",
      "Document visible condition and apparent damage locations.",
      "Record factual observations and relevant photographs."
    ],
    "excluded": [
      "Emergency response, hazard remediation or scene investigation.",
      "Causation, insurance liability or expert forensic conclusions."
    ],
    "deliverables": [
      "A dated incident-condition record.",
      "A list of visible damage and suggested review points."
    ]
  },
  "cleaning-presentation-inspection": {
    "included": [
      "Observe the nominated shared areas or facilities.",
      "Record visible cleanliness and presentation conditions.",
      "Note apparent areas needing further attention."
    ],
    "excluded": [
      "Cleaning services or arranging cleaners without authorisation.",
      "Hygiene, environmental or contamination certification."
    ],
    "deliverables": [
      "A cleaning/presentation observation record.",
      "Identified follow-up cleaning or presentation matters."
    ]
  },
  "defect-rectification-inspection": {
    "included": [
      "Attend the specified apparent defects or rectification locations.",
      "Compare visible progress against supplied item lists where relevant.",
      "Document apparent outstanding items and evidence."
    ],
    "excluded": [
      "Specialist defect diagnosis, design or technical certification.",
      "Directing or certifying contractor rectification without authority."
    ],
    "deliverables": [
      "A visible defect/rectification status record.",
      "Photographs and notes for an authorised decision-maker."
    ]
  },
  "property-meeting": {
    "included": [
      "Attend a confirmed property meeting with nominated parties.",
      "Record the attendance purpose and relevant agreed observations.",
      "Note any expressly agreed follow-up responsibilities."
    ],
    "excluded": [
      "Making contractual or financial decisions for participants.",
      "Legal advice, formal minutes or approval beyond the agreed brief."
    ],
    "deliverables": [
      "A property meeting attendance summary.",
      "An agreed follow-up/action record where requested."
    ]
  },
  "contractor-access-attendance": {
    "included": [
      "Coordinate an authorised contractor's agreed arrival and access.",
      "Attend for the nominated access window and record attendance.",
      "Report material access or timing exceptions to the instructing party."
    ],
    "excluded": [
      "Supervising technical work or certifying its completion.",
      "Guaranteeing access where lawful entry permission has not been provided."
    ],
    "deliverables": [
      "An access attendance record.",
      "A summary of completed handover/access events and exceptions."
    ]
  },
  "key-handover-collection": {
    "included": [
      "Verify the agreed recipient and authority before transfer.",
      "Coordinate specified key, fob or remote collection/delivery.",
      "Record the handover particulars without publishing access credentials."
    ],
    "excluded": [
      "Changing locks, programming devices or granting new property authority.",
      "Replacement equipment costs or locksmith attendance."
    ],
    "deliverables": [
      "A secure handover/collection record.",
      "Recipient acknowledgement and exception notes where applicable."
    ]
  },
  "contractor-supervision-attendance": {
    "included": [
      "Attend during the agreed contractor work window.",
      "Document arrival, progress observations and operational access matters.",
      "Escalate apparent exceptions through the authorised contact."
    ],
    "excluded": [
      "Acting as the licensed technical supervisor or principal contractor.",
      "Trade certification, safety-management duty or payment authorisation."
    ],
    "deliverables": [
      "A contractor attendance and observation summary.",
      "Time-stamped relevant progress notes and exceptions."
    ]
  },
  "move-in-move-out-attendance": {
    "included": [
      "Coordinate agreed building arrival and access logistics for a move.",
      "Observe nominated common-area access and protection requirements.",
      "Document relevant timing or presentation exceptions."
    ],
    "excluded": [
      "Removalist services, transport or storage.",
      "Assigning tenancy rights, damages or building by-law penalties."
    ],
    "deliverables": [
      "A move attendance and access record.",
      "Reported exceptions requiring building/manager review."
    ]
  },
  "urgent-building-attendance": {
    "included": [
      "Receive and assess an urgent on-site attendance request.",
      "Confirm safe access, staffing and the specific authorised purpose before accepting.",
      "Record visible observations where an attendance is arranged."
    ],
    "excluded": [
      "Guaranteed immediate or 24-hour emergency response.",
      "Emergency services, hazard intervention or specialist trades without separate instruction."
    ],
    "deliverables": [
      "An urgent request/attendance status record.",
      "An observations and escalation note if the visit proceeds."
    ]
  },
  "building-handover-attendance": {
    "included": [
      "Attend an agreed operational building handover.",
      "Document nominated keys, records, access items or observed areas.",
      "Record identified gaps in the supplied handover materials."
    ],
    "excluded": [
      "Transfer of legal management authority or statutory responsibilities.",
      "Technical commissioning or certification of building systems."
    ],
    "deliverables": [
      "A building handover attendance checklist or record.",
      "An exception list for the authorised representatives."
    ]
  },
  "other-custom-appointment": {
    "included": [
      "Clarify the specific property task and intended outcome.",
      "Assess whether the proposed attendance is within ProInspect's services and capacity.",
      "Undertake and record only the activity subsequently agreed."
    ],
    "excluded": [
      "Any work not confirmed in an accepted custom service scope.",
      "Regulated or specialist activity without separate qualified providers and approval."
    ],
    "deliverables": [
      "A record of the accepted custom task and attendance.",
      "The agreed observations or output, as specified in the approved instruction."
    ]
  }
} as const;

export function serviceScopeFor(id: string): MarketingServiceScope | null {
  return SERVICE_SCOPE_DETAILS[id] ?? null;
}
