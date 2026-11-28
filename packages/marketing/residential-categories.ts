/** Residential marketing categories; not a price list or a new booking catalogue. */
export type ResidentialFeature = { title:string; description:string; href:string; featured:boolean };
export type ResidentialCategory = {slug:string; title:string; intro:string; image:'residential'|'leasing'|'maintenance'; features:ResidentialFeature[]};
export const RESIDENTIAL_CATEGORIES: ResidentialCategory[] = [
  {
    "slug": "property-inspections",
    "title": "Property Inspections",
    "intro": "From your first Property Condition Report to routine visits and exit inspections, get a clearer picture of what is happening at your rental.",
    "image": "residential",
    "features": [
      {
        "title": "Property Condition Report (PCR)",
        "description": "An incoming photographic record of visible property condition for the beginning of a tenancy.",
        "href": "/services/property-condition-report",
        "featured": true
      },
      {
        "title": "Routine Inspections",
        "description": "Document visible condition, maintenance concerns and follow-up during a tenancy, with lawful access.",
        "href": "/services/routine-inspection",
        "featured": true
      },
      {
        "title": "Final / Exit Inspection",
        "description": "Record outgoing property condition and compare available incoming records.",
        "href": "/services/final-exit-inspection",
        "featured": true
      },
      {
        "title": "Pre-Vacate Inspection",
        "description": "Identify visible cleaning, maintenance and rectification items ahead of a final inspection.",
        "href": "/services/pre-vacate-inspection",
        "featured": false
      },
      {
        "title": "Follow-Up Inspection",
        "description": "Revisit issues previously identified and document their current condition.",
        "href": "/services/follow-up-reinspection",
        "featured": false
      }
    ]
  },
  {
    "slug": "open-homes",
    "title": "Open Homes",
    "intro": "Help prospective renters inspect a published home. We facilitate agreed inspection sessions on behalf of the responsible landlord or leasing representative.",
    "image": "leasing",
    "features": [
      {
        "title": "Scheduled Open Homes",
        "description": "Arrange approved inspection dates, lawful access and ProInspect attendance with the responsible leasing representative.",
        "href": "/contact?topic=open-homes",
        "featured": true
      },
      {
        "title": "Register for an Open Home",
        "description": "Visitors can register for a published inspection. Registration does not submit a rental application.",
        "href": "/leasing",
        "featured": true
      },
      {
        "title": "Visitor Check-in",
        "description": "Support session check-in and keep attendance information restricted to authorised people.",
        "href": "/leasing",
        "featured": false
      },
      {
        "title": "Private Property Viewings",
        "description": "Discuss separately instructed viewings, scheduling and follow-up.",
        "href": "/contact?topic=private-viewings",
        "featured": false
      }
    ]
  },
  {
    "slug": "leasing-support",
    "title": "Leasing Support",
    "intro": "From advertising to handover, coordinate practical leasing tasks while the landlord or appointed agency retains approval and tenancy decisions.",
    "image": "leasing",
    "features": [
      {
        "title": "Residential Tenancy Agreements",
        "description": "Coordinate authorised tenancy documentation, subject to review and the prescribed form requirements.",
        "href": "/contact?topic=tenancy-agreements",
        "featured": true
      },
      {
        "title": "Rental Applications",
        "description": "Follow the agency's nominated application link or another approved pathway. ProInspect does not decide who is accepted.",
        "href": "/leasing",
        "featured": true
      },
      {
        "title": "Property Advertising and Viewings",
        "description": "Prepare approved listings and coordinate advertised inspections with authorised instructions.",
        "href": "/leasing",
        "featured": false
      },
      {
        "title": "Tenancy Commencement Support",
        "description": "Discuss condition records, keys and handovers for a new tenancy.",
        "href": "/residential/services/access-control",
        "featured": false
      }
    ]
  },
  {
    "slug": "maintenance-management",
    "title": "Maintenance Management",
    "intro": "From a small maintenance concern to larger approved contractor works, keep requests, decisions and follow-up connected to the property.",
    "image": "maintenance",
    "features": [
      {
        "title": "Maintenance Requests and Contractor Works",
        "description": "Record reported issues, obtain quotations and arrange approved contractor attendance. Trade costs require separate approval.",
        "href": "/maintenance",
        "featured": true
      },
      {
        "title": "Maintenance Attendance",
        "description": "Arrange an inspection of a reported issue and get factual observations for the next decision.",
        "href": "/services/maintenance-attendance",
        "featured": true
      },
      {
        "title": "Preventative Care and Monitoring",
        "description": "Plan condition checks and identify matters needing maintenance follow-up.",
        "href": "/maintenance",
        "featured": false
      },
      {
        "title": "Completed Works Inspections",
        "description": "Record visible completion and outstanding issues; specialist certification remains with qualified providers.",
        "href": "/services/completed-works-inspection",
        "featured": false
      },
      {
        "title": "Insurance and Incident Support",
        "description": "Document visible damage and coordinate separately approved specialist follow-up.",
        "href": "/contact?topic=incidents",
        "featured": false
      }
    ]
  },
  {
    "slug": "access-control",
    "title": "Access Control",
    "intro": "Keys, authorised property attendance, contractor entry and handovers need clear instructions and reliable records.",
    "image": "residential",
    "features": [
      {
        "title": "Key, Fob and Remote Handovers",
        "description": "Arrange authorised access-device collection, delivery and custody records.",
        "href": "/services/key-handover-collection",
        "featured": true
      },
      {
        "title": "Contractor Access Attendance",
        "description": "Attend a property for an authorised contractor's access and document the visit.",
        "href": "/services/contractor-access-attendance",
        "featured": true
      },
      {
        "title": "Property Meetings",
        "description": "Meet an owner, property manager or contractor at the property as instructed.",
        "href": "/services/property-meeting",
        "featured": false
      },
      {
        "title": "Move-In and Move-Out Access",
        "description": "Discuss keys, access, handovers and agreed attendance on occupancy changes.",
        "href": "/contact?topic=access",
        "featured": false
      }
    ]
  },
  {
    "slug": "exit-inspections",
    "title": "Exit Inspections",
    "intro": "Prepare for vacate, record outgoing condition and maintain clear supporting evidence for the authorised parties.",
    "image": "residential",
    "features": [
      {
        "title": "Pre-Vacate Inspection",
        "description": "Note apparent cleaning, repairs and follow-up before the tenancy ends.",
        "href": "/services/pre-vacate-inspection",
        "featured": true
      },
      {
        "title": "Final / Exit Inspection",
        "description": "Document outgoing condition alongside available incoming records.",
        "href": "/services/final-exit-inspection",
        "featured": true
      },
      {
        "title": "Follow-Up Inspection",
        "description": "Return to identified issues where a further factual record is commissioned.",
        "href": "/services/follow-up-reinspection",
        "featured": false
      },
      {
        "title": "Vacate Coordination",
        "description": "Discuss key return, site attendance and handover tasks.",
        "href": "/contact?topic=vacate",
        "featured": false
      }
    ]
  },
  {
    "slug": "bond-administration",
    "title": "Bond Administration",
    "intro": "Keep bond-related records and outgoing condition evidence organised, without treating ProInspect as the holder of bond money or decision-maker.",
    "image": "residential",
    "features": [
      {
        "title": "Bond Documentation",
        "description": "Discuss instructed administrative support with prescribed documents and reviewed records.",
        "href": "/contact?topic=bond",
        "featured": true
      },
      {
        "title": "Exit Condition Evidence",
        "description": "Arrange the outgoing condition record required for the authorised tenancy process.",
        "href": "/services/final-exit-inspection",
        "featured": true
      },
      {
        "title": "Disputes and Differences",
        "description": "Organise factual documents; any claim or dispute remains with the responsible parties and lawful process.",
        "href": "/contact?topic=bond-disputes",
        "featured": false
      }
    ]
  },
  {
    "slug": "other-property-support",
    "title": "Tailored Property Solutions",
    "intro": "Not every property requirement fits an ordinary inspection. Tell us what you need and we can assess a tailored scope.",
    "image": "maintenance",
    "features": [
      {
        "title": "Property Meetings",
        "description": "Arrange authorised attendance with an owner, agency or nominated contractor.",
        "href": "/services/property-meeting",
        "featured": true
      },
      {
        "title": "Custom Property Support",
        "description": "Describe the property, task and desired outcome for a tailored response.",
        "href": "/contact",
        "featured": true
      },
      {
        "title": "Ongoing Residential Support",
        "description": "Explore an optional residential subscription for agreed inspections and operations.",
        "href": "/residential/subscriptions",
        "featured": false
      },
      {
        "title": "Browse Individual Services",
        "description": "See the existing catalogue for other supported property tasks.",
        "href": "/services",
        "featured": false
      }
    ]
  }
];
export function residentialCategory(slug:string){return RESIDENTIAL_CATEGORIES.find(c=>c.slug===slug)}
