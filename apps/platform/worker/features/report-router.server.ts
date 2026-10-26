import { type Env,assert,AppError } from '../../../../packages/database/types';
import type {Principal,Workspace} from '../../../../packages/domain/index';
import {listReports,reportDetail,createReport,saveReport,assignReviewer,submitReport,reviewReport} from './reports.server';
import {uploadReportEvidence,reviewReportEvidence,downloadReportEvidence} from './report-evidence.server';
import {renderApprovedReport,issueApprovedReport,respondToIssuedReport,extractMaintenanceCandidates,resolveReportResponse,createMaintenanceRequest} from './report-issue.server';
import {readJson} from '../../../../packages/operations/core';
import {reportHistory} from './report-history.server';
async function payload(request:Request,large=false){
 if(!large)return readJson(request);
 const text=await request.text();
 assert(text.length<=450000,413,'REPORT_PAYLOAD_LIMIT','The report payload is too large.');
 try{return JSON.parse(text);}catch{throw new AppError(400,'INVALID_JSON','Report request must be valid JSON.');}
}
export async function reportRoutes(request:Request,env:Env,user:Principal,w:Workspace,tail:string):Promise<Response|null>{
 const [area,id,action,child,subaction]=tail.split('/');
 if(area!=='reports')return null;
 const method=request.method,ok=(value:unknown)=>Response.json(value);
 if(method==='GET'){
  if(!id)return ok(await listReports(env,user,w));
  if(id && !action)return ok(await reportDetail(env,user,w,id));
  if(id && action==='history')return ok(await reportHistory(env,user,w,id,new URL(request.url).searchParams.get('baselineReportId')??undefined));
  if(id&&action==='evidence'&&child&&subaction==='download')return downloadReportEvidence(env,user,w,id,child);
 }
 if(method!=='POST')return null;
 if(id==='create'&&!action)return ok(await createReport(env,user,w,await payload(request)));
 if(!id)return null;
 if(action==='save'||action==='sync')return ok(await saveReport(env,user,w,id,await payload(request,true)));
 if(action==='reviewer')return ok(await assignReviewer(env,user,w,id,await payload(request)));
 if(action==='submit')return ok(await submitReport(env,user,w,id,await payload(request)));
 if(action==='review')return ok(await reviewReport(env,user,w,id,await payload(request)));
 if(action==='evidence'&&!child)return ok(await uploadReportEvidence(env,user,w,id,await request.formData()));
 if(action==='evidence'&&child&&subaction==='review')return ok(await reviewReportEvidence(env,user,w,id,child,await payload(request)));
 if(action==='render')return ok(await renderApprovedReport(env,user,w,id));
 if(action==='issue')return ok(await issueApprovedReport(env,user,w,id,await payload(request)));
 if(action==='response'&&child&&subaction==='resolve')return ok(await resolveReportResponse(env,user,w,id,child,await payload(request)));
 if(action==='response'&&!child)return ok(await respondToIssuedReport(env,user,w,id,await payload(request)));
 if(action==='maintenance'&&child==='candidates')return ok(await extractMaintenanceCandidates(env,user,w,id));
 if(action==='maintenance'&&child&&subaction==='create-request')return ok(await createMaintenanceRequest(env,user,w,id,child));
 return null;
}
