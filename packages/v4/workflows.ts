import type { V4Service } from './catalogue';

export type Field = {key: string; label: string; kind: 'text'|'date'|'number'|'textarea'|'select'; required?: boolean; options?: string[]};
export type V4Price = {kind: 'listed'|'quantity'|'minimum'|'monthly'|'complimentary'|'quote'|'from'|'base_plus';
  totalExGstCents: number|null; gstCents: number|null; unit: string; note: string};

const generic: Field[] = [
  {key:'requestPurpose',label:'What would you like ProInspect to do?',kind:'textarea',required:true},
  {key:'authorityBasis',label:'How are you authorised to instruct this service?',kind:'select',required:true,options:['Property owner','Authorised property manager','Authorised corporate representative','Tenant / occupier (requires review)','Other (requires review)']},
];
const site: Field[] = [
  {key:'propertyDescription',label:'Property type / size and relevant areas',kind:'text',required:true},
  {key:'occupancyStatus',label:'Occupancy / tenancy status',kind:'select',required:true,options:['Vacant','Occupied','Unknown / confirm with Staff']},
  {key:'accessArrangements',label:'Access method and any lawful notice arrangements',kind:'textarea',required:true},
  {key:'preferredDate',label:'Preferred attendance date (request only)',kind:'date'},
];
const lease: Field[] = [
  {key:'tenancyOrLeaseReference',label:'Existing tenancy / lease reference, if available',kind:'text'},
  {key:'parties',label:'Relevant lessor and tenant/occupier parties',kind:'textarea',required:true},
  {key:'commencementDate',label:'Commencement or renewal date (if applicable)',kind:'date'},
  {key:'termsInstructions',label:'Approved lease terms and instructions (do not upload sensitive evidence here)',kind:'textarea',required:true},
];
const notice: Field[] = [
  {key:'tenancyOrLeaseReference',label:'Tenancy / lease reference',kind:'text',required:true},
  {key:'grounds',label:'Instructions, event dates and supporting facts (Staff review required)',kind:'textarea',required:true},
  {key:'proposedDate',label:'Proposed effective / service date (not legally validated)',kind:'date'},
];
const financial: Field[] = [
  {key:'financialPeriod',label:'Financial / reporting period',kind:'text',required:true},
  {key:'sourceRecords',label:'Available invoices, registers or records (describe; Staff will arrange secure upload)',kind:'textarea',required:true},
  {key:'approvalAuthority',label:'Who will approve the figures or allocations?',kind:'text'},
];
const docs: Field[] = [
  {key:'documentType',label:'Document or record required',kind:'text',required:true},
  {key:'existingDocuments',label:'Existing documentation and reference numbers',kind:'textarea'},
  {key:'intendedRecipients',label:'Intended recipients (subject to authority review)',kind:'textarea'},
];
const logistics: Field[] = [
  {key:'accessArrangements',label:'Property access / key arrangements',kind:'textarea',required:true},
  {key:'keyCount',label:'Number of keys / devices if applicable',kind:'number'},
  {key:'preferredDate',label:'Preferred date',kind:'date'},
];
const dates: Field[] = [
  {key:'sourceRecords',label:'Source records available (describe; Staff will arrange secure upload)',kind:'textarea',required:true},
  {key:'dateType',label:'Types of critical dates / reminders',kind:'text',required:true},
];
export function fieldsForService(service: V4Service): Field[] {
  const code=service.workflowCode;
  if(['INSPECT','FOLLOWUP','OPEN_HOME','MEDIA','HANDOVER','KEYS','URGENT'].includes(code))return [...generic,...site];
  if(code==='LEASE_AGREEMENT'||['LEASE_CASE','LEASE_DOCUMENT'].includes(code))return [...generic,...lease];
  if(['NOTICE','BOND','GOODS','COURT'].includes(code))return [...generic,...notice];
  if(['OUTGOINGS','INVOICES','APPROVALS'].includes(code))return [...generic,...financial];
  if(['LEASE_DATA','DATE_REGISTER','COMPLIANCE','REGISTER'].includes(code))return [...generic,...dates];
  if(['DOC_PACK','DOC_COLLECTION','PROPERTY_SETUP'].includes(code))return [...generic,...docs];
  if(['ACCESS_ADMIN','ACCESS_REGISTER','KEY_STORAGE'].includes(code))return [...generic,...logistics];
  if(['REPORT','RECURRING_REPORT','PLAN'].includes(code))return [...generic,...financial];
  return [...generic, {key:'supportingInformation',label:'Relevant property or service records available',kind:'textarea'}];
}
export function allowedForGuest(service:V4Service):boolean {
  // Restricted family-violence and court pathways are not generic public checkout products.
  if(['CONFIDENTIAL','COURT'].includes(service.workflowCode))return false;
  return !/Restricted intake/i.test(service.guestAvailability);
}
export function requestableStatus(service:V4Service): 'staff_review'|'quotation'|'restricted' {
  if(!allowedForGuest(service))return 'restricted';
  if(['POA','From / quote','Base + variable'].includes(service.priceRule))return 'quotation';
  return 'staff_review'; // No fee schedule row alone authorises charging, legal issue or instant confirmation.
}
export function v4Price(service:V4Service, quantity=1):V4Price {
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>500)throw new RangeError('Quantity must be between 1 and 500');
  const kind=service.priceRule;
  const base=service.baseCents;
  if(kind==='Complimentary')return {kind:'complimentary',totalExGstCents:0,gstCents:0,unit:service.chargingUnit,note:'Complimentary only where the service is eligible; approval required.'};
  if(kind==='POA')return {kind:'quote',totalExGstCents:null,gstCents:null,unit:service.chargingUnit,note:'Price on application; Staff must confirm the scope and final price.'};
  if(kind==='From / quote')return {kind:'from',totalExGstCents:null,gstCents:null,unit:service.chargingUnit,note:`Starting from ${base===null?'an approved amount':formatAUD(base)} ex GST; final quotation required.`};
  if(kind==='Base + variable')return {kind:'base_plus',totalExGstCents:null,gstCents:null,unit:service.chargingUnit,note:`Base ${base===null?'fee to be confirmed':formatAUD(base)} ex GST, plus separately approved charges.`};
  if(base===null)throw new Error('No approved source price');
  const amount=kind==='Quantity'||kind==='Quantity + minimum'||kind==='Recurring unit'?base*quantity:base;
  const total=Math.max(amount,kind==='Quantity + minimum'?(service.minimumCents??0):0);
  if(!Number.isSafeInteger(total))throw new RangeError('Invalid price');
  return {kind:kind==='Recurring unit'?'monthly':kind==='Quantity'?'quantity':kind==='Quantity + minimum'?'minimum':'listed',
    totalExGstCents:total,gstCents:Math.round(total*0.1),unit:service.chargingUnit,
    note:kind==='Recurring unit'?'Per applicable billing period; not an automatically activated subscription.':'Source PAYG rate; final scope, tax and payment terms require approval.'};
}
export function formatAUD(cents:number):string{return new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(cents/100);}
export function validateAnswers(service:V4Service,answers:Record<string,unknown>):Record<string,string> {
  const fields=fieldsForService(service),out:Record<string,string>={};
  if(Object.keys(answers).length>30)throw new Error('Too many answer fields');
  for(const field of fields){
    const raw=answers[field.key];
    if(raw===undefined||raw===null||String(raw).trim()===''){
      if(field.required)throw new Error('Required field: '+field.label);
      continue;
    }
    if(typeof raw!=='string'&&typeof raw!=='number')throw new Error('Invalid field: '+field.label);
    const value=String(raw).trim();
    if(value.length>2000)throw new Error('Field too long: '+field.label);
    if(field.kind==='number'&&(!/^\d+$/.test(value)||Number(value)>500))throw new Error('Invalid quantity');
    if(field.kind==='date'&&!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Invalid date');
    if(field.options&&!field.options.includes(value))throw new Error('Invalid choice: '+field.label);
    out[field.key]=value;
  }
  if(Object.keys(answers).some(k=>!fields.some(f=>f.key===k)))throw new Error('Unexpected service fields');
  return out;
}
