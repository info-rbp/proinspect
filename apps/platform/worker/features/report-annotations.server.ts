import {z} from 'zod';
import {assert,statement,now,uid,type Env} from '../../../../packages/database/types';
import type {Principal,Workspace} from '../../../../packages/domain/index';
import {accessReport,manager} from './reports.server';
import {activity} from '../../../../packages/operations/core';

const ref=z.string().trim().min(8).max(240);
const annotation=z.object({
  x:z.number().finite().min(0).max(1),
  y:z.number().finite().min(0).max(1),
  label:z.string().trim().min(2).max(120),
}).strict();
const input=z.discriminatedUnion('action',[
  z.object({action:z.literal('save'),evidenceId:z.string().min(5).max(100),
    sourceSha256:z.string().regex(/^[a-f0-9]{64}$/),
    annotations:z.array(annotation).max(12),sourceReference:ref}),
  z.object({action:z.literal('review'),evidenceId:z.string().min(5).max(100),
    decision:z.enum(['accepted','rejected']),sourceReference:ref}),
]);
export async function reportAnnotations(env:Env,user:Principal,w:Workspace,reportId:string){
  const report=await accessReport(env,user,w,reportId);
  assert(w.kind==='staff',403,'STAFF_REQUIRED','Original report photographic evidence is Staff-only.');
  const rows=(await statement(env.DB,`SELECT a.evidence_id,a.source_sha256,a.annotations_json,a.review_status,
      a.created_by,a.reviewed_by,a.source_reference,e.status AS evidence_status,e.area_id,e.component_id
    FROM report_photo_annotations a JOIN report_evidence e ON e.id=a.evidence_id
    WHERE a.report_id=? AND e.report_id=? ORDER BY a.created_at DESC LIMIT 200`,
    reportId,reportId).all<Record<string,any>>()).results;
  const photoIds=(await statement(env.DB,
    'SELECT id,sha256,status,area_id,component_id FROM report_evidence WHERE report_id=? ORDER BY uploaded_at',
    reportId).all()).results;
  return {reportId:report.id,reportStatus:report.status,photos:photoIds,
    overlays:rows.map(({annotations_json,...row})=>({...row,annotations:JSON.parse(annotations_json)}))};
}
export async function reportAnnotationCommand(env:Env,user:Principal,w:Workspace,reportId:string,payload:unknown){
  const command=input.parse(payload);
  const report=await accessReport(env,user,w,reportId);
  assert(w.kind==='staff',403,'STAFF_REQUIRED','Report annotations require a Staff workspace.');
  assert(['draft','changes_requested','submitted'].includes(report.status),
    409,'REPORT_LOCKED','Annotations are locked after report approval.');
  const evidence=await statement(env.DB,
    'SELECT id,sha256,status,uploaded_by FROM report_evidence WHERE id=? AND report_id=?',
    command.evidenceId,reportId,
  ).first<{id:string;sha256:string;status:string;uploaded_by:string}>();
  assert(evidence,404,'EVIDENCE_NOT_FOUND','Only a photograph attached to this report may be annotated.');
  const previous=await statement(env.DB,
    'SELECT review_status,created_by FROM report_photo_annotations WHERE evidence_id=? AND report_id=?',
    evidence.id,reportId).first<{review_status:string;created_by:string}>();
  const timestamp=now();
  if(command.action==='save'){
    await accessReport(env,user,w,reportId,'edit');
    assert(evidence.sha256===command.sourceSha256,409,'PHOTO_PROVENANCE_CHANGED',
      'The source photo must match the immutably stored original.');
    assert(evidence.status==='accepted',409,'PHOTO_NOT_ACCEPTED',
      'A photograph needs independent evidence acceptance before annotations can be recorded.');
    assert(!previous||previous.review_status==='draft',409,'ANNOTATIONS_LOCKED',
      'Reviewed annotations are immutable; create a new evidence revision for changes.');
    await env.DB.batch([
      statement(env.DB,`INSERT INTO report_photo_annotations
        (evidence_id,report_id,source_sha256,annotations_json,created_by,source_reference,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(evidence_id) DO UPDATE SET
        -- Attribute the current draft to its last editor for independent review.
        annotations_json=excluded.annotations_json,created_by=excluded.created_by,source_reference=excluded.source_reference,
        updated_at=excluded.updated_at`,
        evidence.id,reportId,evidence.sha256,JSON.stringify(command.annotations),user.id,
        command.sourceReference,timestamp,timestamp),
      activity(env,user,'report.annotation_saved','report_evidence',evidence.id,report.property_id,
        report.scheme_id,{count:command.annotations.length,reference:command.sourceReference}),
    ]);
    return {ok:true,evidenceId:evidence.id,status:'draft'};
  }
  assert(manager(user,w)||report.reviewer_id===user.id,403,'ANNOTATION_REVIEWER_REQUIRED',
    'Independent authorised Staff review is required.');
  assert(previous?.review_status==='draft',409,'ANNOTATION_DRAFT_REQUIRED',
    'A draft annotation must exist before it can be reviewed.');
  assert(previous.created_by!==user.id&&evidence.uploaded_by!==user.id,403,
    'ANNOTATION_INDEPENDENCE','An annotation author or original evidence uploader cannot review it.');
  assert(evidence.status==='accepted',409,'PHOTO_NOT_ACCEPTED',
    'Only accepted photographic evidence can be reviewed.');
  await env.DB.batch([
    statement(env.DB,`UPDATE report_photo_annotations SET review_status=?,reviewed_by=?,reviewed_at=?,
      source_reference=?,updated_at=? WHERE evidence_id=? AND report_id=? AND review_status='draft'`,
      command.decision,user.id,timestamp,command.sourceReference,timestamp,evidence.id,reportId),
    activity(env,user,'report.annotation_reviewed','report_evidence',evidence.id,report.property_id,
      report.scheme_id,{decision:command.decision,reference:command.sourceReference}),
  ]);
  return {ok:true,evidenceId:evidence.id,status:command.decision};
}
