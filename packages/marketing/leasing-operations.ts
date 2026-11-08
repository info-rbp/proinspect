/**
 * Leasing operations helpers. These are display/conversion utilities, not
 * substitutes for server-side authority or release approval.
 * Western Australia currently uses AWST (UTC+08:00) year round.
 */
export function perthLocalToUtc(value:string):string {
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
  throw new Error('Enter a valid Perth date and time.');
 const parsed=new Date(value+'+08:00');
 if(!Number.isFinite(parsed.getTime())||perthUtcToLocal(parsed.toISOString())!==value)
  throw new Error('Enter a valid Perth date and time.');
 return parsed.toISOString();
}
export function perthUtcToLocal(value:string):string {
 const timestamp=new Date(value).getTime();
 if(!Number.isFinite(timestamp))throw new Error('Invalid inspection date.');
 return new Date(timestamp+8*60*60000).toISOString().slice(0,16);
}
export function futureInspectionWindow(startsAt:string,endsAt:string,clock=Date.now()):boolean {
 const start=Date.parse(startsAt),end=Date.parse(endsAt);
 return Number.isFinite(start)&&Number.isFinite(end)&&start>clock&&end>start;
}
export type ApplicationReadinessInput={
 listingKind:string;listingStatus:string;applicationMode:string;authorityReference?:string|null;
 recipientVerifiedAt?:string|null;approvalState?:string|null;
 noticeMode?:string|null;noticeCount:number;retentionConfigured:boolean;
 scannerConfigured:boolean;handoffConfigured:boolean;intakeReleaseApproved:boolean;
 scannerReleaseApproved:boolean;handoffReleaseApproved:boolean;
};
export type ApplicationReadinessCheck={key:string;label:string;passed:boolean;nextAction:string};
export function residentialApplicationReadiness(input:ApplicationReadinessInput){
 const checks:ApplicationReadinessCheck[]=[
  {key:'published',label:'Published residential listing',passed:input.listingStatus==='published',nextAction:'Approve the advertisement and publish the property.'},
  {key:'mode',label:'ProInspect-hosted application selected',passed:input.applicationMode==='proinspect',nextAction:'Record the authorised application method; an agency link takes precedence.'},
  {key:'authority',label:'Written application-processing instruction referenced',passed:Boolean(input.authorityReference?.trim()),nextAction:'Obtain the responsible party\'s written authority and record its reference.'},
  {key:'recipient',label:'Recipient inbox verified',passed:Boolean(input.recipientVerifiedAt),nextAction:'Send the recipient a single-use verification challenge.'},
  {key:'approval',label:'Property-specific administrator approval',passed:input.approvalState==='approved',nextAction:'Complete the documented authority, privacy and notice review.'},
  {key:'notice',label:'Tenancy database notice arrangement reviewed',passed:input.noticeMode==='not_used'||(input.noticeMode==='configured'&&input.noticeCount>0),nextAction:'Confirm whether databases are used and record applicable written notice details.'},
  {key:'retention',label:'Approved retention windows configured',passed:input.retentionConfigured,nextAction:'Set all three reviewed draft, submitted and withdrawn retention periods.'},
  {key:'scanner',label:'Private malware scanning transport configured',passed:input.scannerConfigured,nextAction:'Provide an approved private scanning endpoint, allowlisted host and separate callback/outbound secrets.'},
  {key:'scannerRelease',label:'Malware scanner release independently approved',passed:input.scannerReleaseApproved,nextAction:'Record provider testing and independent build-specific scanner release approval.'},
  {key:'handoff',label:'Secure agency application handoff configured',passed:input.handoffConfigured,nextAction:'Deploy the approved Apps Script receiver with recipient allowlists and signed acknowledgements.'},
  {key:'handoffRelease',label:'Handoff release independently approved',passed:input.handoffReleaseApproved,nextAction:'Verify synthetic recipient/CC delivery and independent build-specific approval.'},
  {key:'intakeRelease',label:'Rental application intake independently released',passed:input.intakeReleaseApproved,nextAction:'Pass hosted acceptance and obtain build-specific independent release approval.'}
 ];
 return {checks,technicalReady:checks.every(x=>x.passed),
  notice:'These are configuration and recorded-approval indicators only. They are not proof of lawful authority, actual inbox delivery, or independently observed end-to-end acceptance.'};
}
