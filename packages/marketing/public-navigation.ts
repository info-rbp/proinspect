/** Public marketing navigation is editorial, never a permission grant. */
export const PUBLIC_NAVIGATION = [
 {label:'Residential',href:'/residential'},
 {label:'Commercial',href:'/commercial'},
 {label:'Co-Spaces',href:'/co-spaces'},
 {label:'Maintenance',href:'/maintenance'},
 {label:'Modular',href:'/modular'},
 {label:'Construction',href:'/construction'},
 {label:'Tenants',href:'/tenants'},
 {label:'Leasing',href:'/leasing'},
 {label:'Subscriptions',href:'/subscriptions'},
 {label:'Information',href:'/information'},
 {label:'Sign Up / Sign In',href:'/client'},
] as const;

/** A category can own descendant and legacy routes without claiming to be
 * the exact current page. Order explicit aliases before prefix matches. */
const CATEGORY_ALIASES: readonly [string, readonly string[]][] = [
  ['/subscriptions', ['/residential/subscriptions','/subscription-terms']],
  ['/co-spaces', ['/co-living','/student-living']],
  ['/leasing', ['/properties-for-lease','/open-home/check-in','/rental-application','/rental-package','/rental-recipient','/commercial-application']],
  ['/residential', ['/residential-property-support','/services','/service-finder']],
  ['/information', ['/about','/contact','/help-centre','/resources','/example-reports','/who-we-help','/how-we-work','/privacy','/website-terms','/platform-terms','/terms','/booking-policy','/service-scopes']],
];
const within = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + '/');
export function activePublicCategory(pathname: string): string | undefined {
  const path=pathname.replace(/\/+$/, '') || '/';
  for (const [category, aliases] of CATEGORY_ALIASES)
    if (aliases.some(alias => within(path, alias))) return category;
  return PUBLIC_NAVIGATION.find(item => item.href !== '/client' && within(path,item.href))?.href;
}
