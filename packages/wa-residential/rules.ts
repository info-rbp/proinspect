/**
 * Small, explicit WA residential workflow checks.
 *
 * These assist human reviewers; they do not establish legal service or
 * final statutory interpretation. Do not auto-approve a request on timeout.
 * Change this version only after source/legal validation.
 */
export const WA_ADVISORY_RULE_VERSION = 'wa-residential-2026-10-review-pending';
export type EntryPurpose = 'routine' | 'repairs' | 'other';
export interface WaDeadline {
  dueAt: string;
  basis: string;
  ruleVersion: string;
  legallyVerified: false;
}
export function waDate(value: string) {
  const d=new Date(value);
  if (!Number.isFinite(d.getTime())) throw new Error('INVALID_DATE');
  return d;
}
export function responseDeadline(code: string, receivedAt: string): WaDeadline | null {
  if (!['WA_FORM_25','WA_FORM_26'].includes(code)) return null;
  const received=waDate(receivedAt);
  return {
    dueAt:new Date(received.getTime()+14*86400000).toISOString(),
    basis:'Advisory 14-day response period after recorded receipt; confirm service, exceptions and statutory calculation before decision.',
    ruleVersion:WA_ADVISORY_RULE_VERSION,
    legallyVerified:false,
  };
}
/**
 * Routine inspections generally require 7-14 days written notice;
 * repairs: 72h; other entry purposes cannot be reliably assessed from
 * generic fields, and must be reviewed individually.
 *
 * Returns warnings, never a conclusion of lawful service.
 */
export function entryNoticeAdvisory(
  purpose: EntryPurpose,
  receivedAt: string,
  plannedAt: string,
): {withinPublishedWindow:boolean; minimumHours:number|null; maximumHours:number|null; warnings:string[]; legallyVerified:false} {
  const received=waDate(receivedAt), planned=waDate(plannedAt);
  const hours=(planned.getTime()-received.getTime())/3600000;
  const min=purpose==='routine'?168:purpose==='repairs'?72:null;
  const max=purpose==='routine'?336:null;
  const within=hours>0 && (min===null||hours>=min) && (max===null||hours<=max);
  const warnings=['Recorded receipt does not itself prove legally effective service. Check entry grounds, permitted hours, notice method and applicable exceptions.'];
  if (purpose==='other') warnings.push('Other entry grounds must be checked against the current prescribed Form 19 and section 46; no generic notice window is assumed.');
  if (!within) warnings.push('The recorded proposed entry time appears outside the published notice window.');
  return {withinPublishedWindow:within&&purpose!=='other',minimumHours:min,maximumHours:max,warnings,legallyVerified:false};
}
export function preIssueDependencies(code:string) {
  if (code==='WA_FORM_1A') return ['verified_prior_form_21','statutory_grounds_review'];
  if (code==='WA_FORM_1B') return ['verified_rent_ledger','statutory_grounds_review'];
  if (code==='WA_FORM_1C') return ['verified_grounds','statutory_grounds_review'];
  if (code==='WA_FORM_21') return ['verified_rent_ledger'];
  if (code==='WA_FORM_19') return ['verified_entry_purpose','matching_booking','service_window_review'];
  if (code==='WA_FORM_1') return ['issued_pcr_report'];
  if (['WA_BOND_LODGEMENT','WA_BOND_VARIATION','WA_BOND_RELEASE','WA_BOND_DISPUTE'].includes(code))
    return ['external_authority_confirmation'];
  return [] as string[];
}
export const WA_BOND_APPLICATION_SOURCE='https://www.consumerprotection.wa.gov.au/bonds-manual-forms';
