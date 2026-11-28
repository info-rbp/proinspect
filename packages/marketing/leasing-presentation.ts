import { leasingPropertyType, leasingPropertyTypeLabel } from './leasing-property-types.ts';

/** The existing seeded PR115 browser sample is not a genuine rental.
 * Match a specific known fixture, never infer status from a title or address. */
export const LEASING_DEMO_ID='lst_pr115_demo';
export function isLeasingDemoListing(id:unknown):boolean { return id===LEASING_DEMO_ID; }
export function isLeasingDemoSlug(kind:unknown,slug:unknown):boolean {return kind==='residential'&&slug==='residential-browser-test';}
export function leasingResultsUrl(type:unknown,q:unknown):string {
  const params=new URLSearchParams();
  const selected=leasingPropertyType(type);
  if(selected)params.set('type',selected);
  if(typeof q==='string'&&q.trim())params.set('q',q.trim().slice(0,240));
  return '/leasing'+(params.size?'?'+params.toString():'')+'#available-properties';
}
export function leasingSearchSuffix(type:unknown,q:unknown):string {
  const url=leasingResultsUrl(type,q);
  return url.slice('/leasing'.length,url.indexOf('#'))||'?type=';
}
export function leasingDate(value:unknown):string|null {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const date=new Date(value+'T00:00:00Z');
  if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==value)return null;
  return new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(date);
}
export function inspectionDate(value:unknown):string|null {
  if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return null;
  return new Intl.DateTimeFormat('en-AU',{weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'Australia/Perth'}).format(new Date(value))+' AWST';
}
export function listingFacts(p:{kind?:unknown;bedrooms?:unknown;bathrooms?:unknown;parking?:unknown;area_sqm?:unknown}):{label:string;value:string}[] {
  const out:{label:string;value:string}[]=[];
  const n=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
  if(p.kind==='residential'||p.kind==='co-living'){
    if(n(p.bedrooms))out.push({label:p.bedrooms===1?'Bedroom':'Bedrooms',value:String(p.bedrooms)});
    if(n(p.bathrooms))out.push({label:p.bathrooms===1?'Bathroom':'Bathrooms',value:String(p.bathrooms)});
  }
  if(n(p.parking))out.push({label:p.parking===1?'Car bay':'Car bays',value:String(p.parking)});
  if(n(p.area_sqm))out.push({label:'Floor area',value:p.area_sqm.toLocaleString('en-AU')+' m²'});
  return out;
}
export function listingTypeName(kind:unknown):string{return leasingPropertyTypeLabel(kind)??'Property';}
export function listingInspectionLabel(count:unknown,available:unknown,next:unknown):string {
  if(Number(count)<=0||!Number.isFinite(Number(count)))return 'No upcoming inspections advertised';
  if(Number(available)<=0)return 'Advertised inspections fully booked';
  const date=inspectionDate(next);
  return date?'Next available inspection: '+date:'Upcoming inspection available';
}
export function listingApplicationLabel(mode:unknown,external:boolean,verified:boolean|null):string{
  if(external)return 'External application provider';
  if(mode==='proinspect'&&verified===true)return 'Online applications open';
  if(mode==='proinspect'&&verified===null)return 'Check application availability';
  return 'Online applications not currently available';
}
