export const CLIENT_TYPES = [
  'landlord',
  'agency',
  'commercial_landlord',
  'strata_company',
  'asset_manager',
  'other',
] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];
export const WORKSPACES = {
  landlord: {
    name: 'Landlord Portal',
    purpose: 'Self-manage your residential properties',
    scope: 'client',
  },
  'property-manager': {
    name: 'Property Manager Portal',
    purpose: 'Operate your managed portfolio',
    scope: 'client',
  },
  'strata-manager': {
    name: 'Strata Manager Portal',
    purpose: 'Coordinate your schemes and buildings',
    scope: 'client',
  },
  commercial: {
    name: 'Commercial Property Portal',
    purpose: 'Oversee commercial property operations',
    scope: 'client',
  },
  tenant: {
    name: 'Tenant Portal',
    purpose: 'Manage your tenancy requests and documents',
    scope: 'tenancy',
  },
  building: {
    name: 'Building Portal',
    purpose: 'Stay connected to your building',
    scope: 'scheme',
  },
  council: {
    name: 'Strata Council Portal',
    purpose: 'Review issues and operational decisions',
    scope: 'scheme',
  },
  staff: { name: 'Staff / Admin', purpose: 'Deliver ProInspect services', scope: 'staff' },
} as const;
export type WorkspaceKind = keyof typeof WORKSPACES;
export interface Workspace {
  kind: WorkspaceKind;
  scopeId: string;
  name: string;
  role: string;
  href: string;
}
export interface User {
  id: string;
  email: string;
  display_name: string;
}
export interface Principal extends User {
  staffRole?: 'administrator' | 'operations_manager' | 'inspector' | 'read_only';
}
export interface Property {
  id: string;
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  sector: string;
  property_type: string;
}
export interface Service {
  id: string;
  name: string;
  family: string;
  sectors: string[];
  summary: string;
  duration_minutes: number;
  buffer_before: number;
  buffer_after: number;
  notice_hours: number;
  horizon_days: number;
  price_ex_gst_cents: number | null;
  booking_mode: 'instant' | 'request';
  active: number;
}
export const WORK_ORDER_TRANSITIONS: Record<string, readonly string[]> = {
  triage: ['quote_required', 'awaiting_approval', 'assigned', 'scheduled', 'cancelled'],
  quote_required: ['awaiting_approval', 'cancelled'],
  awaiting_approval: ['approved', 'quote_required', 'cancelled'],
  approved: ['assigned', 'scheduled', 'cancelled'],
  assigned: ['scheduled', 'in_progress', 'cancelled'],
  scheduled: ['assigned', 'in_progress', 'cancelled'],
  in_progress: ['report_pending', 'completed'],
  report_pending: ['in_progress', 'completed'],
  completed: [],
  cancelled: [],
};
export function canTransition(from: string, to: string): boolean {
  return WORK_ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}
export const STATUS_LABELS: Record<string, string> = {
  triage: 'Needs review',
  quote_required: 'Quote required',
  awaiting_approval: 'Awaiting approval',
  approved: 'Approved',
  assigned: 'Assigned',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  report_pending: 'Report pending',
  completed: 'Completed',
  cancelled: 'Cancelled',
  confirmed: 'Confirmed',
  submitted: 'Received',
  under_review: 'Under review',
  action_required: 'Action required',
  closed: 'Closed',
  issued: 'Issued',
  pending: 'Pending',
  active: 'Active',
  ended: 'Ended',
  payment_required: 'Payment required',
};
export function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status.replaceAll('_', ' ');
}
export function safeReturnTo(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\r\n]/.test(value)
  )
    return '/workspaces';
  try {
    const url = new URL(value, 'https://app.proinspect.invalid');
    return url.origin === 'https://app.proinspect.invalid'
      ? url.pathname + url.search
      : '/workspaces';
  } catch {
    return '/workspaces';
  }
}
export function displayDate(iso: string) {
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Australia/Perth',
  }).format(new Date(iso));
}
export function money(cents: number | null) {
  return cents === null
    ? 'Quote required'
    : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100);
}
