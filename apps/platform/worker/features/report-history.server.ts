import {type Env,assert,statement} from '../../../../packages/database/types';
import type {Principal,Workspace} from '../../../../packages/domain/index';
import {reportDraftSchema,type ReportDraft} from '../../../../packages/report-engine/adapter';
import {compareInspections,recurringMaintenance,type InspectionSnapshot} from '../../../../packages/report-engine/comparison';
import {accessReport,manager,type ReportRow} from './reports.server';

/** Staff-only comparison with an independent issued baseline for the same property and tenancy. */
export async function reportHistory(env:Env,user:Principal,w:Workspace,id:string,requestedBaseline?:string){
 const current=await accessReport(env,user,w,id);
 assert(w.kind==='staff',403,'STAFF_ONLY','Historical assessment is limited to authorised Staff.');
 const operations=manager(user,w);
 const restrict=operations?'':' AND (r.inspector_id=? OR r.reviewer_id=?)';
 const rows=(await statement(env.DB,`SELECT r.id,r.property_id,r.scheme_id,r.tenancy_id,r.approved_version_id,r.created_at,r.report_type,r.inspector_id,r.reviewer_id
 FROM inspection_reports r WHERE r.id!=? AND r.status='issued' AND r.approved_version_id IS NOT NULL
 AND ( (? IS NOT NULL AND r.property_id=?) OR (? IS NOT NULL AND r.scheme_id=?) )
 AND COALESCE(r.tenancy_id,'')=COALESCE(?, '') AND r.created_at<?
 ${restrict} ORDER BY r.created_at DESC LIMIT 20`,
 id,current.property_id,current.property_id,current.scheme_id,current.scheme_id,current.tenancy_id,current.created_at,
 ...(operations?[]:[user.id,user.id])).all<{id:string;property_id:string|null;scheme_id:string|null;tenancy_id:string|null;approved_version_id:string;created_at:string;report_type:string}>()).results;
 const choices=rows.map(row=>({id:row.id,createdAt:row.created_at,reportType:row.report_type}));
 if(requestedBaseline)assert(choices.some(row=>row.id===requestedBaseline),404,'BASELINE_NOT_FOUND','The baseline is not authorised or is not an earlier issued report in this property and tenancy.');
 const selected=requestedBaseline||choices[0]?.id;
 const ids=new Set([...rows.map(row=>row.approved_version_id),...(current.approved_version_id?[current.approved_version_id]:[])]);
 const versionContent=new Map<string,ReportDraft>();
 for(const versionId of ids){
  const version=await statement(env.DB,'SELECT content_json FROM report_versions WHERE id=?',versionId).first<{content_json:string}>();
  if(version)versionContent.set(versionId,reportDraftSchema.parse(JSON.parse(version.content_json)));
 }
 const currentSource=current.approved_version_id?versionContent.get(current.approved_version_id):null;
 const draft=currentSource?null:await statement(env.DB,'SELECT content_json FROM report_drafts WHERE report_id=?',current.id).first<{content_json:string}>();
 const currentDraft=currentSource??(draft?reportDraftSchema.parse(JSON.parse(draft.content_json)):null);
 const prior=rows.find(row=>row.id===selected);
 const comparison=prior&&currentDraft&&versionContent.has(prior.approved_version_id)
  ?compareInspections({reportId:prior.id,capturedAt:prior.created_at,draft:versionContent.get(prior.approved_version_id)!},
   {reportId:current.id,capturedAt:current.created_at,draft:currentDraft}):null;
 const issued=rows.filter(row=>versionContent.has(row.approved_version_id)).map(row=>({
  reportId:row.id,capturedAt:row.created_at,draft:versionContent.get(row.approved_version_id)!
 }));
 return {choices,selectedBaselineId:selected??null,comparison,
  recurringMaintenance:recurringMaintenance(issued),reviewOnly:true,
  note:'Deterministic condition changes and recurring recommendations; no automated photo comparison, legal attribution or contractor instruction.'};
}
