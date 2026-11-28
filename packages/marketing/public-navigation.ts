/** Public marketing navigation is editorial, never a permission grant. */
export const PUBLIC_NAVIGATION = [
  { label: 'Residential', href: '/residential' },
  { label: 'Commercial', href: '/commercial' },
  { label: 'Co-Spaces', href: '/co-spaces' },
  { label: 'Maintenance', href: '/maintenance' },
  { label: 'Modular', href: '/modular' },
  { label: 'Construction', href: '/construction' },
  { label: 'Tenants', href: '/tenants' },
  { label: 'Leasing', href: '/leasing' },
  { label: 'Subscriptions', href: '/subscriptions' },
  { label: 'Information', href: '/information' },
  { label: 'Sign Up / Sign In', href: '/client' },
] as const;

/** A category can own descendant and legacy routes without claiming to be
 * the exact current page. Order explicit aliases before prefix matches. */
const CATEGORY_ALIASES: readonly [string, readonly string[]][] = [
  ['/subscriptions', ['/residential/subscriptions', '/subscription-terms']],
  ['/co-spaces', ['/co-living', '/student-living']],
  [
    '/leasing',
    [
      '/properties-for-lease',
      '/open-home/check-in',
      '/rental-application',
      '/rental-package',
      '/rental-recipient',
      '/commercial-application',
    ],
  ],
  ['/residential', ['/residential-property-support', '/services', '/service-finder']],
  [
    '/information',
    [
      '/about',
      '/contact',
      '/help-centre',
      '/resources',
      '/example-reports',
      '/who-we-help',
      '/how-we-work',
      '/privacy',
      '/website-terms',
      '/platform-terms',
      '/terms',
      '/booking-policy',
      '/service-scopes',
    ],
  ],
];
const within = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + '/');
export function activePublicCategory(pathname: string): string | undefined {
  const path = pathname.replace(/\/+$/, '') || '/';
  for (const [category, aliases] of CATEGORY_ALIASES)
    if (aliases.some((alias) => within(path, alias))) return category;
  return PUBLIC_NAVIGATION.find((item) => item.href !== '/client' && within(path, item.href))?.href;
}

/** Only completed public destinations and existing page sections. No service activation. */
export const SECONDARY_NAVIGATION: Record<string, readonly { label: string; href: string }[]> = {
  '/residential': [
    { label: 'Residential services', href: '/residential/services' },
    { label: 'Property inspections', href: '/residential/services/property-inspections' },
    { label: 'Open homes', href: '/residential/services/open-homes' },
    { label: 'Leasing support', href: '/residential/services/leasing-support' },
    { label: 'Maintenance management', href: '/residential/services/maintenance-management' },
    { label: 'Access control', href: '/residential/services/access-control' },
    { label: 'Exit inspections', href: '/residential/services/exit-inspections' },
    { label: 'Bond administration', href: '/residential/services/bond-administration' },
    { label: 'Tailored property solutions', href: '/residential/services/other-property-support' },
  ],
  '/commercial': [
    { label: 'Proposed solutions', href: '/commercial#commercial-solutions' },
    { label: 'Property types', href: '/commercial#property-types' },
    { label: 'Discuss your requirements', href: '/contact' },
  ],
  '/co-spaces': [
    { label: 'Co-Living', href: '/co-living' },
    { label: 'Co-Living property setup', href: '/co-living/property-setup' },
    { label: 'Explore advertised spaces', href: '/co-spaces#available-spaces' },
  ],
  '/maintenance': [
    { label: 'Maintenance solutions', href: '/maintenance#maintenance-solutions' },
    { label: 'How property care works', href: '/maintenance#property-care-process' },
    { label: 'Tenant maintenance help', href: '/tenants#maintenance-help' },
  ],
  '/tenants': [
    { label: 'Tenant assistance', href: '/tenants#tenant-actions' },
    { label: 'Inspection guidance', href: '/tenants#inspection-help' },
    { label: 'Maintenance and urgent assistance', href: '/tenants#maintenance-help' },
    { label: 'Resume an application', href: '/rental-application/recover' },
    { label: 'Access your tenant workspace', href: '/client' },
  ],
  '/leasing': [
    { label: 'All advertised properties', href: '/leasing' },
    { label: 'Residential listings', href: '/leasing?type=residential#available-properties' },
    { label: 'Co-Living listings', href: '/leasing?type=co-living#available-properties' },
  ],
  '/subscriptions': [
    { label: 'Subscription information', href: '/subscriptions' },
    { label: 'Existing Residential subscription', href: '/residential/subscriptions' },
    { label: 'Subscription terms', href: '/subscription-terms' },
  ],
  '/information': [
    { label: 'About ProInspect', href: '/about' },
    { label: 'Contact us', href: '/contact' },
    { label: 'Help Centre', href: '/help-centre' },
    { label: 'Resources', href: '/resources' },
    { label: 'Example reports', href: '/example-reports' },
    { label: 'Privacy', href: '/privacy' },
    { label: 'Website terms', href: '/website-terms' },
    { label: 'Platform terms', href: '/platform-terms' },
    { label: 'Booking policy', href: '/booking-policy' },
    { label: 'Service scopes', href: '/service-scopes' },
    { label: 'Terms overview', href: '/terms' },
  ],
};
