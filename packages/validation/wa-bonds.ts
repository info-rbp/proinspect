/**
 * WA Bonds Administration human-reviewed worksheet contract, October 2026.
 * These are NOT government forms and are never treated as legal service, an
 * electronic signature, a BondsOnline transaction or a Commissioner decision.
 * Review against https://www.consumerprotection.wa.gov.au/bonds-manual-forms
 * before entering a regulated transaction. Official form PDFs are external.
 */
export type BondWorkflowCode =
  | 'B01' | 'B02' | 'B03' | 'B04' | 'B05' | 'B06' | 'B07' | 'B08'
  | 'B09' | 'B10' | 'B11' | 'B12' | 'B13' | 'B14' | 'B15' | 'B16'
  | 'B17' | 'B18' | 'B19' | 'B20' | 'B21' | 'B22' | 'B23';
export type BondOfficialForm = 'lodgement' | 'variation' | 'release' | 'external' | 'restricted' | 'legacy';
export type BondWorkflowRule = {
  name: string;
  form: BondOfficialForm;
  required: readonly string[];
  notes: string;
  allowTenantInitiation?: boolean;
  externallyVerified?: boolean;
};
export const WA_BOND_FORMS: Record<'lodgement'|'variation'|'release', string> = {
 lodgement: 'https://www.consumerprotection.wa.gov.au/publications/bond-lodgement-form',
 variation: 'https://www.consumerprotection.wa.gov.au/publications/variation-security-bond',
 release: 'https://www.consumerprotection.wa.gov.au/publications/security-bond-release-application',
};
export const WA_BOND_RULES: Record<BondWorkflowCode, BondWorkflowRule> = {
 B01:{name:'Initial bond lodgement',form:'lodgement',required:['tenancyStart','tenantLegalNames','landlordLegalName','paymentDate'],notes:'Include all parties, payment receipt, general/pet components and approved manual/BondsOnline form.'},
 B02:{name:'General bond top-up',form:'variation',required:['rentIncreaseReference','writtenNoticeDate','topUpPaymentDate','newWeeklyRentCents'],notes:'Written increase notice, lawful rent increase and additional funds must be evidenced.'},
 B03:{name:'Pet bond increase',form:'variation',required:['petApprovalReference','writtenNoticeDate','topUpPaymentDate'],notes:'Pet approval or permitted rent-increase trigger, 60-day written notice and assistance-dog exemption apply.'},
 B04:{name:'Incoming tenant',form:'variation',required:['incomingTenantName','effectiveDate','tenantConsentReference'],notes:'Outgoing/remaining tenants must agree where required. Update the official bond register before confirming.'},
 B05:{name:'Outgoing tenant',form:'variation',required:['outgoingTenantName','effectiveDate','settlementReference'],notes:'Leaving tenants should settle their share before government variation; do not automatically remove their entitlement.'},
 B06:{name:'Landlord change',form:'variation',required:['formerLandlord','newLandlord','effectiveDate'],notes:'Former and new owner/landlord details and required signatures.'},
 B07:{name:'Agent change',form:'variation',required:['formerAgent','newAgent','effectiveDate'],notes:'Agent-to-agent transfer follows the BondsOnline procedure except documented exceptions.'},
 B08:{name:'Update bond contacts',form:'external',required:['contactUpdateReference','effectiveDate'],notes:'Record government update; do not assume an account profile update modifies Bonds Administration.'},
 B09:{name:'Deceased tenant variation',form:'restricted',required:[],notes:'Use confidential estate-authority case handling. Do not put estate evidence in ordinary bond records.'},
 B10:{name:'Partial release during tenancy',form:'release',required:['releaseReason','effectiveDate'],notes:'Available only in eligible situations; proceeds of a partial release go to tenants.'},
 B11:{name:'Full agreed release',form:'release',required:['tenancyEndDate','inspectionReference'],notes:'Applications need not wait for an outgoing PCR; absence of evidence must be flagged, not treated as a bar.'},
 B12:{name:'Release with landlord deductions',form:'release',required:['tenancyEndDate','claimEvidenceReference'],notes:'Nine claim categories with evidence; distinguish fair wear and tear and separate debts.'},
 B13:{name:'Tenant-initiated release',form:'release',required:['tenancyEndDate','tenantApplicationReference'],notes:'Tenants use government manual applications; no landlord permission required just to apply.',allowTenantInitiation:true},
 B14:{name:'Transfer to new bond',form:'release',required:['destinationTenancyReference','newLodgementReference'],notes:'Pair the outgoing release with an independently confirmed new lodgement and correct signatures.'},
 B15:{name:'Housing bond assistance repayment',form:'release',required:['assistanceLoanReference','repaymentReference'],notes:'Record verified loan liability and proposed repayment, without storing bank account numbers.'},
 B16:{name:'Dispute/no response',form:'external',required:['governmentNoticeReference','governmentResponseDeadline'],notes:'Non-response is not consent. Track notice and Commissioner referral.',allowTenantInitiation:true},
 B17:{name:'Commissioner submission',form:'external',required:['commissionerCaseReference','submissionDeadline'],notes:'Use the specific Invitation to Make a Submission and evidence-requested deadline.',allowTenantInitiation:true},
 B18:{name:'Appeal/court proceedings',form:'external',required:['courtFilingReference','governmentAppealDeadline'],notes:'Actual eCourts filing and notice to Bonds Administration remain external.',allowTenantInitiation:true},
 B19:{name:'Deceased tenant release',form:'restricted',required:[],notes:'Refer to restricted estate representative authority workflow.'},
 B20:{name:'Family-violence bond action',form:'restricted',required:[],notes:'Protected evidence and Form 2 issues use the separately restricted case route.'},
 B21:{name:'Missed lodgement deadline',form:'external',required:['incidentReference','resolutionPlan'],notes:'Escalate; cannot rewrite payment date or retrospectively claim compliance.'},
 B22:{name:'Payout or reconciliation mismatch',form:'external',required:['governmentPayoutReference','differenceExplanation'],notes:'Do not mark released or alter balance without government evidence.'},
 B23:{name:'Legacy disposal record',form:'legacy',required:[],notes:'Historical/transitional only; do not initiate as a new release.'},
};
export function bondWorksheetErrors(code: BondWorkflowCode, values:Record<string,string>): string[] {
 const rule=WA_BOND_RULES[code];
 if(rule.form==='restricted'||rule.form==='legacy')return ['This workflow requires restricted or historical processing.'];
 const errors=rule.required.filter(k=>!values[k]||!values[k].trim()).map(k=>`Required form information missing: ${k}`);
 for(const [key,v] of Object.entries(values)) {
   if(v.length>500)errors.push(`Form field too long: ${key}`);
   if(/(?:date|deadline|tenancyStart|tenancyEndDate|effectiveDate)/i.test(key)&&v&&
      !/^\d{4}-\d{2}-\d{2}$/.test(v))errors.push(`Use YYYY-MM-DD for ${key}`);
 }
 return errors;
}
export function waResidentialBondLimit(weeklyRentCents:number,generalCents:number,petCents:number): string[] {
 const errs: string[]=[];
 if(weeklyRentCents<=0||generalCents<=0) errs.push('Enter a positive weekly rent and general bond.');
 if(weeklyRentCents<=120000&&generalCents>weeklyRentCents*4)
   errs.push('The general bond exceeds four weeks rent for a property at or below $1,200 per week.');
 if(petCents>35000) errs.push('Residential pet bond exceeds $350.');
 return errs;
}
