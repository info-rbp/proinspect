import type { Workspace, WorkspaceKind } from './index';

export type PortalFamily = 'residential' | 'commercial' | 'strata' | 'resident' | 'operations';

export const PORTAL_FAMILIES: Record<PortalFamily, { name: string; description: string }> = {
  residential: { name: 'Residential', description: 'Your residential properties, inspections and portfolio' },
  commercial: { name: 'Commercial', description: 'Commercial premises and asset operations' },
  strata: { name: 'Strata', description: 'Scheme, building and facilities operations' },
  resident: { name: 'Resident', description: 'Invited tenancy, building and council membership' },
  operations: { name: 'ProInspect Operations', description: 'Authorised internal service delivery' },
};

/** Presentation categories only. The original nine workspace kinds remain server-side permissions. */
export function portalFamily(kind: WorkspaceKind): PortalFamily {
  if (kind === 'landlord' || kind === 'property-manager') return 'residential';
  if (kind === 'commercial') return 'commercial';
  if (kind === 'strata-manager' || kind === 'building-manager') return 'strata';
  if (kind === 'staff') return 'operations';
  return 'resident';
}

export const ACCOUNT_EXPERIENCE_TAGS = [
  'co_living', 'student_living', 'professional_portfolio', 'multi_site', 'priority_operations',
] as const;
export type AccountExperienceTag = (typeof ACCOUNT_EXPERIENCE_TAGS)[number];

export const EXPERIENCE_TAG_LABELS: Record<AccountExperienceTag, string> = {
  co_living: 'Co-living',
  student_living: 'Student living',
  professional_portfolio: 'Professional portfolio',
  multi_site: 'Multi-site',
  priority_operations: 'Priority operations',
};

export function effectiveExperienceLabels(workspace: Workspace): string[] {
  const identityLabel: Record<WorkspaceKind, string> = {
    landlord: 'Residential landlord',
    'property-manager': 'Property management agency',
    commercial: workspace.accountType === 'commercial_landlord' ? 'Commercial landlord' : 'Asset management',
    'strata-manager': 'Strata management',
    'building-manager': 'Building management',
    tenant: 'Tenant',
    building: workspace.role === 'owner' ? 'Lot owner' : 'Building resident',
    council: 'Council member',
    staff: 'ProInspect staff',
  };
  return [
    identityLabel[workspace.kind],
    ...(workspace.experienceTags ?? []).filter(
      (tag): tag is AccountExperienceTag => (ACCOUNT_EXPERIENCE_TAGS as readonly string[]).includes(tag),
    ).map(tag => EXPERIENCE_TAG_LABELS[tag]),
  ];
}

/** Does not merge accounts, tenancy records, or permissions across workspaces. */
export function groupWorkspaces(workspaces: Workspace[]) {
  return (Object.keys(PORTAL_FAMILIES) as PortalFamily[])
    .map(family => ({
      family,
      ...PORTAL_FAMILIES[family],
      workspaces: workspaces.filter(w => portalFamily(w.kind) === family),
    }))
    .filter(group => group.workspaces.length > 0);
}
