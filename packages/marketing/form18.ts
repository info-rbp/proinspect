import { z } from 'zod';

/** Form 18 (WA) field groups, reflowed for small screens. Not a tenancy agreement. */
export const FORM18_STEPS = [
 {id:'identity', title:'Your details', help:'Identity and contact details from Form 18.'},
 {id:'rental', title:'Rental history', help:'Your previous rental arrangements, if any.'},
 {id:'employment', title:'Employment and income', help:'Employment and income information requested in Form 18.'},
 {id:'references', title:'References and contacts', help:'Personal references, next of kin and an emergency contact.'},
 {id:'documents', title:'Supporting documents', help:'Attach documents requested for this application. You can remove a file before submission.'},
 {id:'review', title:'Review and declare', help:'Check your answers, review the notices and complete your declaration.'},
] as const;
export type Form18Step=(typeof FORM18_STEPS)[number]['id'];
export type AnswerStep=Exclude<Form18Step,'documents'|'review'>;
export type Form18Answers=Record<string,Record<string,string>>;
export type Form18Field={
 key:string; label:string; kind?:'text'|'email'|'tel'|'date'|'number'|'textarea'|'select';
 options?:readonly string[]; required?:boolean; hint?:string; section?:string;
};
export const FIELDS:Record<AnswerStep,Form18Field[]>={
 identity:[
  {key:'fullName',label:'Full legal name',required:true},
  {key:'dateOfBirth',label:'Date of birth',kind:'date',required:true},
  {key:'mobile',label:'Mobile telephone',kind:'tel',required:true},
  {key:'homePhone',label:'Home telephone',kind:'tel'},
  {key:'workPhone',label:'Work telephone',kind:'tel'},
  {key:'currentAddress',label:'Current residential address',required:true,section:'Where you live now'},
  {key:'idType',label:'Identification type',kind:'select',required:true,options:['Driver licence','Passport','Birth certificate','Other','Not yet available'],hint:'Do not enter an identity document number here. Supporting files are uploaded separately.'},
 ],
 rental:[
  {key:'hasRentalHistory',label:'Have you previously rented?',kind:'select',required:true,options:['Yes','No']},
  {key:'previousAddress',label:'Previous rental address',section:'Previous rental history'},
  {key:'rentAmount',label:'Rent paid (AUD)',kind:'number'},
  {key:'rentPeriod',label:'Rent payment frequency',kind:'select',options:['Week','Fortnight','Month']},
  {key:'rentPaidTo',label:'Previous property manager or lessor'},
  {key:'rentPaidToPhone',label:'Manager or lessor telephone',kind:'tel'},
  {key:'lessorAddress',label:'Manager or lessor address'},
  {key:'rentedFrom',label:'Rented from',kind:'date'},
  {key:'rentedTo',label:'Rented until',kind:'date'},
  {key:'reasonLeaving',label:'Reason for leaving',kind:'textarea'},
 ],
 employment:[
  {key:'employmentType',label:'Current employment situation',kind:'select',required:true,options:['Employed','Self-employed','Student','Other income','Not currently employed']},
  {key:'occupation',label:'Occupation',section:'Employment information'},
  {key:'employer',label:'Employer or business name'},
  {key:'employerAddress',label:'Employer address'},
  {key:'employedFrom',label:'Employed from',kind:'date'},
  {key:'employedTo',label:'Employed until (if applicable)',kind:'date'},
  {key:'employerContact',label:'Employment reference contact'},
  {key:'employerPhone',label:'Employment reference telephone',kind:'tel'},
  {key:'netIncome',label:'Net income (AUD)',kind:'number',section:'Income information'},
  {key:'netIncomePeriod',label:'Net income frequency',kind:'select',options:['Week','Fortnight','Month']},
  {key:'otherIncome',label:'Income from other sources (AUD)',kind:'number'},
  {key:'otherIncomePeriod',label:'Other income frequency',kind:'select',options:['Week','Fortnight','Month']},
  {key:'incomeExplanation',label:'Further information about your income (optional)',kind:'textarea'},
 ],
 references:[
  {key:'reference1Name',label:'Reference 1 — name',section:'Personal reference 1'},
  {key:'reference1Relationship',label:'Relationship to applicant'},
  {key:'reference1Phone',label:'Telephone',kind:'tel'},
  {key:'reference1Address',label:'Address'},
  {key:'reference2Name',label:'Reference 2 — name',section:'Personal reference 2'},
  {key:'reference2Relationship',label:'Relationship to applicant'},
  {key:'reference2Phone',label:'Telephone',kind:'tel'},
  {key:'reference2Address',label:'Address'},
  {key:'nextKinName',label:'Next of kin — name',section:'Next of kin'},
  {key:'nextKinRelationship',label:'Relationship to applicant'},
  {key:'nextKinHomePhone',label:'Home telephone',kind:'tel'},
  {key:'nextKinWorkPhone',label:'Work telephone',kind:'tel'},
  {key:'nextKinMobile',label:'Mobile telephone',kind:'tel'},
  {key:'nextKinAddress',label:'Address'},
  {key:'emergencyName',label:'Emergency contact — name',section:'Emergency contact'},
  {key:'emergencyRelationship',label:'Relationship to applicant'},
  {key:'emergencyHomePhone',label:'Home telephone',kind:'tel'},
  {key:'emergencyWorkPhone',label:'Work telephone',kind:'tel'},
  {key:'emergencyMobile',label:'Mobile telephone',kind:'tel'},
  {key:'emergencyAddress',label:'Address'},
 ]
};
export const ANSWER_STEPS:['identity','rental','employment','references']=['identity','rental','employment','references'];
export const FORM18_VERSION='form18-digital-2026-10';
export const APPLICATION_MODES=['unavailable','external','proinspect'] as const;
export type ApplicationMode=(typeof APPLICATION_MODES)[number];
export const noticeEntry=z.object({
 name:z.string().trim().min(2).max(160),
 operatorContact:z.string().trim().min(3).max(600),
 accessInstructions:z.string().trim().min(5).max(800),
});
export const applicationSettingsSchema=z.object({
 applicationMode:z.enum(APPLICATION_MODES),
 applicationUrl:z.string().trim().max(1000).optional().default(''),
 applicationAuthorityReference:z.string().trim().max(200).optional().default(''),
 applicationRecipientEmail:z.string().trim().email().max(254).or(z.literal('')).optional().default(''),
 tenancyDatabaseNoticeMode:z.enum(['unconfigured','not_used','configured']).default('unconfigured'),
 tenancyDatabaseNotices:z.array(noticeEntry).max(6).default([]),
}).superRefine((d,ctx)=>{
 if(d.applicationMode==='external'&&!safeUrl(d.applicationUrl))ctx.addIssue({code:'custom',message:'An approved HTTPS application link is required.',path:['applicationUrl']});
 if(d.applicationMode==='proinspect'){
  if(d.applicationUrl.trim())ctx.addIssue({code:'custom',message:'Remove the agency application URL before activating a ProInspect-hosted form.',path:['applicationUrl']});
  if(d.applicationAuthorityReference.length<5)ctx.addIssue({code:'custom',message:'Record the signed application-handling authority.',path:['applicationAuthorityReference']});
  if(!d.applicationRecipientEmail)ctx.addIssue({code:'custom',message:'Name an authorised recipient for applications.',path:['applicationRecipientEmail']});
  if(d.tenancyDatabaseNoticeMode==='unconfigured'||(d.tenancyDatabaseNoticeMode==='configured'&&!d.tenancyDatabaseNotices.length))
   ctx.addIssue({code:'custom',message:'Confirm the tenancy database notice arrangements.',path:['tenancyDatabaseNoticeMode']});
 }
});
function safeUrl(input:string){try{const url=new URL(input);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}}
export const startApplicationSchema=z.object({
 email:z.string().trim().email().max(254).transform(x=>x.toLowerCase()),
 name:z.string().trim().min(2).max(120),
 consent:z.literal(true),
});
export const inviteApplicantSchema=z.object({
 name:z.string().trim().min(2).max(120),
 email:z.string().trim().email().max(254).transform(x=>x.toLowerCase()),
});
export const documentCategorySchema=z.enum(['identity','income','rental_history','other']);
export function cleanSection(section:AnswerStep,raw:Record<string,unknown>){
 const values:Record<string,string>={};
 for(const field of FIELDS[section]){
  const value=raw[field.key];
  const cleaned=typeof value==='string'?value.trim():'';
  if(cleaned.length>700)throw Error('FIELD_TOO_LONG');
  if(field.required&&!cleaned)throw Error('FIELD_REQUIRED:'+field.label);
  if(field.options&&cleaned&&!field.options.includes(cleaned))throw Error('FIELD_INVALID:'+field.label);
  if(field.kind==='number'&&cleaned&&!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(cleaned))throw Error('FIELD_INVALID:'+field.label);
  if(field.kind==='date'&&cleaned&&(!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)||!Number.isFinite(Date.parse(cleaned))||new Date(cleaned).toISOString().slice(0,10)!==cleaned))throw Error('FIELD_INVALID:'+field.label);
  values[field.key]=cleaned;
 }
 if(section==='identity'){
  if(values.fullName.length<2||values.mobile.length<6||values.currentAddress.length<6)throw Error('IDENTITY_REQUIRED');
  if(values.dateOfBirth>new Date().toISOString().slice(0,10))throw Error('DATE_OF_BIRTH_INVALID');
 }
 if(section==='rental'&&values.hasRentalHistory==='Yes'&&(!values.previousAddress||!values.rentPaidTo))throw Error('RENTAL_HISTORY_INCOMPLETE');
 if(section==='employment'&&['Employed','Self-employed'].includes(values.employmentType)&&(!values.occupation||!values.employer))throw Error('EMPLOYMENT_INCOMPLETE');
 return values;
}
export function stepComplete(answers:Form18Answers,step:AnswerStep):boolean{
 try{cleanSection(step,answers[step]??{});return true;}catch{return false;}
}
export function allDetailsComplete(answers:Form18Answers){
 return ANSWER_STEPS.every(step=>stepComplete(answers,step));
}
export function initialAnswers(name:string,email:string):Form18Answers{
 return {identity:{fullName:name,email},rental:{},employment:{},references:{}};
}
export function maskedEmail(email:string){const [user,domain]=email.split('@');return user.slice(0,2)+'***@'+domain;}
