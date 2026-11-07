import { z } from 'zod';
/** Human approval is distinct from a typed authority reference or verified mailbox. */
export const rentalApprovalInput=z.object({
 version:z.number().int().positive(),
 authorityAttestation:z.string().trim().min(30).max(1500),
 authorityDocumentReference:z.string().trim().min(6).max(240),
 privacyNoticeVersion:z.string().trim().min(3).max(80),
 confirmAuthority:z.literal(true),
 confirmNotice:z.literal(true),
 confirmRecipient:z.literal(true)
});
export const rentalOutcomeInput=z.object({
 version:z.number().int().positive(),
 outcome:z.enum(['successful','unsuccessful']),
 authorityReference:z.string().trim().min(6).max(180),
 note:z.string().trim().min(12).max(1200),
 notifyApplicants:z.literal(true)
});
/** Manual reference contact log; never automated tenancy decisions. */
export const rentalReferenceCheckInput=z.object({
 applicantId:z.string().trim().min(5).max(100),
 target:z.enum(['previous_lessor','employer','personal_1','personal_2']),
 outcome:z.enum(['contact_attempted','confirmed','not_confirmed','unable_to_contact','not_applicable']),
 method:z.enum(['phone','email','other','not_contacted']),
 evidenceReference:z.string().trim().max(180).default(''),
 note:z.string().trim().min(12).max(1200),
}).superRefine((d,ctx)=>{
 if(d.outcome==='not_applicable'&&d.method!=='not_contacted')ctx.addIssue({code:'custom',path:['method'],message:'An inapplicable reference is not contacted.'});
 if(d.outcome!=='not_applicable'&&d.method==='not_contacted')ctx.addIssue({code:'custom',path:['method'],message:'Specify how contact was attempted.'});
 if(['confirmed','not_confirmed'].includes(d.outcome)&&d.evidenceReference.length<6)ctx.addIssue({code:'custom',path:['evidenceReference'],message:'Record an internal evidence reference for the verification outcome.'});
});
/** Explicit per-client CC routing. Never copy other landlords' applications into the ProInspect mailbox. */
export const LIGHTHOUSE_RENTAL_CLIENT_ID='cli_lighthouse_property_group_pty_ltd';
export const LIGHTHOUSE_RENTAL_CC='info@proinspect.systems';
export function rentalApplicationCc(instructingClientId:string):string|null{
 return instructingClientId===LIGHTHOUSE_RENTAL_CLIENT_ID?LIGHTHOUSE_RENTAL_CC:null;
}
export function checkedHttpsEndpoint(value:string|undefined,allowedHost?:string):URL|null{
 if(!value)return null;
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.hash)return null;
  if(allowedHost&&url.hostname!==allowedHost)return null;
  return url;
 }catch{return null;}
}
export function nextRetry(attempt:number,from=Date.now()):string{
 return new Date(from+Math.min(60,2**Math.min(attempt,8))*60000).toISOString();
}
