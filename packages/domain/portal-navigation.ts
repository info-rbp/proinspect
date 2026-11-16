import type { WorkspaceKind } from './index';

/**
 * Stable, independently versioned portal navigation configurations.
 * These tags control presentation only: no membership, document or action right
 * can be inferred from menu visibility. All loaders and actions recheck rights.
 */
export interface MenuProfile {
  tag: string;
  version: string;
  label: string;
  primary: readonly string[];
}

export const PORTAL_MENU_PROFILES: Record<WorkspaceKind, MenuProfile> = {
  landlord: {
    tag: 'NAV-RES-OWNER', version: '1.1.0', label: 'Residential owner',
    primary: ['', 'properties', 'requests', 'tenancies', 'reports', 'billing'],
  },
  'property-manager': {
    tag: 'NAV-RES-AGENCY', version: '1.1.0', label: 'Residential property manager',
    primary: ['', 'properties', 'portfolio', 'tenancies', 'work-orders', 'reports', 'finance'],
  },
  commercial: {
    tag: 'NAV-COM-MANAGER', version: '1.1.0', label: 'Commercial owner / manager',
    primary: ['', 'properties', 'commercial-leases', 'commercial-occupancies', 'requests', 'reports', 'finance'],
  },
  'strata-manager': {
    tag: 'NAV-STR-MANAGER', version: '1.1.0', label: 'Strata manager',
    primary: ['', 'schemes', 'work-orders', 'resident-invitations', 'council-appointments', 'finance', 'reports'],
  },
  'building-manager': {
    tag: 'NAV-STR-BUILDING', version: '1.1.0', label: 'Building manager',
    primary: ['', 'facilities', 'building-communications', 'documents'],
  },
  tenant: {
    tag: 'NAV-INV-RES', version: '1.1.0', label: 'Residential tenant',
    primary: ['', 'tenancies', 'inspections', 'requests', 'documents'],
  },
  'commercial-occupant': {
    tag: 'NAV-INV-COM', version: '1.1.0', label: 'Commercial occupant',
    primary: ['', 'occupant-premises', 'occupant-requests'],
  },
  building: {
    tag: 'NAV-INV-STR', version: '1.1.0', label: 'Building resident / lot owner',
    primary: ['', 'schemes', 'requests', 'documents', 'facilities'],
  },
  council: {
    tag: 'NAV-INV-COUNCIL', version: '1.1.0', label: 'Strata council',
    primary: ['', 'schemes', 'finance', 'reports', 'documents'],
  },
  staff: {
    tag: 'NAV-OPS', version: '1.1.0', label: 'ProInspect Operations',
    primary: ['', 'bookings', 'work-orders', 'reports', 'properties', 'finance'],
  },
};

export const MORE_TOOL_GROUPS: readonly { label: string; paths: readonly string[] }[] = [
  {
    label: 'Operations', paths: [
      'records','bookings','booking-changes','work-orders','requests','inspections','portfolio','outsourcing',
      'tenancies','resident-invitations','commercial-occupancies','occupant-premises','occupant-requests',
      'council-appointments','schemes','facilities','building-communications','leasing','open-home-checkins',
      'rental-applications','guest-orders','v4-service-requests','maintenance-delivery','asset-compliance',
      'commercial-leases',
    ],
  },
  {
    label: 'Documents & services', paths: [
      'documents','reports','document-operations','service-agreements','wa-form-queue','bond-review-queue',
      'services','reporting','confidential','market-packs','enterprise-intelligence','v2-business',
    ],
  },
  {
    label: 'Administration', paths: [
      'finance','billing','contractor-payments','team','agency-administration','administration',
      'release-readiness','pricing-administration','legal-administration','integrations','enquiries','owner-invitations',
    ],
  },
];

/** Role-specific secondary links are filtered before these groupings are applied. */
export function getNavigationProfile(kind: WorkspaceKind): MenuProfile {
  return PORTAL_MENU_PROFILES[kind];
}
