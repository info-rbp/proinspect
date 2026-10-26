/** ProInspect's isolated Docusign eSignature sandbox transport.
 * Only builds a draft envelope from a separately approved official mapping.
 * Does not send or legally execute documents, handle bond forms or accept unsigned PDFs.
 */
import {assertOfficialMapApproved,type OfficialForm1AAMap} from './form1aa-official-map.ts';
export type Signer={userId:string;name:string;email:string;role:'tenant'|'lessor'};
export type DocusignDraftConfig={baseUrl:string;accountId:string;accessToken:string;sandbox:boolean};
export type EnvelopeDraft={emailSubject:string;documents:{documentId:string;name:string;documentBase64:string}[];recipients:{signers:Array<{name:string;email:string;recipientId:string;routingOrder:string;tabs:{signHereTabs:{documentId:string;pageNumber:string;xPosition:string;yPosition:string}[]}}>} ;status:'created';customFields:{textCustomFields:{name:string;value:string;show:'false'}[]}};
function safeHost(config:DocusignDraftConfig){
 const u=new URL(config.baseUrl);
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('DOCUSIGN_INVALID_API_ORIGIN');
 if(config.sandbox&&u.hostname!=='demo.docusign.net')throw Error('DOCUSIGN_DEMO_HOST_REQUIRED');
 if(!config.sandbox&&u.hostname==='demo.docusign.net')throw Error('DOCUSIGN_PRODUCTION_HOST_REQUIRED');
 if(!/^[a-zA-Z0-9-]{3,64}$/.test(config.accountId))throw Error('DOCUSIGN_INVALID_ACCOUNT');
 return u.origin;
}
export function buildForm1AADraft({map,signers,sourcePdfBase64,sourceSha256,caseId}:{
 map:OfficialForm1AAMap;signers:Signer[];sourcePdfBase64:string;sourceSha256:string;caseId:string;
}):EnvelopeDraft{
 const tenants=signers.filter(s=>s.role==='tenant');
 const lessors=signers.filter(s=>s.role==='lessor');
 if(tenants.length<1||tenants.length>15||lessors.length!==1||new Set(signers.map(s=>s.userId)).size!==signers.length)
  throw Error('DOCUSIGN_SIGNERS_INVALID');
 if(signers.some(s=>!s.name.trim()||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email)))
  throw Error('DOCUSIGN_SIGNERS_UNVERIFIED');
 assertOfficialMapApproved(map,tenants.length);
 if(sourceSha256!==map.convertedPdfSha256||!/^[a-zA-Z0-9+/]+={0,2}$/.test(sourcePdfBase64)||sourcePdfBase64.length<100)
  throw Error('DOCUSIGN_SOURCE_PDF_MISMATCH');
 const parts=signers.map((s,i)=>{
  const coords=s.role==='tenant'?map.tenantSignaturePlacements[tenants.findIndex(x=>x.userId===s.userId)]:map.lessorSignaturePlacement!;
  return {name:s.name,email:s.email,recipientId:String(i+1),routingOrder:'1',tabs:{signHereTabs:[{
   documentId:'1',pageNumber:String(coords.page),xPosition:String(coords.x),yPosition:String(coords.y)}]}};
 });
 return {emailSubject:'ProInspect — WA Form 1AA tenancy agreement for review',
  documents:[{documentId:'1',name:'WA Form 1AA — officially reviewed.pdf',documentBase64:sourcePdfBase64}],
  recipients:{signers:parts},status:'created',customFields:{textCustomFields:[
   {name:'ProInspectCaseId',value:caseId,show:'false'},
   {name:'OfficialPdfSha256',value:sourceSha256,show:'false'},
   {name:'OfficialEdition',value:map.sourceEdition,show:'false'}]}};
}
export async function createSandboxDraft(config:DocusignDraftConfig,draft:EnvelopeDraft,request:typeof fetch=fetch){
 if(!config.sandbox)throw Error('DOCUSIGN_ONLY_SANDBOX_DRAFT_SUPPORTED');
 const origin=safeHost(config);
 if(!config.accessToken)throw Error('DOCUSIGN_OAUTH_TOKEN_MISSING');
 const u=origin+'/restapi/v2.1/accounts/'+encodeURIComponent(config.accountId)+'/envelopes';
 const res=await request(u,{method:'POST',headers:{Authorization:'Bearer '+config.accessToken,'Content-Type':'application/json',Accept:'application/json'},
 body:JSON.stringify(draft),redirect:'error'});
 if(!res.ok)throw Error('DOCUSIGN_CREATE_DRAFT_FAILED_'+res.status);
 const body=await res.json() as {envelopeId?:string;status?:string};
 if(!body.envelopeId||body.status==='sent')throw Error('DOCUSIGN_DRAFT_NOT_CONFIRMED');
 return {envelopeId:body.envelopeId,status:'created' as const};
}
