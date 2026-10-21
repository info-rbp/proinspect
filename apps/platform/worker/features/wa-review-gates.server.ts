import { statement, type Env } from '../../../../packages/database/types';
import { unseal } from '../../../../packages/auth/crypto';
import { preIssueDependencies } from '../../../../packages/wa-residential/rules';

/** Independent form-issue readiness checks; never equate a reference with lawful service. */
export const editableRequirements=[
 'verified_prior_form_21','statutory_grounds_review','legal_service_review',
 'verified_rent_ledger','verified_grounds','verified_entry_purpose',
 'service_window_review','official_signature_policy','issued_pcr_report',
] as const;
type Requirement=typeof editableRequirements[number];
export function manualIssueRequirements(code:string):Requirement[]{
  const all=preIssueDependencies(code);
  const required=all.filter((d):d is Requirement=>editableRequirements.includes(d as Requirement));
  if(code==='WA_FORM_1A') required.push('legal_service_review');
  if(code==='WA_FORM_1AA') required.push('official_signature_policy');
  if(code==='WA_FORM_10'||code==='WA_FORM_20'||code==='WA_FORM_22') required.push('statutory_grounds_review');
  return [...new Set(required)];
}
export async function waIssueReadiness(env:Env,c:Record<string,any>){
 const required=manualIssueRequirements(c.form_code);
 const rows=(await statement(env.DB,
  'SELECT requirement FROM wa_residential_form_verifications WHERE case_id=?',c.id).all<{requirement:Requirement}>()).results;
 const checked=new Set(rows.map(r=>r.requirement));
 const missing=required.filter(x=>!checked.has(x));
 const checks:string[]=[];
 if(c.form_code==='WA_FORM_19'){
  if(!c.booking_id||c.notice_invalidated_at||!c.notice_booking_starts_at)
    checks.push('active_booking');
  else {
    const booking=await statement(env.DB,
      "SELECT id FROM bookings WHERE id=? AND property_id=? AND starts_at=? AND status='confirmed'",
      c.booking_id,c.property_id,c.notice_booking_starts_at).first();
    if(!booking) checks.push('active_booking');
  }
 }
 if(c.form_code==='WA_FORM_1'){
  // A reviewer reference alone cannot establish that a PCR actually exists.
  // Require an issued, tenancy-granted property condition report associated
  // with this residential tenancy before the prescribed Form 1 can issue.
  const report=await statement(env.DB,`
    SELECT d.id FROM documents d
    JOIN document_grants g ON g.document_id=d.id
      AND g.recipient_kind='tenancy' AND g.recipient_id=?
    WHERE d.tenancy_id=? AND d.property_id=?
      AND d.category='property_condition_report' AND d.status='issued'
    LIMIT 1`,c.tenancy_id,c.tenancy_id,c.property_id).first();
  if(!report) checks.push('issued_tenancy_granted_pcr');
 }
 if(c.form_code==='WA_FORM_1A'){
  const envelope=await unseal<{answers?:Record<string,string>}>(env.DATA_ENCRYPTION_KEY,
    `wa-form:${c.id}`,c.data_envelope);
  const ref=envelope.answers?.breachFormReference??'';
  const prior=await statement(env.DB,`SELECT p.id FROM wa_residential_form_cases p
     JOIN wa_residential_form_delivery d ON d.case_id=p.id AND d.outcome='delivered'
     WHERE p.id=? AND p.tenancy_id=? AND p.property_id=? AND p.form_code='WA_FORM_21'
       AND p.issued_document_id IS NOT NULL AND p.status IN('document_issued','service_evidence_recorded','completed')
     LIMIT 1`,ref,c.tenancy_id,c.property_id).first();
  if(!prior) checks.push('linked_form_21_with_delivery_evidence');
 }
 return {ready:missing.length===0&&checks.length===0,missing:[...missing,...checks],
   legallyCertified:false,statutoryEffectEstablished:false};
}
