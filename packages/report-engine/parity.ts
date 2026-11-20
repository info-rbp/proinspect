import { TOOL_REPORT_TYPES, TOOL_TEMPLATE_FOR_SERVICE, type ToolReportType } from './report-tool-catalogue.ts';
import { SERVICE_REPORT_CONTRACTS, type InspectionType } from './policy.ts';

/** Retained upstream templates versus the live 23-service routing.
 * A name mapping does not prove image, layout, PDF or contractual parity.
 */
export interface ReportTemplateParityRow {
 template:ToolReportType;
 serviceIds:readonly string[];
 nativeFamilies:readonly InspectionType[];
 routeState:'service_mapped'|'unmapped_retained';
 fidelityState:'pending_visual_acceptance';
}
export const REPORT_TEMPLATE_PARITY:readonly ReportTemplateParityRow[] = TOOL_REPORT_TYPES.map(template=>{
 const serviceIds=Object.keys(TOOL_TEMPLATE_FOR_SERVICE)
  .filter(serviceId=>TOOL_TEMPLATE_FOR_SERVICE[serviceId]===template).sort();
 const nativeFamilies=[...new Set(serviceIds.map(id=>SERVICE_REPORT_CONTRACTS[id]?.type)
   .filter((v):v is InspectionType=>!!v))].sort();
 return Object.freeze({template,serviceIds:Object.freeze(serviceIds),nativeFamilies:Object.freeze(nativeFamilies),
  routeState:serviceIds.length?'service_mapped' as const:'unmapped_retained' as const,
  fidelityState:'pending_visual_acceptance' as const});
});
export function reportTemplateParitySummary(){
 const routed=new Set(REPORT_TEMPLATE_PARITY.flatMap(r=>r.serviceIds));
 const expected=Object.keys(SERVICE_REPORT_CONTRACTS);
 return {retainedTemplates:REPORT_TEMPLATE_PARITY.length,routedTemplates:REPORT_TEMPLATE_PARITY.filter(r=>r.serviceIds.length).length,
  routedServices:expected.filter(id=>routed.has(id)).length,totalServices:expected.length,
  unmappedTemplates:REPORT_TEMPLATE_PARITY.filter(r=>!r.serviceIds.length).map(r=>r.template),
  visualAccepted:0,source:'retained_report_tool_catalogue'};
}
