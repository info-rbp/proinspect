import type { Workspace, Property, Service } from './index';
export const CLIENT_AREAS=['residential','commercial','strata','co-living','construction','leasing','maintenance'] as const;
export type ClientArea=(typeof CLIENT_AREAS)[number];
export type ClientAreaStatus='available'|'setup_required'|'planned';
export interface ClientAreaLink {area:ClientArea;label:string;status:ClientAreaStatus;href:string|null;description:string}
export function resolveClientAreas(w:Workspace,properties:Property[],schemes:unknown[],interests:readonly string[],services:Service[]):ClientAreaLink[] {
 if(!['landlord','property-manager','commercial','strata-manager'].includes(w.kind))return [];
 const sectorNames=new Set(properties.map(p=>p.sector));
 const selected=new Set(interests);
 const base=w.href;
 const defaults=new Set<ClientArea>();
 if(w.kind==='landlord'||(w.kind==='property-manager'&&sectorNames.has('residential')))defaults.add('residential');
 if(w.kind==='commercial'||(w.kind==='property-manager'&&sectorNames.has('commercial')))defaults.add('commercial');
 if(w.kind==='strata-manager')defaults.add('strata');
 // Only legacy accounts with no recorded preferences receive the earlier default service shortcuts.
 if(!interests.length){
  if(w.kind==='property-manager'||w.kind==='landlord'||w.kind==='commercial')defaults.add('leasing');
  defaults.add('maintenance');
 }
 return CLIENT_AREAS.filter(area=>selected.has(area)||defaults.has(area)).map((area):ClientAreaLink=>{
  const label=({'residential':'Residential','commercial':'Commercial','strata':'Strata','co-living':'Co-Living','construction':'Construction','leasing':'Leasing','maintenance':'Maintenance'} as Record<ClientArea,string>)[area];
  if(area==='co-living'||area==='construction')return {area,label,status:'planned',href:null,description:'In development; not bookable'};
  if(area==='leasing') {
   const permitted=properties.length>0 && ['landlord','property-manager','commercial'].includes(w.kind);
   return {area,label,status:permitted?'available':'setup_required',href:permitted?base+'/service-area/leasing':null,description:permitted?'Leasing overview and authorised activity':'Add an authorised property'};
  }
  if(area==='maintenance') {
   const permitted=properties.length>0||schemes.length>0;
   return {area,label,status:permitted?'available':'setup_required',href:permitted?base+'/requests':null,description:permitted?'Property requests and maintenance':'Add an authorised property or scheme'};
  }
  const permittedContext=area==='strata' ? w.kind==='strata-manager'&&schemes.length>0 :
    properties.some(p=>p.sector===area) && (area!=='commercial'||w.kind!=='landlord') &&
    (area!=='residential'||w.kind!=='commercial');
  const sector=area==='strata'?'strata-building':area;
  const hasPublished=services.some(s=>s.active===1 && s.sectors.includes(sector));
  const available=permittedContext&&hasPublished;
  return {area,label,status:available?'available':'setup_required',href:available?base+'/service-area/'+area:null,
   description:available?'Explore eligible services':'Property/sector verification or published services required'};
 });
}
