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
