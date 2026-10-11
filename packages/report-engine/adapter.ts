import { z } from 'zod';
import { COMPONENT_CLEANLINESS_CATEGORIES, COMPONENT_CONDITION_CATEGORIES, COMPONENT_WORKING_STATUSES, COMPONENT_TEST_STATUSES, COMPONENT_COMPARISON_STATUSES, type ReportAggregate } from './upstream/reportModel.ts';
import { evaluateReportQuality, type ReportQcResult } from './upstream/reportOperations.ts';
import { inspectionPolicy } from './upstream/inspectionPolicy.ts';
import type { ServiceReportContract } from './policy.ts';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const component = z.object({
 id, component:z.string().trim().min(2).max(180),commentary:z.string().trim().max(4000).default(''),
 conditionCategory:z.enum(COMPONENT_CONDITION_CATEGORIES), cleanlinessCategory:z.enum(COMPONENT_CLEANLINESS_CATEGORIES),
 workingStatus:z.enum(COMPONENT_WORKING_STATUSES).default('not_applicable'),
 testStatus:z.enum(COMPONENT_TEST_STATUSES).default('not_applicable'),
 comparisonStatus:z.enum(COMPONENT_COMPARISON_STATUSES).default('not_compared'),
 comparisonReviewStatus:z.enum(['suggested','confirmed','edited','rejected']).optional(),
 maintenanceRequired:z.boolean().default(false), photoIds:z.array(id).max(40).default([]),
 defects:z.array(z.string().trim().min(2).max(300)).max(25).default([]),
 testMethod:z.string().trim().max(250).optional(),
}).strict();
const area=z.object({
 id,name:z.string().trim().min(2).max(120),
 overviewPhotoIds:z.array(id).max(40).default([]),
 components:z.array(component).min(1).max(120),
}).strict();
export const reportDraftSchema=z.object({
 summary:z.string().trim().max(10000).default(''),
 areas:z.array(area).min(1).max(90),
}).strict();
export type ReportDraft=z.infer<typeof reportDraftSchema>;
export interface ReportReviewContext {
 id:string;workOrderId:string;propertyId:string|null;schemeId:string|null;tenancyId:string|null;
 templateId:string;templateVersion:number;layoutId:string;
 reportType:string;profile:string;baselineVersionId:string|null;outputKind:string;
}
export function qualityReview(draft:ReportDraft,ctx:ReportReviewContext,policy:ServiceReportContract,
 evidence:ReadonlyMap<string,{status:string,object_key:string}>): ReportQcResult {
 const areas=draft.areas.map(a=>({
   id:a.id,name:a.name,photoReferences:a.overviewPhotoIds.map(photoId=>({photoId,objectPath:evidence.get(photoId)?.object_key??''})),
   components:a.components.map(c=>({
     id:c.id,component:c.component,conditionCategory:c.conditionCategory,cleanlinessCategory:c.cleanlinessCategory,
     workingStatus:c.workingStatus,testStatus:c.testStatus,maintenanceRequired:c.maintenanceRequired,defects:c.defects,
     commentary:c.commentary,reviewStatus:'draft',comparisonStatus:c.comparisonStatus,comparisonReviewStatus:c.comparisonReviewStatus,
     photoReferences:c.photoIds.map(photoId=>({photoId,objectPath:evidence.get(photoId)?.object_key??''})),
     ...(c.testMethod?{testRecord:{status:'tested',method:c.testMethod,testedAt:new Date().toISOString(),testedBy:'inspector'}}:{}),
   }))
 }));
 const synthetic:ReportAggregate={report:{
   id:ctx.id,agencyId:'proinspect',reportType:ctx.reportType,inspectionJobId:ctx.workOrderId,
   propertyId:ctx.propertyId??undefined,propertyLayoutVersionId:ctx.layoutId,templateId:ctx.templateId,
   templateVersion:ctx.templateVersion,baselineReportId:ctx.baselineVersionId?ctx.id:undefined,
   baselineReportVersionId:ctx.baselineVersionId??undefined,
   propertyAddress:'',lifecycleStatus:'draft'
 } as ReportAggregate['report'],areas} as unknown as ReportAggregate;
 const result=evaluateReportQuality(synthetic);
 const issues=[...result.issues];
 // Scheme reporting is a canonical scheme target, not a fabricated Property ID.
 if(ctx.schemeId && !ctx.propertyId)for(let i=issues.length-1;i>=0;i--)if(issues[i].code==='PROPERTY_LINK_REQUIRED')issues.splice(i,1);
 // Initial maintenance/attendance has no earlier maintenance report; follow-up service policies must request a baseline explicitly.
 if(ctx.reportType==='maintenance'&&!policy.needsBaseline&&!ctx.baselineVersionId)
    for(let i=issues.length-1;i>=0;i--)if(issues[i].code==='BASELINE_VERSION_REQUIRED')issues.splice(i,1);
 if(policy.output==='attendance')for(let i=issues.length-1;i>=0;i--)if(['AREA_OVERVIEW_EVIDENCE_REQUIRED','COMMENTARY_REQUIRED','TEST_STATUS_UNASSESSED','COMPARISON_REQUIRED'].includes(issues[i].code))issues.splice(i,1);
 if(!draft.summary.trim() && policy.output==='attendance')issues.push({id:'ATTENDANCE_SUMMARY_REQUIRED',code:'ATTENDANCE_SUMMARY_REQUIRED',category:'commentary',severity:'blocker',message:'Describe the attendance and the outcome.'});
 const referenced=new Set(areas.flatMap(a=>[...a.photoReferences,...a.components.flatMap(c=>c.photoReferences)]).map(p=>p.photoId));
 for(const photoId of referenced){
   const photo=evidence.get(photoId);
   if(!photo || photo.status!=='accepted')issues.push({id:'EVIDENCE_NOT_ACCEPTED:'+photoId,code:'EVIDENCE_NOT_ACCEPTED',category:'evidence',severity:'blocker',message:'This photo is missing or has not passed the evidence review.'});
 }
 const blockerCount=issues.filter(i=>i.severity==='blocker').length, errorCount=issues.filter(i=>i.severity==='error').length,warningCount=issues.filter(i=>i.severity==='warning').length,infoCount=issues.filter(i=>i.severity==='info').length;
 return {...result,issues,blockerCount,errorCount,warningCount,infoCount,status:blockerCount||errorCount?'blocked':warningCount?'warnings':'pass',score:Math.max(0,100-blockerCount*18-errorCount*8-warningCount*2)};
}
export function initialReportDraft(profile:string):ReportDraft {
 const place=profile==='strata'?'Common property':profile==='commercial'?'Commercial premises':'General condition';
 return {summary:'',areas:[{id:'area_general',name:place,overviewPhotoIds:[],components:[{id:'component_general',component:'Visible condition',commentary:'',conditionCategory:'unable_to_confirm',cleanlinessCategory:'unable_to_confirm',workingStatus:'not_applicable',testStatus:'not_applicable',comparisonStatus:'not_compared',maintenanceRequired:false,photoIds:[],defects:[]}]}]};
}
export function mustUseTemplate(ctx:ReportReviewContext,serviceContract:ServiceReportContract) {
 if(ctx.reportType!==serviceContract.type||ctx.profile!==serviceContract.profile||ctx.outputKind!==serviceContract.output)throw new Error('The report context has diverged from its original service policy.');
 if(serviceContract.needsBaseline&&!ctx.baselineVersionId)throw new Error('An immutable baseline report version is required for this type.');
 return inspectionPolicy(ctx.reportType);
}
