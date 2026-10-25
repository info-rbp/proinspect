import type {ReportDraft} from './adapter';

export type ConditionChange='deteriorated'|'improved'|'unchanged'|'not_comparable'|'new'|'missing';
export interface InspectionSnapshot{reportId:string;capturedAt:string;draft:ReportDraft}
export interface ComponentChange {
 key:string;area:string;component:string;status:ConditionChange;
 baselineCondition?:string;currentCondition?:string;
 baselinePhotos:number;currentPhotos:number;
 maintenanceBefore:boolean;maintenanceNow:boolean;
 baselineCommentary?:string;currentCommentary?:string;
 reasons:string[];
}
export interface ConditionComparison {
 baselineReportId:string;currentReportId:string;
 compared:number;deteriorated:number;improved:number;unchanged:number;newItems:number;missingItems:number;notComparable:number;
 findings:ComponentChange[];
}
export interface RecurringMaintenanceFinding {
 key:string;area:string;component:string;occurrences:number;reportIds:string[];latestObservedAt:string;
}
export const inspectionLabelKey=(name:string)=>name.normalize('NFKC').trim().toLocaleLowerCase('en-AU').replace(/\s+/g,' ');
const conditionSeverity:Readonly<Record<string,number>>={intact:0,minor_wear:1,repair_required:2,replacement_recommended:3};
const cleanlinessSeverity:Readonly<Record<string,number>>={clean:0,requires_cleaning:1,stained:2};
const operationSeverity:Readonly<Record<string,number>>={operation_confirmed:0,appears_operational:1,not_working:2};
function entries(snapshot:InspectionSnapshot) {
 const mapped=new Map<string,{area:string;component:string;content:ReportDraft['areas'][number]['components'][number]}>();
 const duplicates=new Set<string>();
 for(const area of snapshot.draft.areas)for(const item of area.components){
  const key=inspectionLabelKey(area.name)+'|'+inspectionLabelKey(item.component);
  if(mapped.has(key))duplicates.add(key);
  mapped.set(key,{area:area.name,component:item.component,content:item});
 }
 for(const key of duplicates)mapped.delete(key); // Ambiguous names cannot be matched safely.
 return mapped;
}
function compareDimension(name:string,before:string,after:string,scale:Readonly<Record<string,number>>,reasons:string[]){
 const old=scale[before],next=scale[after];
 if(old===undefined||next===undefined)return null;
 if(old!==next)reasons.push(name+' '+before.replaceAll('_',' ')+' → '+after.replaceAll('_',' '));
 return Math.sign(next-old);
}
/** Descriptive, deterministic observations only. Never infer cause, liability or statutory compliance. */
export function compareInspections(baseline:InspectionSnapshot,current:InspectionSnapshot):ConditionComparison{
 const before=entries(baseline),after=entries(current),keys=[...new Set([...before.keys(),...after.keys()])].sort();
 const findings:ComponentChange[]=[];
 for(const key of keys){
  const old=before.get(key),now=after.get(key),reasons:string[]=[];
  const deltas=old&&now?[
    compareDimension('Condition',old.content.conditionCategory,now.content.conditionCategory,conditionSeverity,reasons),
    compareDimension('Cleanliness',old.content.cleanlinessCategory,now.content.cleanlinessCategory,cleanlinessSeverity,reasons),
    compareDimension('Working',old.content.workingStatus,now.content.workingStatus,operationSeverity,reasons)
  ]:[];
  const status:ConditionChange=!old?'new':!now?'missing':
   deltas.some(x=>x!==null&&x>0)?'deteriorated':
   deltas.some(x=>x!==null&&x<0)?'improved':
   deltas.some(x=>x!==null)?'unchanged':'not_comparable';
  if(old&&now&&!old.content.maintenanceRequired&&now.content.maintenanceRequired)reasons.push('New maintenance recommendation');
  findings.push({key,area:now?.area??old!.area,component:now?.component??old!.component,status,
   baselineCondition:old?.content.conditionCategory,currentCondition:now?.content.conditionCategory,
   baselinePhotos:old?.content.photoIds.length??0,currentPhotos:now?.content.photoIds.length??0,
   maintenanceBefore:old?.content.maintenanceRequired??false,maintenanceNow:now?.content.maintenanceRequired??false,
   baselineCommentary:old?.content.commentary,currentCommentary:now?.content.commentary,reasons});
 }
 const count=(s:ConditionChange)=>findings.filter(f=>f.status===s).length;
 return {baselineReportId:baseline.reportId,currentReportId:current.reportId,
  compared:findings.filter(f=>!['new','missing'].includes(f.status)).length,
  deteriorated:count('deteriorated'),improved:count('improved'),unchanged:count('unchanged'),
  newItems:count('new'),missingItems:count('missing'),notComparable:count('not_comparable'),findings};
}
/** Only pass issued, approved-version snapshots. Counts do not automatically create maintenance requests. */
export function recurringMaintenance(issued:InspectionSnapshot[]):RecurringMaintenanceFinding[]{
 const values=new Map<string,RecurringMaintenanceFinding>();
 for(const snap of issued)for(const [key,item] of entries(snap)){
  const relevant=item.content.maintenanceRequired||item.content.defects.length>0;
  if(!relevant)continue;
  const prev=values.get(key);
  if(prev){
   if(!prev.reportIds.includes(snap.reportId)){prev.occurrences++;prev.reportIds.push(snap.reportId);}
   if(snap.capturedAt>prev.latestObservedAt)prev.latestObservedAt=snap.capturedAt;
  }else values.set(key,{key,area:item.area,component:item.component,occurrences:1,reportIds:[snap.reportId],latestObservedAt:snap.capturedAt});
 }
 return [...values.values()].filter(v=>v.occurrences>=2).sort((a,b)=>b.occurrences-a.occurrences||a.key.localeCompare(b.key));
}
