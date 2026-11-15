import { z } from 'zod';
export const COMMERCIAL_APPLICATION_VERSION='proinspect-commercial-application-v1';
export const commercialEditable=(status:string)=>['draft','invited','in_progress','ready','needs_information'].includes(status);
export const COMMERCIAL_STEPS=['property','entity','operations','financial','references','fitout','security','declarations','review'] as const;
export const ENTITY_TYPES=['individual','sole_trader','company','partnership','trust','corporate_trustee','association','other_overseas','joint'] as const;
export const COMMERCIAL_ROLES=['contact','director','partner','trustee_officer','signatory','guarantor'] as const;
const text=z.string().trim().max(1200),short=z.string().trim().max(240),id=z.string().regex(/^[a-zA-Z0-9_-]{3,100}$/);
const abn=z.string().regex(/^$|^\d{11}$/),acn=z.string().regex(/^\d{9}$/);
const base={id,legalName:short.min(2),address:text.min(5),abn:abn.default(''),tradingName:short.default(''),capacity:z.enum(['applicant','guarantor','trustee']).default('applicant'),signatories:z.array(id).min(1).max(20)};
export const commercialEntity=z.discriminatedUnion('entityType',[
 z.object({...base,entityType:z.literal('individual'),personId:id}),
 z.object({...base,entityType:z.literal('sole_trader'),personId:id}),
 z.object({...base,entityType:z.literal('company'),acn,directors:z.array(id).min(1).max(20)}),
 z.object({...base,entityType:z.literal('partnership'),partners:z.array(z.object({personId:id,share:short.min(1),authority:text.min(5)})).min(2).max(30)}),
 z.object({...base,entityType:z.literal('trust'),trustType:short.min(2),trusteeEntityId:id,deedDescription:text.min(5)}),
 z.object({...base,entityType:z.literal('corporate_trustee'),acn,directors:z.array(id).min(1).max(20),trustForId:id,capacityWording:text.min(10)}),
 z.object({...base,entityType:z.literal('association'),registrationBody:short.min(2),registrationNumber:short.min(2),officeBearers:z.array(id).min(1).max(20)}),
 z.object({...base,entityType:z.literal('other_overseas'),country:short.min(2),registrationBody:short.min(2),registrationNumber:short.min(2),australianPresence:text.min(5),representativeId:id}),
 z.object({...base,entityType:z.literal('joint'),partyIds:z.array(id).min(2).max(20),liabilityArrangement:text.min(10)}),
]);
export type CommercialEntity=z.infer<typeof commercialEntity>;
export const entitySection=z.object({version:z.literal(COMMERCIAL_APPLICATION_VERSION),entities:z.array(commercialEntity).min(1).max(30),
 roles:z.array(z.object({personId:id,entityId:id,role:z.enum(COMMERCIAL_ROLES),authorityEvidence:text.default('')})).min(1).max(100)});
export function validateEntityGraph(input:unknown,peopleIds:readonly string[]){
 const d=entitySection.parse(input),entities=new Map(d.entities.map(e=>[e.id,e]));
 if(!d.entities.some(e=>e.capacity==='applicant'))throw Error('At least one legal applicant is required');
 if(entities.size!==d.entities.length)throw Error('Duplicate entity');
 const people=new Set(peopleIds),seenRoles=new Set<string>();
 for(const role of d.roles){
  if(!people.has(role.personId)||!entities.has(role.entityId))throw Error('Unknown role owner');
  const key=[role.personId,role.entityId,role.role].join(':');if(seenRoles.has(key))throw Error('Duplicate role');seenRoles.add(key);
 }
 for(const e of d.entities){
  const ids=[...e.signatories,...('directors' in e?e.directors:[]),...('partners' in e?e.partners.map(p=>p.personId):[]),...('personId' in e?[e.personId]:[]),...('officeBearers' in e?e.officeBearers:[]),...('representativeId' in e?[e.representativeId]:[])];
  if(ids.some(p=>!people.has(p)))throw Error('Unknown person');
  if(e.signatories.some(p=>!d.roles.some(r=>r.personId===p&&r.entityId===e.id&&r.role==='signatory')))throw Error('Signatory role required');
  if('directors' in e&&e.directors.some(p=>!d.roles.some(r=>r.personId===p&&r.entityId===e.id&&r.role==='director')))throw Error('Director role required');
  if('partners' in e&&e.partners.some(p=>!d.roles.some(r=>r.personId===p.personId&&r.entityId===e.id&&r.role==='partner')))throw Error('Partner role required');
  if(e.entityType==='trust'){
   const trustee=entities.get(e.trusteeEntityId);if(!trustee||!['individual','sole_trader','company','corporate_trustee'].includes(trustee.entityType))throw Error('Legal trustee required');
   if(trustee.entityType==='corporate_trustee'&&trustee.trustForId!==e.id)throw Error('Corporate trustee relationship mismatch');
  }
  if(e.entityType==='corporate_trustee'&&entities.get(e.trustForId)?.entityType!=='trust')throw Error('Trust relationship required');
  if(e.entityType==='joint'&&e.partyIds.some(p=>entities.get(p)?.capacity!=='applicant'))throw Error('Joint parties must be legal applicants');
 }
 const visiting=new Set<string>(),visited=new Set<string>();
 function visit(key:string){if(visiting.has(key))throw Error('Cyclic entity graph');if(visited.has(key))return;visiting.add(key);
  const e=entities.get(key);if(!e)throw Error('Unknown related entity');
  for(const child of e.entityType==='trust'?[e.trusteeEntityId]:e.entityType==='joint'?e.partyIds:[])visit(child);
  visiting.delete(key);visited.add(key);}
 for(const e of d.entities)visit(e.id);
 return d;
}
const reference=z.object({name:short.min(2),organisation:short.default(''),contact:short.min(5),relationship:short.min(2)});
export const sectionSchemas={
 operations:z.object({businessDescription:text.min(15),proposedUse:text.min(5),tradingHours:short.min(2),staffCount:z.number().int().min(0).max(100000),customerTraffic:short.min(2),proposedCommencement:z.iso.date(),licencesAndPermits:text.min(3)}),
 financial:z.object({historyYears:z.number().int().min(0).max(2),basQuarters:z.number().int().min(0).max(4),unavailableReason:text.default(''),alternativeEvidence:text.default('')}).refine(d=>(d.historyYears===2&&d.basQuarters===4)||(d.unavailableReason.length>=10&&d.alternativeEvidence.length>=10),'Explain missing history and alternative evidence for manual review'),
 references:z.object({previousLandlord:reference.nullable(),noLandlordReason:text.default(''),tradeReferences:z.array(reference).min(2).max(10),accountant:reference.nullable(),
  accountantPermission:z.object({granted:z.literal(true),scope:text.min(15),expiresAt:z.iso.datetime()}).nullable()})
  .refine(d=>d.previousLandlord||d.noLandlordReason.length>=5,'Provide previous landlord or explanation')
  .refine(d=>!d.accountantPermission||(d.accountant&&Date.parse(d.accountantPermission.expiresAt)>Date.now()),'Accountant permission must be scoped and current'),
 fitout:z.object({alterations:z.boolean(),description:text.default(''),approvalNeeds:text.default(''),signage:text.default(''),equipment:text.default(''),utilities:text.min(2),maintenanceResponsibilities:text.min(2),parkingStorage:text.min(2)})
  .refine(d=>!d.alterations||(d.description.length>=10&&d.approvalNeeds.length>=5),'Describe proposed alterations and approvals'),
 security:z.object({instrument:z.enum(['none','cash','bank_guarantee','other']),details:text.default(''),guarantorPersonIds:z.array(id).max(20),guarantorEntityIds:z.array(id).max(20)}),
} as const;
export type CommercialShared={entity?:z.infer<typeof entitySection>;operations?:z.infer<typeof sectionSchemas.operations>;financial?:z.infer<typeof sectionSchemas.financial>;references?:z.infer<typeof sectionSchemas.references>;fitout?:z.infer<typeof sectionSchemas.fitout>;security?:z.infer<typeof sectionSchemas.security>};
export const personDetails=z.object({name:short.min(2),email:z.email(),telephone:short.min(6),address:text.min(5),identityType:z.enum(['Driver licence','Passport','Other','Not yet available']),identityReference:short.default(''),authorityStatement:text.min(15)});
export const evidenceCategories=['financial_year','bas_quarter','registry','trust_authority','partnership_authority','association_authority','identity','guarantee','fitout_plan','alternative','other'] as const;
export type Evidence={id:string;person_id:string;entity_id:string|null;category:string;period_label:string;scan_status:string;review_status:string};
export function commercialReadiness(shared:CommercialShared,peopleIds:readonly string[],evidence:Evidence[],guarantee:'required'|'optional'|'none'){
 const issues:string[]=[],manual:string[]=[];
 try{validateEntityGraph(shared.entity,peopleIds);}catch(e){issues.push(e instanceof Error?e.message:'Complete legal entities');}
 for(const [key,schema] of Object.entries(sectionSchemas))if(!schema.safeParse(shared[key as keyof CommercialShared]).success)issues.push('Complete '+key);
 if(evidence.some(d=>d.scan_status!=='clean'||d.review_status!=='released'))issues.push('Documents await clean scanning and authorised review');
 for(const e of shared.entity?.entities??[]){
  const docs=evidence.filter(d=>d.entity_id===e.id);
  const category=e.entityType==='trust'?'trust_authority':e.entityType==='partnership'?'partnership_authority':e.entityType==='association'?'association_authority':['company','corporate_trustee'].includes(e.entityType)?'registry':null;
  if(category&&!docs.some(d=>d.category===category))issues.push('Authority evidence required for '+e.legalName);
  if(['other_overseas','joint'].includes(e.entityType))manual.push('Legal structure review: '+e.legalName);
  if(e.capacity==='applicant'&&shared.financial){
   if(docs.filter(d=>d.category==='financial_year').length<shared.financial.historyYears)issues.push('Financial statements required for '+e.legalName);
   if(docs.filter(d=>d.category==='bas_quarter').length<shared.financial.basQuarters)issues.push('BAS quarters required for '+e.legalName);
  }
 }
 if(shared.financial&&(shared.financial.historyYears<2||shared.financial.basQuarters<4)){
  manual.push('Missing/new entity financial history and alternate evidence require review');
  if(!evidence.some(d=>d.category==='alternative'))issues.push('Add the described alternative evidence');
 }
 if(shared.fitout?.alterations&&!evidence.some(d=>d.category==='fitout_plan'))issues.push('Fit-out plan required');
 const security=shared.security;
 if(guarantee==='required'&&!security?.guarantorPersonIds.length&&!security?.guarantorEntityIds.length)issues.push('Configured guarantee requires a guarantor');
 if(guarantee==='none'&&(security?.guarantorPersonIds.length||security?.guarantorEntityIds.length))issues.push('Guarantee is not applicable to this listing');
 for(const p of security?.guarantorPersonIds??[])if(!peopleIds.includes(p)||!shared.entity?.roles.some(r=>r.personId===p&&r.role==='guarantor'))issues.push('Guarantor must have a private person profile and role');
 for(const e of security?.guarantorEntityIds??[])if(!shared.entity?.entities.some(x=>x.id===e&&x.capacity==='guarantor'))issues.push('Guarantor entity required');
 return {ready:issues.length===0,issues:[...new Set(issues)],manualReview:[...new Set(manual)]};
}
export const commercialOffer=z.object({id,version:short.min(1),expiresAt:z.iso.datetime(),authorisationReference:text.min(8),
 rent:z.object({amountCents:z.number().int().positive(),period:z.enum(['week','month','year']),currency:z.literal('AUD'),taxTreatment:z.enum(['ex_gst','incl_gst','not_applicable'])}),
 term:text.min(5),options:text.default(''),commencement:z.iso.date(),paymentSchedule:text.min(5),rentReview:text.min(5),
 incentives:z.array(z.object({kind:short.min(2),from:z.iso.date().optional(),to:z.iso.date().optional(),description:text.min(5),conditions:text.default(''),status:z.enum(['proposed','agreed','completed'])})).max(30),
 outgoings:z.object({basis:text.min(10),paymentSchedule:text.min(3),responsibility:text.min(5)}),
 security:z.object({instrument:text.min(3),amountCents:z.number().int().min(0),taxTreatment:text.min(3),conditions:text.min(3)}),
 leasingCosts:z.object({description:text.min(3),responsibleParty:text.min(3),taxTreatment:text.min(3)}),
 permittedPersonIds:z.array(id).min(1).max(30),nonBinding:z.literal(true)});
