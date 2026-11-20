import type { Workspace } from '../domain/index';
import { safeReturnTo } from '../domain/index.ts';
import { bookingIntent } from '../domain/booking-intent.ts';
import { getOnboardingFlow } from './registry.ts';

/** These choices describe a journey. Only server-returned memberships grant access. */
export const ENTRY_CHOICES = [
  { id: 'ONB-RES-OWNER', label: 'Residential owner', family: 'Residential' },
  { id: 'ONB-RES-AGENCY', label: 'Residential property manager', family: 'Residential' },
  { id: 'ONB-COM-OWNER', label: 'Commercial owner', family: 'Commercial' },
  { id: 'ONB-COM-MANAGER', label: 'Commercial property or asset manager', family: 'Commercial' },
  { id: 'ONB-STR-MANAGER', label: 'Strata manager', family: 'Strata' },
  { id: 'ONB-STR-BUILDING', label: 'Invited building or facilities manager', family: 'Strata' },
  {
    id: 'ONB-INV-CORE',
    label: 'Tenant, occupant, lot owner or council member',
    family: 'Resident',
  },
] as const;
export type EntryFlow = (typeof ENTRY_CHOICES)[number]['id'];
export function entryFlow(value: unknown): EntryFlow | null {
  return ENTRY_CHOICES.find((choice) => choice.id === value)?.id ?? null;
}
export function withService(path: string, value: unknown): string {
  const service = bookingIntent(value);
  return (
    path +
    (service ? (path.includes('?') ? '&' : '?') + 'service=' + encodeURIComponent(service) : '')
  );
}
export function entryPath(flow: unknown, service?: unknown): string {
  const id = entryFlow(flow);
  return withService('/start' + (id ? '?flow=' + id : ''), service);
}
export function authDestination(value: unknown): string {
  if (value == null || value === '') return '/start';
  const target = safeReturnTo(value);
  // A sign-in link must not return to another authentication form or sign-out.
  const pathname = target.split('?')[0].replace(/\.data$/, '').replace(/\/+$/, '');
  return ['/signin', '/signup', '/auth/complete', '/signout'].includes(pathname) ? '/start' : target;
}
export function workspaceEntryPath(workspace: Workspace, service?: unknown): string {
  const intent = bookingIntent(service);
  if (
    intent &&
    ['landlord', 'property-manager', 'commercial', 'strata-manager'].includes(workspace.kind)
  )
    return workspace.href + '/book/' + encodeURIComponent(intent);
  return (
    workspace.href +
    (workspace.landingSection && workspace.landingSection !== 'overview'
      ? '/' + workspace.landingSection
      : '')
  );
}
function matchesFlow(workspace: Workspace, flow: EntryFlow): boolean {
  switch (flow) {
    case 'ONB-RES-OWNER':
      return workspace.kind === 'landlord';
    case 'ONB-RES-AGENCY':
      return workspace.kind === 'property-manager';
    case 'ONB-COM-OWNER':
      return (
        workspace.kind === 'commercial' &&
        workspace.accountType === 'commercial_landlord' &&
        !workspace.professionalPortfolio
      );
    case 'ONB-COM-MANAGER':
      return workspace.kind === 'commercial' && workspace.professionalPortfolio === true;
    case 'ONB-STR-MANAGER':
      return workspace.kind === 'strata-manager';
    case 'ONB-STR-BUILDING':
      return workspace.kind === 'building-manager';
    case 'ONB-INV-CORE':
      return ['tenant', 'commercial-occupant', 'building', 'council'].includes(workspace.kind);
  }
}
/** Call only with the current session's server-authorised workspaces. No writes. */
export function resolvePortalEntry(
  workspaces: Workspace[],
  flowValue?: unknown,
  service?: unknown,
): string | null {
  const flow = entryFlow(flowValue);
  const matches = flow
    ? workspaces.filter((workspace) => matchesFlow(workspace, flow))
    : workspaces;
  if (matches.length === 1) return workspaceEntryPath(matches[0], service);
  if (matches.length > 1) return withService('/workspaces', service);
  if (flow) {
    const definition = getOnboardingFlow(flow);
    if (definition && 'href' in definition) return withService(definition.href, service);
  }
  return null;
}
