/** Exact-source Form 1AA mapping contract. A field mapped by name is NOT a PDF coordinate.
 * Consumer Protection is now publishing a 2026 DOCX; freeze converted PDF bytes
 * and review every page before any active signing/issuance can be enabled.
 */
import {FORM_1AA_SECTIONS} from './form1aa.ts';
export const OFFICIAL_FORM_1AA_2026_URL='https://www.consumerprotection.wa.gov.au/system/files/documents/2026-04/form1AArentalagreement2026.docx';
export type PdfFieldPlacement={key:string;page:number;x:number;y:number;width:number;height:number;sourcePageLabel:string};
export type OfficialForm1AAMap={
 formCode:'WA_FORM_1AA';
 sourceUrl:string;
 sourceEdition:string;
 sourceDocxSha256:string;
 convertedPdfSha256:string;
 pageCount:number;
 reviewedBy:string;
 reviewedAt:string;
 placements:PdfFieldPlacement[];
 tenantSignaturePlacements:{signerOrdinal:number;page:number;x:number;y:number}[];
 lessorSignaturePlacement:{page:number;x:number;y:number}|null;
};
const hash=/^[a-f\d]{64}$/;
export const fieldRequirements=FORM_1AA_SECTIONS.map(section=>({
 sectionId:section.id,
 fields:section.fields.map(({key,label,type,required})=>({key,label,type,required,placement:'independent-review-required'} as const)),
}));
export function validateOfficialMap(m:OfficialForm1AAMap,tenantCount:number):string[]{
 const errors:string[]=[];
 if(m.formCode!=='WA_FORM_1AA'||m.sourceUrl!==OFFICIAL_FORM_1AA_2026_URL)errors.push('Current official Form 1AA source must be used');
 if(!/^2026(?:[-/]|$)/.test(m.sourceEdition))errors.push('Exact 2026 edition required');
 if(!hash.test(m.sourceDocxSha256)||!hash.test(m.convertedPdfSha256))errors.push('Independently checked source and converted PDF SHA-256 required');
 if(!Number.isInteger(m.pageCount)||m.pageCount<1||m.pageCount>60)errors.push('Verified PDF page count required');
 if(!m.reviewedBy?.trim()||!m.reviewedAt||!Number.isFinite(Date.parse(m.reviewedAt)))errors.push('Independent mapping review required');
 const required=FORM_1AA_SECTIONS.flatMap(s=>s.fields.filter(f=>f.required).map(f=>f.key));
 const placements=new Map<string,number>();
 for(const p of m.placements){
  placements.set(p.key,(placements.get(p.key)||0)+1);
  if(!Number.isInteger(p.page)||p.page<1||p.page>m.pageCount||![p.x,p.y,p.width,p.height].every(Number.isFinite)||p.x<0||p.y<0||p.width<=0||p.height<=0||!p.sourcePageLabel?.trim())
    errors.push('Invalid field placement: '+p.key);
 }
 for(const key of required)if(placements.get(key)!==1)errors.push('Missing or duplicated required field '+key);
 for(const key of placements.keys())if(!FORM_1AA_SECTIONS.some(s=>s.fields.some(f=>f.key===key)))errors.push('Unrecognized official field '+key);
 const sig=m.tenantSignaturePlacements;
 if(sig.length!==tenantCount||new Set(sig.map(p=>p.signerOrdinal)).size!==tenantCount||sig.some(p=>p.signerOrdinal<1||p.signerOrdinal>tenantCount||p.page<1||p.page>m.pageCount||p.x<0||p.y<0))
   errors.push('Separate verified signature tab for each tenant is required');
 if(!m.lessorSignaturePlacement||m.lessorSignaturePlacement.page<1||m.lessorSignaturePlacement.page>m.pageCount)
  errors.push('Verified lessor signature location is required');
 return [...new Set(errors)];
}
export function assertOfficialMapApproved(m:OfficialForm1AAMap,tenantCount:number){
 const errors=validateOfficialMap(m,tenantCount);
 if(errors.length)throw new Error('WA_1AA_MAP_UNAPPROVED: '+errors.join('; '));
 return m;
}
