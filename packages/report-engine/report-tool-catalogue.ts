/** Reviewed report selections from Property-Report-Tool@ed55b440 (2026-10-25).
 * Keep these aligned with the source catalogue in tests and change them only through reviewed PRs.
 */
export const TOOL_REPORT_TYPES = ["Entry","Routine","Exit","PropertyOnboarding","VacantProperty","MaintenanceAssessment","MaintenanceCompletion","CleaningRectification","CommercialIngoing","CommercialPeriodic","CommercialExit","CommonProperty","BuildingManagement","BuildingManagementDaily","BuildingManagementMonthly","UpdatedBusinessManagement","Incident","ContractorWorks","PropertyHandover","PreventativeMaintenance","CleaningQuality","AnnualPropertySummary","KeySafeInstallation","KeyReceipt","Custom"] as const;
export type ToolReportType = typeof TOOL_REPORT_TYPES[number];
export const TOOL_TEMPLATE_FOR_SERVICE: Readonly<Record<string,ToolReportType>> = Object.freeze({
  'routine-inspection':'Routine',
  'property-condition-report':'Entry',
  'pre-vacate-inspection':'Routine',
  'final-exit-inspection':'Exit',
  'commercial-property-inspection':'CommercialPeriodic',
  'commercial-pre-vacate-make-good-inspection':'CommercialPeriodic',
  'commercial-final-make-good-inspection':'CommercialExit',
  'common-property-inspection':'CommonProperty',
  'building-management-attendance':'BuildingManagementDaily',
  'maintenance-attendance':'MaintenanceAssessment',
  'completed-works-inspection':'MaintenanceCompletion',
  'follow-up-reinspection':'CleaningRectification',
  'damage-incident-inspection':'Incident',
  'cleaning-presentation-inspection':'CleaningQuality',
  'defect-rectification-inspection':'CleaningRectification',
  'property-meeting':'Custom',
  'contractor-access-attendance':'ContractorWorks',
  'key-handover-collection':'KeyReceipt',
  'contractor-supervision-attendance':'ContractorWorks',
  'move-in-move-out-attendance':'PropertyHandover',
  'urgent-building-attendance':'Incident',
  'building-handover-attendance':'PropertyHandover',
  'other-custom-appointment':'Custom',
});
export const templateForBooking = (id:string):ToolReportType|null => TOOL_TEMPLATE_FOR_SERVICE[id]??null;
