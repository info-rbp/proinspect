/** Shared, permission-aware presentation map for all nine portal types.
 * The server remains the authority for route/data access: hiding a link does not grant access.
 * Keep optional specialist screens accessible, but out of the primary task navigation.
 */
export interface PortalLink { path: string; label: string }
export interface PortalGroup { id: string; label: string; links: PortalLink[] }
export interface PortalNavigation { primary: PortalLink[]; groups: PortalGroup[]; all: PortalLink[] }

export const PORTAL_KINDS = [
  'landlord', 'property-manager', 'commercial', 'strata-manager', 'tenant',
  'building', 'council', 'building-manager', 'staff',
] as const;

const PRIMARY: Record<string, string[]> = {
  landlord: ['', 'properties', 'bookings', 'requests', 'reports', 'billing'],
  'property-manager': ['', 'properties', 'portfolio', 'bookings', 'work-orders', 'reports', 'finance'],
  commercial: ['', 'properties', 'commercial-leases', 'bookings', 'reports', 'finance'],
  'strata-manager': ['', 'schemes', 'work-orders', 'requests', 'reports', 'finance'],
  tenant: ['', 'tenancies', 'inspections', 'requests', 'documents'],
  building: ['', 'schemes', 'requests', 'documents', 'facilities'],
  council: ['', 'schemes', 'finance', 'reports', 'documents'],
  'building-manager': ['', 'facilities', 'building-communications', 'documents'],
  staff: ['', 'bookings', 'work-orders', 'reports', 'properties', 'finance'],
};
const GROUPS: Array<{id:string;label:string;paths:string[]}> = [
  {id:'records', label:'Records & reporting', paths:['records','documents','reporting','document-operations','service-agreements','asset-compliance','market-packs','enterprise-intelligence']},
  {id:'property', label:'Property & tenancy', paths:['portfolio','properties','tenancies','schemes','owner-invitations','commercial-leases','outsourcing','agency-administration','leasing','open-home-checkins','rental-applications','wa-form-queue','bond-review-queue']},
  {id:'operations', label:'Service delivery', paths:['bookings','booking-changes','work-orders','requests','inspections','facilities','building-communications','maintenance-delivery','guest-orders','v4-service-requests','enquiries','confidential']},
  {id:'commercial', label:'Financial controls', paths:['finance','billing','contractor-payments','pricing-administration']},
  {id:'admin', label:'Administration & settings', paths:['team','administration','services','legal-administration','integrations','release-readiness','v2-business']},
];

export function portalNavigation(kind:string, role:string, staffRole:string|undefined, restrictedEnabled:boolean): PortalNavigation {
  const items:PortalLink[]=[];
  const push=(path:string,label:string)=>{if(!items.some(x=>x.path===path))items.push({path,label});};
  const staff=kind==='staff';
  const customer=['landlord','property-manager','commercial','strata-manager'].includes(kind);
  const management=['landlord','property-manager','commercial'].includes(kind);
  const staffManager=staff&&['administrator','operations_manager'].includes(staffRole??'');
  const staffNonInspector=staff&&staffRole!=='inspector';
  const owner=['owner','admin'].includes(role);

  push('',kind==='staff'?'Today':'Overview');
  push('records','Browse records');
  if(management||staff)push('properties',staff?'Clients & properties':'Properties');
  if(kind==='property-manager')push('outsourcing','Outsourced services');
  if(management)push('portfolio',kind==='landlord'?'Inspection plans':'Portfolio operations');
  if(['strata-manager','building','council'].includes(kind)||staffNonInspector)
    push('schemes',kind==='building'?'My building':'Schemes & buildings');
  if(customer||staff){
    push('bookings',staff?'Schedule':'Bookings');
    push('booking-changes','Booking changes');
    push('work-orders','Work orders');
  }
  if(management||kind==='tenant'||staffNonInspector)
    push('tenancies',kind==='tenant'?'My tenancy & forms':'Tenancies & forms');
  if(kind!=='council')push('requests',['tenant','building'].includes(kind)?'My requests':'Requests');
  if(staffManager){
    push('wa-form-queue','WA residential forms');
    push('bond-review-queue','WA bond operations');
  }
  if(kind==='tenant')push('inspections','Inspections');
  push('reports',staff?'Reports':'Issued reports');
  push('documents','Documents & reports');
  if(customer||staffManager)push('document-operations','Document preparation');
  if(customer)push('service-agreements','Service agreements');
  if(staffManager){
    push('release-readiness','Release acceptance');
    push('pricing-administration','Service price approvals');
    push('legal-administration','Legal versions');
    push('agency-administration','Agency contracts');
    push('v2-business','Business agreements');
    push('maintenance-delivery','Maintenance delivery');
    push('asset-compliance','Assets & compliance');
    push('market-packs','Specialist market packs');
    push('enterprise-intelligence','Portfolio intelligence');
  }
  if(customer||kind==='council'||staffNonInspector)
    push('finance',kind==='council'?'Council decisions':'Finance');
  if((customer&&owner)||staffManager)push('billing','Billing & reconciliation');
  if((management&&owner)||staffManager)push('contractor-payments','Contractor payments');
  if(customer||kind==='council'||staffNonInspector)push('reporting','Operational reporting');
  if(customer&&owner)push('team','Team & access');
  if(staffNonInspector){
    push('administration','Operations administration');
    push('services','Service catalogue');
  }
  if(staffManager){
    push('enquiries','Marketing enquiries');
    push('leasing','Property leasing');
    push('open-home-checkins','Open home attendance');
    push('rental-applications','Rental applications');
    push('guest-orders','One-off requests');
    push('v4-service-requests','Service requests');
    push('integrations','Integrations');
  }
  if(restrictedEnabled&&(kind==='tenant'||staff))push('confidential','Confidential assistance');
  if((kind==='property-manager'&&owner)||staffManager)push('owner-invitations','Owner invitations');
  if(['commercial','property-manager'].includes(kind)||staffManager)push('commercial-leases','Commercial leases');
  if(['strata-manager','building','council'].includes(kind)||staffManager)push('facilities','Building operations');
  if(kind==='strata-manager'||staffManager)push('building-communications','Notice drafts');
  if(kind==='building-manager'){
    items.splice(0,items.length);
    push('','Overview');push('facilities','Building operations');
    push('building-communications','Notice drafts');push('documents','Authorised reports');
  }
  const primaryPaths=new Set(PRIMARY[kind]??['','requests','documents']);
  const primary=items.filter(x=>primaryPaths.has(x.path));
  const other=items.filter(x=>!primaryPaths.has(x.path));
  const seen=new Set<string>();
  const groups=GROUPS.map(g=>({
    id:g.id,label:g.label,
    links:other.filter(x=>g.paths.includes(x.path)&&!seen.has(x.path)).map(x=>{
      seen.add(x.path);return x;
    }),
  })).filter(g=>g.links.length>0);
  const remainder=other.filter(x=>!seen.has(x.path));
  if(remainder.length)groups.push({id:'other',label:'Other tools',links:remainder});
  return {primary,groups,all:items};
}
export function isPortalRoute(pathname:string,href:string,path:string){
  const target=href+(path?'/'+path:'');
  return pathname===target||(Boolean(path)&&pathname.startsWith(target+'/'));
}
export function portalLocation(nav:PortalNavigation,pathname:string,href:string){
  // Longest matching deep-link wins, so the main heading stays meaningful.
  const matches=nav.all.filter(x=>isPortalRoute(pathname,href,x.path));
  return matches.sort((a,b)=>b.path.length-a.path.length)[0]?.label??'Workspace';
}
