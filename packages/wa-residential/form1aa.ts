/** Pre-activation field categories for the approved official WA Form 1AA.
 * The application must NOT reproduce or replace the prescribed document.
 * Field-to-PDF mapping and applicable clauses require independent approval.
 */
export type AgreementField={key:string;label:string;type:'text'|'date'|'number'|'textarea';required:boolean};
export type AgreementSection={id:string;label:string;fields:readonly AgreementField[]};
const f=(key:string,label:string,type:AgreementField['type']='text',required=false):AgreementField=>({key,label,type,required});
export const FORM_1AA_SECTIONS:readonly AgreementSection[]=[
{id:'parties',label:'Parties and electronic communications',fields:[
 f('lessorName','Legal lessor name','text',true),f('lessorAddress','Lessor address','text',true),f('lessorPhone','Lessor phone'),f('lessorEmail','Lessor email'),
 f('agentName','Managing agent name'),f('agentAddress','Managing agent address'),f('agentEmail','Agent email'),f('agentPhone','Agent phone'),
 f('tenantNames','All tenant legal names','textarea',true),f('tenantContactDetails','Individual tenant contacts','textarea',true),
 f('lessorElectronicNoticeConsent','Lessor electronic notice preference','text',true),f('tenantElectronicNoticeConsent','Each tenant electronic notice preference','textarea',true)]},
{id:'premises',label:'Premises, occupants and agreement term',fields:[
 f('premisesAddress','Complete premises address','text',true),f('premisesInclusions','Included car bays, storage and fixtures','textarea'),
 f('premisesExclusions','Excluded portions of premises','textarea'),f('maximumOccupants','Maximum permitted occupants','number',true),
 f('agreementType','Fixed or periodic','text',true),f('startsAt','Tenancy commencement','date',true),
 f('fixedTermEndsAt','Fixed-term end if applicable','date')]},
{id:'rent',label:'Rent and payment arrangements',fields:[
 f('rentAmount','Rent amount in Australian dollars','number',true),f('rentFrequency','Rent calculation period','text',true),
 f('paymentFrequency','Frequency of rent payments','text',true),f('rentFirstDueAt','First payment due date','date',true),
 f('rentPaymentMethod','Agreed lawful payment method','text',true),f('rentPaymentDetails','Payment instructions','textarea'),
 f('rentIncreaseMethod','Permitted rent increases','textarea'),f('incomeBasedRent','Income-linked rent if applicable','textarea')]},
{id:'bond',label:'Security and pet bond',fields:[
 f('bondAmount','Security bond in Australian dollars','number',true),f('petBondAmount','Permitted pet bond if applicable','number'),
 f('bondLodgementArrangements','Bond contributor and lodgement arrangements','textarea')]},
{id:'utilities',label:'Utilities, strata and permitted arrangements',fields:[
 f('waterUsageArrangement','Water charging arrangements','textarea'),
 f('separatelyMetered','Separately metered utilities'),f('electricityGasOtherCharges','Electricity, gas and other costs','textarea'),
 f('utilityProviderContactConsent','Utility provider contact permission'),f('strataBylawsProvided','Applicable strata by-laws and provision','textarea'),
 f('permittedPets','Existing permitted pets and conditions','textarea'),
 f('assignmentAndSubletting','Assignment and subletting','textarea'),f('fixturesAlterations','Fixtures and permitted alterations','textarea')]},
{id:'additional',label:'Additional terms and attachments',fields:[
 f('specialTerms','Additional terms requiring legal review','textarea'),
 f('attachmentsRegister','Attached documents and annexures','textarea'),
 f('reviewReference','Official version/field review reference','text',true)]},
] as const;
export const FORM_1AA_FIELDS=FORM_1AA_SECTIONS.flatMap(s=>[...s.fields]);
export function validateForm1AA(data:Record<string,unknown>,tenantCount:number):string[]{
 const errors=FORM_1AA_FIELDS.filter(f=>f.required&&String(data[f.key]??'').trim()==='').map(f=>f.label);
 if(tenantCount<1)errors.push('At least one verified tenant signer');
 if(!['fixed','periodic'].includes(String(data.agreementType??'').toLowerCase()))errors.push('Fixed or periodic agreement type');
 if(String(data.agreementType).toLowerCase()==='fixed'&&!data.fixedTermEndsAt)errors.push('Fixed-term end');
 if(data.fixedTermEndsAt&&String(data.fixedTermEndsAt)<String(data.startsAt))errors.push('Fixed-term end must follow commencement');
 if(Number(data.rentAmount)<=0)errors.push('Positive rent');
 if(Number(data.maximumOccupants)<tenantCount)errors.push('Maximum occupants covers all tenant signers');
 if(Number(data.bondAmount)<0||Number(data.petBondAmount??0)<0)errors.push('Nonnegative bond');
 if(!['yes','no'].includes(String(data.lessorElectronicNoticeConsent??'').toLowerCase()))errors.push('Lessor electronic notices consent');
 return errors;
}
