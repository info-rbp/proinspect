/** Draft configuration. Modules are not specialist clinical/statutory services. */
export const V2_SECTOR_PACKS = [
  {
    "marketCode": "RES",
    "name": "Residential",
    "modules": [
      {
        "market": "RES",
        "code": "RES-M01",
        "name": "Property inspection protocols",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "RES",
        "code": "RES-M02",
        "name": "Tenancy turnover coordination",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "RES",
        "code": "RES-M03",
        "name": "Owner authority and approvals",
        "classification": "qualified_coordination",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "RES",
        "code": "RES-M04",
        "name": "Resident access and notice liaison",
        "classification": "qualified_coordination",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "RES",
        "code": "RES-M05",
        "name": "Dwelling asset condition history",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      }
    ]
  },
  {
    "marketCode": "COM",
    "name": "Commercial",
    "modules": [
      {
        "market": "COM",
        "code": "COM-M01",
        "name": "Lease make-good condition survey",
        "classification": "qualified_coordination",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "COM",
        "code": "COM-M02",
        "name": "Site and after-hours access",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "COM",
        "code": "COM-M03",
        "name": "Plant service scheduling",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "COM",
        "code": "COM-M04",
        "name": "Fitout and alteration registers",
        "classification": "qualified_coordination",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "COM",
        "code": "COM-M05",
        "name": "Facilities contractor reporting",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      }
    ]
  },
  {
    "marketCode": "STR",
    "name": "Strata",
    "modules": [
      {
        "market": "STR",
        "code": "STR-M01",
        "name": "Common property condition registers",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "STR",
        "code": "STR-M02",
        "name": "Building notice coordination",
        "classification": "qualified_coordination",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "STR",
        "code": "STR-M03",
        "name": "Lot and common access coordination",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "STR",
        "code": "STR-M04",
        "name": "Shared plant servicing",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "STR",
        "code": "STR-M05",
        "name": "Strata authority and council liaison",
        "classification": "qualified_coordination",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      }
    ]
  },
  {
    "marketCode": "CTS",
    "name": "Community Titles",
    "modules": [
      {
        "market": "CTS",
        "code": "CTS-M01",
        "name": "Community shared asset register",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "CTS",
        "code": "CTS-M02",
        "name": "Shared service request coordination",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "CTS",
        "code": "CTS-M03",
        "name": "Member notice distribution liaison",
        "classification": "qualified_coordination",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "CTS",
        "code": "CTS-M04",
        "name": "Community facilities scheduling",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "CTS",
        "code": "CTS-M05",
        "name": "Community governance approvals liaison",
        "classification": "qualified_coordination",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      }
    ]
  },
  {
    "marketCode": "STA",
    "name": "Short Stay",
    "modules": [
      {
        "market": "STA",
        "code": "STA-M01",
        "name": "Property turnaround scheduling",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "STA",
        "code": "STA-M02",
        "name": "Guest access contractor coordination",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "STA",
        "code": "STA-M03",
        "name": "Presentation quality observations",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "STA",
        "code": "STA-M04",
        "name": "Rapid repair triage",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "STA",
        "code": "STA-M05",
        "name": "Furniture and amenity condition",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      }
    ]
  },
  {
    "marketCode": "SOC",
    "name": "Social Housing",
    "modules": [
      {
        "market": "SOC",
        "code": "SOC-M01",
        "name": "Supported housing asset maintenance",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "SOC",
        "code": "SOC-M02",
        "name": "Sensitive access protocols",
        "classification": "qualified_coordination",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "SOC",
        "code": "SOC-M03",
        "name": "Housing provider approvals",
        "classification": "qualified_coordination",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "SOC",
        "code": "SOC-M04",
        "name": "Housing condition inspection",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "SOC",
        "code": "SOC-M05",
        "name": "Case escalation handoff boundary",
        "classification": "reserved_external",
        "requiredFields": [
          "authorityReference",
          "qualifiedProviderReference",
          "operationalScope"
        ]
      }
    ]
  },
  {
    "marketCode": "SDA",
    "name": "Specialist Disability Accommodation",
    "modules": [
      {
        "market": "SDA",
        "code": "SDA-M01",
        "name": "Accessible facilities asset register",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "SDA",
        "code": "SDA-M02",
        "name": "Accessibility modification coordination",
        "classification": "qualified_coordination",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "SDA",
        "code": "SDA-M03",
        "name": "SDA provider liaison",
        "classification": "qualified_coordination",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "SDA",
        "code": "SDA-M04",
        "name": "Essential equipment servicing",
        "classification": "qualified_coordination",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "SDA",
        "code": "SDA-M05",
        "name": "NDIS and clinical determinations",
        "classification": "reserved_external",
        "requiredFields": [
          "authorityReference",
          "qualifiedProviderReference",
          "operationalScope"
        ]
      }
    ]
  },
  {
    "marketCode": "RET",
    "name": "Retirement Villages",
    "modules": [
      {
        "market": "RET",
        "code": "RET-M01",
        "name": "Village common amenity inspection",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "RET",
        "code": "RET-M02",
        "name": "Resident works scheduling",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "RET",
        "code": "RET-M03",
        "name": "Shared facilities maintenance",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "RET",
        "code": "RET-M04",
        "name": "Village capital asset lifecycle",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "RET",
        "code": "RET-M05",
        "name": "Retirement village statutory governance",
        "classification": "reserved_external",
        "requiredFields": [
          "authorityReference",
          "qualifiedProviderReference",
          "operationalScope"
        ]
      }
    ]
  },
  {
    "marketCode": "AGE",
    "name": "Aged Care",
    "modules": [
      {
        "market": "AGE",
        "code": "AGE-M01",
        "name": "Facility plant and essential services",
        "classification": "qualified_coordination",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "AGE",
        "code": "AGE-M02",
        "name": "Contractor site entry protocols",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "AGE",
        "code": "AGE-M03",
        "name": "Room access and infection controls liaison",
        "classification": "qualified_coordination",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "AGE",
        "code": "AGE-M04",
        "name": "Aged care facility asset register",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "AGE",
        "code": "AGE-M05",
        "name": "Clinical and care compliance decisions",
        "classification": "reserved_external",
        "requiredFields": [
          "authorityReference",
          "qualifiedProviderReference",
          "operationalScope"
        ]
      }
    ]
  },
  {
    "marketCode": "RUR",
    "name": "Rural Agriculture",
    "modules": [
      {
        "market": "RUR",
        "code": "RUR-M01",
        "name": "Water and irrigation asset checks",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "RUR",
        "code": "RUR-M02",
        "name": "Fencing gate and tracks condition",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "RUR",
        "code": "RUR-M03",
        "name": "Firebreak maintenance coordination",
        "classification": "qualified_coordination",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "RUR",
        "code": "RUR-M04",
        "name": "Remote workforce access scheduling",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "RUR",
        "code": "RUR-M05",
        "name": "Rural structures defect management",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      }
    ]
  },
  {
    "marketCode": "INS",
    "name": "Institutional and Public",
    "modules": [
      {
        "market": "INS",
        "code": "INS-M01",
        "name": "Public facilities planned maintenance",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "INS",
        "code": "INS-M02",
        "name": "Asset condition portfolio register",
        "classification": "operations",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "INS",
        "code": "INS-M03",
        "name": "Procurement authority support",
        "classification": "qualified_coordination",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "INS",
        "code": "INS-M04",
        "name": "Restricted site access coordination",
        "classification": "qualified_coordination",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      },
      {
        "market": "INS",
        "code": "INS-M05",
        "name": "Public incident response handoff",
        "classification": "qualified_coordination",
        "requiredFields": [
          "scopeReference",
          "evidenceReference"
        ]
      }
    ]
  }
] as const;
export const SECTOR_RELEASE_CHECKS = ["governance","service_scope","pricing","insurance","credentials","privacy","workflow_acceptance"] as const;
export function validSectorFacts(required:readonly string[],facts:unknown):facts is Record<string,string>{
 if(!facts || typeof facts!=='object'||Array.isArray(facts))return false;
 const data=facts as Record<string,unknown>,keys=Object.keys(data);
 return keys.length<=12 && keys.every(k=>/^[A-Za-z][A-Za-z0-9]{0,49}$/.test(k)
 && typeof data[k]==='string' && String(data[k]).length<=500)
 && required.every(k=>typeof data[k]==='string'&&String(data[k]).trim().length>=4);
}
