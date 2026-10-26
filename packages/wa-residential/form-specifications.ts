/** Explicit ordinary WA form handling map; all automated issuance disabled.
 * Official editions, signing requirements and deadline exceptions require review.
 */
import {WA_RESIDENTIAL_FORMS,OFFICIAL_WA_FORMS_URL,WA_BOND_FORMS_URL,type WaDefinition} from './forms';
export type SigningRoute='both_parties'|'issuer_review'|'tenant_request'|'tenant_response'|'physical_or_government'|'external';
export type DeliveryRoute='executed_copy'|'reviewed_notice'|'request_and_written_response'|'external_authority';
export type StatutorySpec={code:string;name:string;stage:string;actor:string;route:SigningRoute;delivery:DeliveryRoute;response:string;templateUrl:string;requiredFields:string[];releaseChecks:readonly string[];issuerEnabled:false};
const requests=new Set(['WA_FORM_24','WA_FORM_25','WA_FORM_26','WA_FORM_27']);
const responses=new Set(['WA_FORM_28']);
const bonds=new Set(['WA_BOND_LODGEMENT','WA_BOND_VARIATION','WA_BOND_RELEASE']);
const special=new Set(['WA_FORM_14','WA_FORM_17','WA_BOND_DISPUTE','WA_FORM_18']);
const clocks:Record<string,string>={
 WA_FORM_1AA:'Delivery of signed copies and effective execution: legally reviewed rules',
 WA_FORM_1:'PCR issue and tenant review period: legally reviewed service evidence',
 WA_FORM_19:'Notice period varies by entry purpose; review booking and lawful service',
 WA_FORM_25:'14 days from verified receipt; exceptions/Commissioner process',
 WA_FORM_26:'14 days from verified receipt; exceptions/Commissioner process',
 WA_FORM_27:'28-day response workflow; review exceptions and receipt',
 WA_FORM_28:'28-day response workflow; review exceptions and receipt',
 WA_FORM_1A:'Require earlier Form 21 and legally effective service',
 WA_FORM_1B:'Verify rent ledger and prescribed notice period',
 WA_FORM_1C:'Ground-specific notice and termination period',
 WA_BOND_LODGEMENT:'Verify statutory deadline against actual bond receipt',
 WA_BOND_RELEASE:'Current 2026 government bond process; no generic e-sign',
};
const route=(f:WaDefinition):SigningRoute=>f.code==='WA_FORM_1AA'?'both_parties':
 bonds.has(f.code)?'physical_or_government':requests.has(f.code)?'tenant_request':
 responses.has(f.code)?'tenant_response':special.has(f.code)||f.stage==='bond'?'external':'issuer_review';
const releaseChecks=[
 'Verified prescribed template edition and official file SHA-256',
 'Correct residential tenancy and current legal issuer authority',
 'Approved applicable grounds, conditional fields, signatures and exception rules',
 'Approved service method, receipt evidence and appropriate confidentiality',
] as const;
export const WA_FORM_SPECIFICATIONS:readonly StatutorySpec[]=WA_RESIDENTIAL_FORMS.map(f=>({
 code:f.code,name:f.name,stage:f.stage,actor:f.audience,route:route(f),
 delivery:f.code==='WA_FORM_1AA'?'executed_copy':requests.has(f.code)||responses.has(f.code)?'request_and_written_response':f.stage==='bond'||f.kind==='external'?'external_authority':'reviewed_notice',
 response:clocks[f.code]??'No automated deadline without approved form-specific rules',
 templateUrl:f.stage==='bond'?WA_BOND_FORMS_URL:OFFICIAL_WA_FORMS_URL,
 requiredFields:f.fields.filter(x=>x.required).map(x=>x.key),
 releaseChecks,issuerEnabled:false as const,
}));
export const specFor=(code:string)=>WA_FORM_SPECIFICATIONS.find(f=>f.code===code);
