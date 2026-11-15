/** Public navigation is editorial; it grants no account permission. */
export const PUBLIC_NAVIGATION = [
  { label:'Residential', href:'/residential' },
  { label:'Commercial', href:'/commercial' }, { label:'Strata', href:'/strata' },
  { label:'Co-Living', href:'/co-living' }, { label:'Construction', href:'/construction' },
  { label:'Leasing', href:'/leasing' }, { label:'Tenants', href:'/tenants' },
  { label:'Maintenance', href:'/maintenance' },
  { label:'About Us', href:'/about' }, { label:'Who We Help', href:'/who-we-help' },
  { label:'Sign Up / Sign In', href:'/client' }, { label:'Contact Us', href:'/contact' },
] as const;
