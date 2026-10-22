/** ProInspect V2: internal draft taxonomy. All prices and sellable entitlements require approval. */
export const V2_MARKETS = [
  {
    "code": "RES",
    "name": "Residential",
    "referenceUnit": "dwelling"
  },
  {
    "code": "COM",
    "name": "Commercial",
    "referenceUnit": "premises"
  },
  {
    "code": "STR",
    "name": "Strata & Buildings",
    "referenceUnit": "scheme"
  },
  {
    "code": "CTS",
    "name": "Community Titles",
    "referenceUnit": "community scheme"
  },
  {
    "code": "STA",
    "name": "Short-Stay Accommodation",
    "referenceUnit": "dwelling"
  },
  {
    "code": "SOC",
    "name": "Social & Community Housing",
    "referenceUnit": "dwelling"
  },
  {
    "code": "SDA",
    "name": "Specialist Disability Accommodation",
    "referenceUnit": "dwelling"
  },
  {
    "code": "RET",
    "name": "Retirement & Lifestyle Villages",
    "referenceUnit": "village"
  },
  {
    "code": "AGE",
    "name": "Residential Aged Care",
    "referenceUnit": "facility"
  },
  {
    "code": "RUR",
    "name": "Rural & Agricultural",
    "referenceUnit": "site"
  },
  {
    "code": "INS",
    "name": "Institutional & Public Facilities",
    "referenceUnit": "facility"
  }
] as const;
export const V2_SERVICE_SEEDS = [
  {
    "code": "V2-001",
    "name": "Routine Inspection",
    "family": "inspections",
    "legacyId": "routine-inspection",
    "proposedMarkets": [
      "RES",
      "SOC",
      "SDA",
      "STA",
      "RET"
    ]
  },
  {
    "code": "V2-002",
    "name": "Property Condition Report (PCR)",
    "family": "inspections",
    "legacyId": "property-condition-report",
    "proposedMarkets": [
      "RES",
      "SOC",
      "SDA",
      "STA",
      "RET"
    ]
  },
  {
    "code": "V2-003",
    "name": "Pre-Vacate Inspection",
    "family": "inspections",
    "legacyId": "pre-vacate-inspection",
    "proposedMarkets": [
      "RES",
      "SOC",
      "SDA",
      "STA",
      "RET"
    ]
  },
  {
    "code": "V2-004",
    "name": "Final / Exit Inspection",
    "family": "inspections",
    "legacyId": "final-exit-inspection",
    "proposedMarkets": [
      "RES",
      "SOC",
      "SDA",
      "STA",
      "RET"
    ]
  },
  {
    "code": "V2-005",
    "name": "Commercial Property Inspection",
    "family": "inspections",
    "legacyId": "commercial-property-inspection",
    "proposedMarkets": [
      "COM",
      "INS",
      "AGE",
      "RET"
    ]
  },
  {
    "code": "V2-006",
    "name": "Commercial Pre-Vacate / Make-Good Inspection",
    "family": "inspections",
    "legacyId": "commercial-pre-vacate-make-good-inspection",
    "proposedMarkets": [
      "COM",
      "INS",
      "AGE",
      "RET"
    ]
  },
  {
    "code": "V2-007",
    "name": "Commercial Final / Make-Good Inspection",
    "family": "inspections",
    "legacyId": "commercial-final-make-good-inspection",
    "proposedMarkets": [
      "COM",
      "INS",
      "AGE",
      "RET"
    ]
  },
  {
    "code": "V2-008",
    "name": "Common Property Inspection",
    "family": "inspections",
    "legacyId": "common-property-inspection",
    "proposedMarkets": [
      "STR",
      "CTS",
      "COM",
      "RET",
      "AGE",
      "INS"
    ]
  },
  {
    "code": "V2-009",
    "name": "Building Management Attendance",
    "family": "attendance",
    "legacyId": "building-management-attendance",
    "proposedMarkets": [
      "STR",
      "CTS",
      "COM",
      "RET",
      "AGE",
      "INS"
    ]
  },
  {
    "code": "V2-010",
    "name": "Maintenance Attendance",
    "family": "maintenance",
    "legacyId": "maintenance-attendance",
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-011",
    "name": "Completed Works Inspection",
    "family": "maintenance",
    "legacyId": "completed-works-inspection",
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-012",
    "name": "Follow-Up / Reinspection",
    "family": "maintenance",
    "legacyId": "follow-up-reinspection",
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-013",
    "name": "Damage / Incident Inspection",
    "family": "inspections",
    "legacyId": "damage-incident-inspection",
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-014",
    "name": "Cleaning & Presentation Inspection",
    "family": "inspections",
    "legacyId": "cleaning-presentation-inspection",
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-015",
    "name": "Defect / Rectification Inspection",
    "family": "maintenance",
    "legacyId": "defect-rectification-inspection",
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-016",
    "name": "Property Meeting",
    "family": "attendance",
    "legacyId": "property-meeting",
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-017",
    "name": "Contractor Access Attendance",
    "family": "access",
    "legacyId": "contractor-access-attendance",
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-018",
    "name": "Key / Fob / Remote Handover",
    "family": "access",
    "legacyId": "key-handover-collection",
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-019",
    "name": "Contractor Supervision Attendance",
    "family": "access",
    "legacyId": "contractor-supervision-attendance",
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-020",
    "name": "Move-In / Move-Out Attendance",
    "family": "access",
    "legacyId": "move-in-move-out-attendance",
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-021",
    "name": "Urgent Building Attendance",
    "family": "attendance",
    "legacyId": "urgent-building-attendance",
    "proposedMarkets": [
      "STR",
      "CTS",
      "COM",
      "RET",
      "AGE",
      "INS"
    ]
  },
  {
    "code": "V2-022",
    "name": "Building Handover Attendance",
    "family": "attendance",
    "legacyId": "building-handover-attendance",
    "proposedMarkets": [
      "STR",
      "CTS",
      "COM",
      "RET",
      "AGE",
      "INS"
    ]
  },
  {
    "code": "V2-023",
    "name": "Custom Property Attendance",
    "family": "attendance",
    "legacyId": "other-custom-appointment",
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-024",
    "name": "Facilities Condition Survey",
    "family": "inspections",
    "legacyId": null,
    "proposedMarkets": [
      "STR",
      "CTS",
      "COM",
      "RET",
      "AGE",
      "INS"
    ]
  },
  {
    "code": "V2-025",
    "name": "SDA Accessibility Condition Observation",
    "family": "inspections",
    "legacyId": null,
    "proposedMarkets": [
      "SDA",
      "SOC",
      "RET",
      "AGE"
    ]
  },
  {
    "code": "V2-026",
    "name": "Village Common Amenities Inspection",
    "family": "inspections",
    "legacyId": null,
    "proposedMarkets": [
      "SDA",
      "SOC",
      "RET",
      "AGE"
    ]
  },
  {
    "code": "V2-027",
    "name": "Rural Infrastructure Inspection",
    "family": "inspections",
    "legacyId": null,
    "proposedMarkets": [
      "RUR",
      "COM",
      "INS"
    ]
  },
  {
    "code": "V2-028",
    "name": "Short-Stay Turnover Inspection",
    "family": "inspections",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "SOC",
      "SDA",
      "STA",
      "RET"
    ]
  },
  {
    "code": "V2-029",
    "name": "Community Housing Portfolio Inspection",
    "family": "inspections",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "SOC",
      "SDA",
      "STA",
      "RET"
    ]
  },
  {
    "code": "V2-030",
    "name": "Maintenance Request Triage",
    "family": "maintenance",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-031",
    "name": "Contractor Quotation Coordination",
    "family": "maintenance",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-032",
    "name": "Contractor Quote Comparison Support",
    "family": "maintenance",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-033",
    "name": "Planned Maintenance Coordination",
    "family": "maintenance",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-034",
    "name": "Warranty and Defect Follow-Up",
    "family": "maintenance",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-035",
    "name": "Contractor Completion Evidence Review",
    "family": "maintenance",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-036",
    "name": "Emergency Works Coordination (Availability Dependent)",
    "family": "maintenance",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-037",
    "name": "Maintenance Record Register",
    "family": "maintenance",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-038",
    "name": "Asset Register Setup",
    "family": "facilities",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-039",
    "name": "Plant and Equipment Service Schedule",
    "family": "facilities",
    "legacyId": null,
    "proposedMarkets": [
      "STR",
      "CTS",
      "COM",
      "RET",
      "AGE",
      "INS"
    ]
  },
  {
    "code": "V2-040",
    "name": "Contractor Service Calendar",
    "family": "facilities",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-041",
    "name": "Operational Safety Walkthrough",
    "family": "facilities",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-042",
    "name": "Keys and Access Register Review",
    "family": "facilities",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-043",
    "name": "Grounds and External Area Review",
    "family": "facilities",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-044",
    "name": "Capital Expenditure Planning Support",
    "family": "facilities",
    "legacyId": null,
    "proposedMarkets": [
      "STR",
      "CTS",
      "COM",
      "RET",
      "AGE",
      "INS"
    ]
  },
  {
    "code": "V2-045",
    "name": "Asset Condition Trend Review",
    "family": "facilities",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-046",
    "name": "Multi-Site Facilities Audit",
    "family": "facilities",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-047",
    "name": "Compliance Obligations Register Setup",
    "family": "compliance",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-048",
    "name": "Compliance Calendar Management",
    "family": "compliance",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-049",
    "name": "Certificate and Evidence Follow-Up",
    "family": "compliance",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-050",
    "name": "Qualified Service Provider Coordination",
    "family": "compliance",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-051",
    "name": "Inspection Evidence Register Reconciliation",
    "family": "compliance",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-052",
    "name": "Fire System Service Coordination",
    "family": "compliance",
    "legacyId": null,
    "proposedMarkets": [
      "STR",
      "CTS",
      "COM",
      "RET",
      "AGE",
      "INS"
    ]
  },
  {
    "code": "V2-053",
    "name": "Essential Services Evidence Tracking",
    "family": "compliance",
    "legacyId": null,
    "proposedMarkets": [
      "STR",
      "CTS",
      "COM",
      "RET",
      "AGE",
      "INS"
    ]
  },
  {
    "code": "V2-054",
    "name": "Tenancy Administrative Support",
    "family": "administration",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "SOC",
      "SDA",
      "STA",
      "RET"
    ]
  },
  {
    "code": "V2-055",
    "name": "Owner Correspondence Support",
    "family": "administration",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "SOC",
      "SDA",
      "STA",
      "RET"
    ]
  },
  {
    "code": "V2-056",
    "name": "Scheme and Resident Notice Coordination",
    "family": "administration",
    "legacyId": null,
    "proposedMarkets": [
      "STR",
      "CTS",
      "COM",
      "RET",
      "AGE",
      "INS"
    ]
  },
  {
    "code": "V2-057",
    "name": "Building Move Coordination",
    "family": "administration",
    "legacyId": null,
    "proposedMarkets": [
      "STR",
      "CTS",
      "COM",
      "RET",
      "AGE",
      "INS"
    ]
  },
  {
    "code": "V2-058",
    "name": "Stakeholder Liaison",
    "family": "administration",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-059",
    "name": "Operational Handover Pack",
    "family": "administration",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-060",
    "name": "Property Records Administration",
    "family": "administration",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-061",
    "name": "Asset Incident Log",
    "family": "administration",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-062",
    "name": "Contractor Invoice Verification Support",
    "family": "financial",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-063",
    "name": "Maintenance Expenditure Budget Tracking",
    "family": "financial",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-064",
    "name": "Maintenance Cost Summary",
    "family": "financial",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-065",
    "name": "Contract Variation Administration",
    "family": "financial",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-066",
    "name": "Asset Condition Advisory Brief",
    "family": "advisory",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-067",
    "name": "Asset Lifecycle Forecast Support",
    "family": "advisory",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-068",
    "name": "Contractor Performance Summary",
    "family": "advisory",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  },
  {
    "code": "V2-069",
    "name": "Portfolio Operations Reporting",
    "family": "advisory",
    "legacyId": null,
    "proposedMarkets": [
      "RES",
      "COM",
      "STR",
      "CTS",
      "STA",
      "SOC",
      "SDA",
      "RET",
      "AGE",
      "RUR",
      "INS"
    ]
  }
] as const;
export const V2_PLANS = ['inspection','standard','outsourced'] as const;
export type V2MarketCode = (typeof V2_MARKETS)[number]['code'];
export type V2PlanCode = (typeof V2_PLANS)[number];
