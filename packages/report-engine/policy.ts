/**
 * Operational output contracts for ProInspect's 23 service IDs.
 * The legacy report engine's five types are not confused with the whole service catalogue.
 * Each policy describes a suitable report family/profile, not a completed legal form.
 */
export type InspectionType = 'entry' | 'routine' | 'exit' | 'comparison' | 'maintenance';
export type ReportProfile = 'residential' | 'commercial' | 'strata' | 'attendance';
export type ReportOutput = 'inspection' | 'attendance';
export interface ServiceReportContract {
  type: InspectionType;
  profile: ReportProfile;
  output: ReportOutput;
  needsBaseline: boolean;
  tenancyResponse: boolean;
}
function p(type: InspectionType, profile: ReportProfile, output: ReportOutput = 'inspection'): ServiceReportContract {
  return Object.freeze({type,profile,output,needsBaseline:type==='exit'||type==='comparison',tenancyResponse:type==='entry'&&profile==='residential'});
}
export const SERVICE_REPORT_CONTRACTS: Readonly<Record<string,ServiceReportContract>> = Object.freeze({
  'routine-inspection':p('routine','residential'),
  'property-condition-report':p('entry','residential'),
  'pre-vacate-inspection':p('routine','residential'),
  'final-exit-inspection':p('exit','residential'),
  'commercial-property-inspection':p('routine','commercial'),
  'commercial-pre-vacate-make-good-inspection':p('routine','commercial'),
  'commercial-final-make-good-inspection':p('exit','commercial'),
  'common-property-inspection':p('routine','strata'),
  'building-management-attendance':p('maintenance','strata','attendance'),
  'maintenance-attendance':p('maintenance','residential'),
  'completed-works-inspection':p('maintenance','residential'),
  'follow-up-reinspection':p('maintenance','residential'),
  'damage-incident-inspection':p('maintenance','strata'),
  'cleaning-presentation-inspection':p('routine','strata'),
  'defect-rectification-inspection':p('maintenance','strata'),
  'property-meeting':p('routine','attendance','attendance'),
  'contractor-access-attendance':p('routine','attendance','attendance'),
  'key-handover-collection':p('routine','attendance','attendance'),
  'contractor-supervision-attendance':p('maintenance','attendance','attendance'),
  'move-in-move-out-attendance':p('routine','attendance','attendance'),
  'urgent-building-attendance':p('maintenance','strata','attendance'),
  'building-handover-attendance':p('maintenance','strata','attendance'),
  'other-custom-appointment':p('routine','attendance','attendance'),
});
export function reportPolicyForService(serviceId:string):ServiceReportContract|null {
 return SERVICE_REPORT_CONTRACTS[serviceId]??null;
}
export const REPORT_RECIPIENT_KINDS=['client','tenancy','scheme_resident','scheme_owner','scheme_council'] as const;
export type ReportRecipientKind=typeof REPORT_RECIPIENT_KINDS[number];
export type ReportAction='create'|'edit'|'upload'|'submit'|'review'|'approve'|'issue'|'respond'|'download';
export const PORTAL_REPORT_PERMISSIONS:Readonly<Record<string,Readonly<ReportAction[]>>> = Object.freeze({
  staff:['create','edit','upload','submit','review','approve','issue','download'],
  landlord:['download'], 'property-manager':['download'], commercial:['download'],
  'strata-manager':['download'], tenant:['respond','download'], council:['download'], building:['download'],
});
export function mayUseReportAction(workspace:string,action:ReportAction):boolean {
  return PORTAL_REPORT_PERMISSIONS[workspace]?.includes(action)??false;
}
