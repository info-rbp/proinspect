import {z} from 'zod';
import {assert,statement,now,uid,type Env} from '../../../../packages/database/types';
import type {Principal,Workspace} from '../../../../packages/domain/index';
import {operationsWrite,administrator} from '../../../../packages/authorization/server';
import {activity,guard,clearGuard,recordId,reference,shortText,dateOnly} from '../../../../packages/operations/core';
const assetId=z.string().regex(/^[A-Za-z0-9:_-]+$/).max(180);
const cash=z.coerce.number().int().min(0).max(1_000_000_000);
const span=z.coerce.number().int().min(1).max(366);
const markets=z.enum(['RES','COM','STR','CTS','STA','SOC','SDA','RET','AGE','RUR','INS']);
function staff(user:Principal,w:Workspace){
 assert(w.kind==='staff'&&['administrator','operations_manager'].includes(user.staffRole??''),403,
 'V2_ENTERPRISE_STAFF_REQUIRED','Enterprise registers are restricted to ProInspect management.');
 operationsWrite(user);
}
function executive(user:Principal,w:Workspace){staff(user,w);administrator(user);}
async function tx(env:Env,user:Principal,query:string,args:(string|number|null)[],event:string,type:string,id:string){
 await env.DB.batch([statement(env.DB,query,...args),guard(env),activity(env,user,event,type,id),clearGuard(env)]);
}
type Scope={days:number,clientId?:string,marketCode?:string,portfolioId?:string};
function predicates(p:string,s:string,scope:Scope){
 const bits:string[]=[],values:string[]=[];
 if(scope.clientId){
  bits.push('EXISTS(SELECT 1 FROM v2_engagements e WHERE e.client_id=? AND e.property_id IS '+p+' AND e.scheme_id IS '+s+')');
  values.push(scope.clientId);
 }
 if(scope.marketCode){
  bits.push('EXISTS(SELECT 1 FROM v2_engagements e WHERE e.market_code=? AND e.property_id IS '+p+' AND e.scheme_id IS '+s+')');
  values.push(scope.marketCode);
 }
 if(scope.portfolioId){
  bits.push('EXISTS(SELECT 1 FROM v2_enterprise_portfolio_members m WHERE m.portfolio_id=? AND m.property_id IS '+p+' AND m.scheme_id IS '+s+')');
  values.push(scope.portfolioId);
 }
 return {sql:bits.length?bits.map(x=>'('+x+')').join(' AND '):'1=1',values};
}
async function summaryRows(env:Env,query:string,args:(string|number|null)[]){
 return (await statement(env.DB,query,...args).all()).results;
}
async function summaryOne(env:Env,query:string,args:(string|number|null)[]){
 return (await statement(env.DB,query,...args).first<Record<string,unknown>>())??{};
}
export async function liveMetrics(env:Env,scope:Scope){
 const generatedAt=now(),from=new Date(Date.now()-scope.days*86400000).toISOString();
 const w=predicates('w.property_id','w.scheme_id',scope);
 const a=predicates('a.property_id','a.scheme_id',scope);
 const e=predicates('e.property_id','e.scheme_id',scope);
 const today=generatedAt.slice(0,10),soon=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
 const [
   workOrders,taskStatuses,labour,externalCosts,assets,preventive,compliance,risks,capital,committed,sectorRollouts,monthlyWorkOrders,capacity
 ]=await Promise.all([
  summaryRows(env,'SELECT w.status,COUNT(*) AS count FROM work_orders w WHERE '+w.sql+' AND w.created_at>=? GROUP BY w.status ORDER BY w.status',[...w.values,from]),
  summaryRows(env,'SELECT t.status,COUNT(*) AS count,COALESCE(SUM(t.budget_ceiling_cents),0) AS budget_cents FROM v2_maintenance_tasks t JOIN work_orders w ON w.id=t.work_order_id WHERE '+w.sql+' AND t.created_at>=? GROUP BY t.status ORDER BY t.status',[...w.values,from]),
  summaryOne(env,"SELECT COALESCE(SUM(t.minutes),0) AS minutes,COALESCE(SUM(t.cost_cents),0) AS cost_cents,COUNT(*) AS records FROM v2_time_entries t JOIN v2_maintenance_tasks mt ON mt.id=t.task_id JOIN work_orders w ON w.id=mt.work_order_id WHERE "+w.sql+" AND t.status='approved' AND t.started_at>=?",[...w.values,from]),
  summaryOne(env,"SELECT COALESCE(SUM(c.amount_cents),0) AS cost_cents,COUNT(*) AS records FROM v2_external_costs c JOIN v2_maintenance_tasks mt ON mt.id=c.task_id JOIN work_orders w ON w.id=mt.work_order_id WHERE "+w.sql+" AND c.status='approved' AND c.created_at>=?",[...w.values,from]),
  summaryOne(env,"SELECT COUNT(*) AS assets,COALESCE(SUM(CASE WHEN d.criticality IN('high','critical') THEN 1 ELSE 0 END),0) AS high_critical,COALESCE(SUM(CASE WHEN d.lifecycle_status='out_of_service' THEN 1 ELSE 0 END),0) AS out_of_service,COALESCE(SUM(d.replacement_cost_cents),0) AS replacement_cents,ROUND(AVG(d.last_condition_score),2) AS mean_condition_score FROM v2_assets a LEFT JOIN v2_asset_details d ON d.asset_id=a.id WHERE "+a.sql,a.values),
  summaryOne(env,"SELECT COUNT(*) AS active_plans,COALESCE(SUM(CASE WHEN p.next_due<? THEN 1 ELSE 0 END),0) AS overdue,COALESCE(SUM(CASE WHEN p.next_due BETWEEN ? AND ? THEN 1 ELSE 0 END),0) AS due_soon FROM v2_preventive_plans p JOIN v2_engagements e ON e.id=p.engagement_id WHERE "+e.sql+" AND p.status='active'",[today,today,soon,...e.values]),
  summaryOne(env,"SELECT COUNT(*) AS tracked,COALESCE(SUM(CASE WHEN o.next_review_on<? THEN 1 ELSE 0 END),0) AS review_overdue,COALESCE(SUM(CASE WHEN NOT EXISTS(SELECT 1 FROM v2_compliance_evidence ce WHERE ce.obligation_id=o.id AND ce.status='verified' AND (ce.expires_on IS NULL OR ce.expires_on>=?)) THEN 1 ELSE 0 END),0) AS evidence_unverified_or_expired FROM v2_compliance_obligations o JOIN v2_engagements e ON e.id=o.engagement_id WHERE "+e.sql+" AND o.status='tracked'",[today,today,...e.values]),
  summaryOne(env,"SELECT COUNT(*) AS open_risks,COALESCE(SUM(CASE WHEN r.likelihood*r.impact>=16 THEN 1 ELSE 0 END),0) AS elevated FROM v2_asset_risks r JOIN v2_assets a ON a.id=r.asset_id WHERE "+a.sql+" AND r.status='open'",a.values),
  summaryOne(env,"SELECT COUNT(DISTINCT g.id) AS programmes,COALESCE(SUM(g.baseline_budget_cents),0) AS baseline_cents FROM v2_capital_programmes g JOIN v2_engagements e ON e.id=g.engagement_id WHERE "+e.sql+" AND g.status IN('approved','active','completed')",e.values),
  summaryOne(env,"SELECT COALESCE(SUM(c.proposed_cents),0) AS committed_cents FROM v2_capital_commitments c JOIN v2_capital_projects p ON p.id=c.project_id JOIN v2_capital_programmes g ON g.id=p.programme_id JOIN v2_engagements e ON e.id=g.engagement_id WHERE "+e.sql+" AND c.status='approved'",e.values),
  summaryRows(env,"SELECT p.market_code,r.status,COUNT(*) AS count FROM v2_sector_rollouts r JOIN v2_sector_packs p ON p.id=r.pack_id JOIN v2_engagements e ON e.id=r.engagement_id WHERE "+e.sql+" GROUP BY p.market_code,r.status ORDER BY p.market_code,r.status",e.values),
  summaryRows(env,"SELECT substr(w.created_at,1,7) AS month,COUNT(*) AS work_orders FROM work_orders w WHERE "+w.sql+" AND w.created_at>=? GROUP BY substr(w.created_at,1,7) ORDER BY month",[...w.values,from]),
  summaryOne(env,"SELECT COUNT(*) AS confirmed_allocations,COALESCE(SUM(ROUND((julianday(x.ends_at)-julianday(x.starts_at))*24*60)),0) AS allocated_minutes FROM v2_resource_allocations x JOIN v2_maintenance_tasks t ON t.id=x.task_id JOIN work_orders w ON w.id=t.work_order_id WHERE "+w.sql+" AND x.status='confirmed' AND x.starts_at>=?",[...w.values,from])
 ]);
 return {generatedAt,periodStart:from,periodEnd:generatedAt,scope,
  basis:'Actual recorded operations and reviewed costs only. Compliance indicators show review/evidence gaps, not statutory certification. Capital commitments are not paid amounts.',
  workOrders,taskStatuses,labour,externalCosts,assets,preventive,compliance,risks,
  capital:{...capital,...committed},sectorRollouts,monthlyWorkOrders,capacity};
}
export async function intelligenceData(env:Env,user:Principal,w:Workspace,query:URLSearchParams){
 staff(user,w);
 const days=span.parse(query.get('days')??'90');
 const statements=[
  'SELECT id,client_id,name,purpose,status FROM v2_enterprise_portfolios ORDER BY created_at DESC LIMIT 120',
  'SELECT id,portfolio_id,property_id,scheme_id FROM v2_enterprise_portfolio_members LIMIT 240',
  'SELECT g.id,g.engagement_id,g.title,g.baseline_budget_cents,g.status,g.version,g.authority_reference,e.market_code,e.client_id FROM v2_capital_programmes g JOIN v2_engagements e ON e.id=g.engagement_id ORDER BY g.created_at DESC LIMIT 150',
  'SELECT id,programme_id,asset_id,work_order_id,title,estimated_cents,status,scope_summary FROM v2_capital_projects ORDER BY created_at DESC LIMIT 150',
  'SELECT id,project_id,title,due_on,status FROM v2_capital_milestones ORDER BY due_on LIMIT 150',
  'SELECT id,project_id,category,proposed_cents,quotation_reference,status FROM v2_capital_commitments ORDER BY created_at DESC LIMIT 150',
  'SELECT id,project_id,revision,forecast_total_cents,recorded_at FROM v2_capital_forecasts ORDER BY recorded_at DESC LIMIT 150',
  'SELECT id,title,report_kind,client_id,market_code,portfolio_id,window_days,status FROM v2_saved_report_definitions ORDER BY created_at DESC LIMIT 100',
  'SELECT id,definition_id,period_start,period_end,generated_at FROM v2_report_snapshots ORDER BY generated_at DESC LIMIT 100',
  'SELECT id,source_kind,source_id,alert_code,severity,summary,due_on,status FROM v2_enterprise_alerts ORDER BY created_at DESC LIMIT 100',
  "SELECT id,reference,client_id,market_code FROM v2_engagements WHERE status='active' ORDER BY created_at DESC LIMIT 200",
  "SELECT id,name,property_id,scheme_id FROM v2_assets WHERE status='active' LIMIT 300",
  "SELECT id,name FROM contractors WHERE active=1 LIMIT 200",
  "SELECT id,name FROM clients WHERE status='active' LIMIT 250",
  "SELECT id,address,suburb FROM properties WHERE archived_at IS NULL LIMIT 250",
  "SELECT id,name FROM strata_schemes LIMIT 250"
 ];
 const names=['portfolios','members','programmes','projects','milestones','commitments','forecasts','reports','snapshots','alerts','engagements','assets','contractors','clients','properties','schemes'];
 const results=await Promise.all(statements.map(sql=>statement(env.DB,sql).all()));
 const data:Record<string,unknown>={summary:await liveMetrics(env,{days}),draftOnly:true};
 results.forEach((r,i)=>data[names[i]]=r.results);
 return data;
}
export async function intelligenceExport(env:Env,user:Principal,w:Workspace,query:URLSearchParams):Promise<Response>{
 staff(user,w);
 const days=span.parse(query.get('days')??'90');
 const m=await liveMetrics(env,{days});
 const rows:(string|number)[][]=[['metric','value'],['generated_at',m.generatedAt],['window_days',days]];
 for(const [area,obj] of Object.entries({labour:m.labour,externalCosts:m.externalCosts,assets:m.assets,
  preventive:m.preventive,compliance:m.compliance,risks:m.risks,capital:m.capital,capacity:m.capacity}))
  for(const [name,val] of Object.entries(obj as Record<string,unknown>))rows.push([area+'.'+name,String(val??'')]);
 for(const v of m.workOrders)rows.push(['work_order.'+String((v as any).status),String((v as any).count)]);
 const csv=rows.map(row=>row.map(cell=>'"'+String(cell).replaceAll('"','""').replace(/^[=+\-@\t]/,'')+'"').join(',')).join('\r\n');
 await env.DB.batch([activity(env,user,'v2.enterprise_report_exported','report-export',uid('v2export'))]);
 return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="proinspect-v2-operations.csv"','Cache-Control':'private, no-store'}});
}
export async function intelligenceCommand(env:Env,user:Principal,w:Workspace,path:string[],input:unknown){
 staff(user,w);
 const [area,id,operation]=path;
 if(area==='portfolios'&&!id){
  const d=z.object({clientId:recordId,name:shortText,purpose:reference,authorityReference:reference}).parse(input);
  const key=uid('v2portfolio');
  await env.DB.batch([statement(env.DB,
   'INSERT INTO v2_enterprise_portfolios(id,client_id,name,purpose,authority_reference,created_by,created_at) VALUES(?,?,?,?,?,?,?)',
   key,d.clientId,d.name,d.purpose,d.authorityReference,user.id,now()),
   activity(env,user,'v2.enterprise_portfolio_created','enterprise-portfolio',key)]);
  return {id:key};
 }
 if(area==='portfolio-members'&&!id){
  const d=z.object({portfolioId:recordId,propertyId:recordId.optional(),schemeId:recordId.optional(),authorityReference:reference}).parse(input);
  assert(Boolean(d.propertyId)!==Boolean(d.schemeId),422,'V2_PORTFOLIO_SCOPE_REQUIRED','Select one property or scheme.');
  const key=uid('v2portitem');
  await env.DB.batch([statement(env.DB,
   'INSERT INTO v2_enterprise_portfolio_members(id,portfolio_id,property_id,scheme_id,verified_by,authority_reference,added_at) VALUES(?,?,?,?,?,?,?)',
   key,d.portfolioId,d.propertyId??null,d.schemeId??null,user.id,d.authorityReference,now()),
   activity(env,user,'v2.portfolio_membership_verified','enterprise-portfolio-member',key)]);
  return {id:key};
 }
 if(area==='programmes'&&!id){
  const d=z.object({engagementId:recordId,title:shortText,purpose:reference,
   baselineBudgetCents:cash,plannedStart:dateOnly.optional(),plannedFinish:dateOnly.optional()}).parse(input);
  const engaged=await statement(env.DB,'SELECT id FROM v2_engagements WHERE id=? AND status=?',d.engagementId,'active').first();
  assert(engaged,409,'V2_CAPITAL_ENGAGEMENT_REQUIRED','Choose a verified active service engagement.');
  const key=uid('v2capital'),t=now();
  await env.DB.batch([statement(env.DB,
   'INSERT INTO v2_capital_programmes(id,engagement_id,title,purpose,baseline_budget_cents,planned_start,planned_finish,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
   key,d.engagementId,d.title,d.purpose,d.baselineBudgetCents,d.plannedStart??null,d.plannedFinish??null,user.id,t,t),
   activity(env,user,'v2.capital_programme_drafted','capital-programme',key)]);
  return {id:key};
 }
 if(area==='programmes'&&id&&operation==='state'){
  executive(user,w);
  const d=z.object({status:z.enum(['approved','active','completed','cancelled']),authorityReference:reference,version:z.coerce.number().int().positive()}).parse(input);
  await tx(env,user,'UPDATE v2_capital_programmes SET status=?,authority_reference=?,approved_by=?,approved_at=?,updated_at=?,version=version+1 WHERE id=? AND version=?',
   [d.status,d.authorityReference,user.id,now(),now(),id,d.version],
   'v2.capital_programme_state','capital-programme',id);
  return {id,status:d.status};
 }
 if(area==='projects'&&!id){
  const d=z.object({programmeId:recordId,assetId:assetId.optional(),workOrderId:recordId.optional(),
   title:shortText,scopeSummary:reference,estimatedCents:cash}).parse(input);
  const key=uid('v2project'),t=now();
  await env.DB.batch([statement(env.DB,
   'INSERT INTO v2_capital_projects(id,programme_id,asset_id,work_order_id,title,scope_summary,estimated_cents,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
   key,d.programmeId,d.assetId??null,d.workOrderId??null,d.title,d.scopeSummary,d.estimatedCents,user.id,t,t),
   activity(env,user,'v2.capital_project_drafted','capital-project',key)]);
  return {id:key};
 }
 if(area==='projects'&&id&&operation==='state'){
  executive(user,w);
  const d=z.object({status:z.enum(['approved','active','completed','cancelled']),authorityReference:reference}).parse(input);
  await tx(env,user,'UPDATE v2_capital_projects SET status=?,authority_reference=?,approved_by=?,approved_at=?,updated_at=? WHERE id=?',
   [d.status,d.authorityReference,user.id,now(),now(),id],
   'v2.capital_project_state','capital-project',id);
  return {id,status:d.status};
 }
 if(area==='milestones'&&!id){
  const d=z.object({projectId:recordId,title:shortText,dueOn:dateOnly}).parse(input);
  const key=uid('v2mile');
  await env.DB.batch([statement(env.DB,
   'INSERT INTO v2_capital_milestones(id,project_id,title,due_on,created_by,created_at) VALUES(?,?,?,?,?,?)',
   key,d.projectId,d.title,d.dueOn,user.id,now()),
   activity(env,user,'v2.capital_milestone_created','capital-milestone',key)]);
  return {id:key};
 }
 if(area==='milestones'&&id&&operation==='review'){
  const d=z.object({status:z.enum(['completed','deferred']),evidenceReference:reference}).parse(input);
  await tx(env,user,"UPDATE v2_capital_milestones SET status=?,evidence_reference=?,completed_by=?,completed_at=? WHERE id=? AND status='planned'",
    [d.status,d.evidenceReference,user.id,now(),id],'v2.capital_milestone_reviewed','capital-milestone',id);
  return {id,status:d.status};
 }
 if(area==='commitments'&&!id){
  const d=z.object({projectId:recordId,contractorId:recordId.optional(),
   category:z.enum(['works','materials','professional','contingency','other']),
   proposedCents:cash,quotationReference:reference}).parse(input);
  const key=uid('v2commit');
  await env.DB.batch([statement(env.DB,
   'INSERT INTO v2_capital_commitments(id,project_id,contractor_id,category,proposed_cents,quotation_reference,proposed_by,created_at) VALUES(?,?,?,?,?,?,?,?)',
   key,d.projectId,d.contractorId??null,d.category,d.proposedCents,d.quotationReference,user.id,now()),
   activity(env,user,'v2.capital_commitment_proposed','capital-commitment',key)]);
  return {id:key};
 }
 if(area==='commitments'&&id&&operation==='review'){
  executive(user,w);
  const d=z.object({status:z.enum(['approved','cancelled']),authorityReference:reference}).parse(input);
  await tx(env,user,"UPDATE v2_capital_commitments SET status=?,authority_reference=?,approved_by=?,approved_at=? WHERE id=? AND status='proposed'",
    [d.status,d.authorityReference,user.id,now(),id],'v2.capital_commitment_reviewed','capital-commitment',id);
  return {id,status:d.status};
 }
 if(area==='forecasts'&&!id){
  const d=z.object({projectId:recordId,revision:z.coerce.number().int().min(1).max(10000),
   forecastTotalCents:cash,rationale:reference,sourceReference:reference}).parse(input);
  const key=uid('v2forecast');
  await env.DB.batch([statement(env.DB,
   'INSERT INTO v2_capital_forecasts(id,project_id,revision,forecast_total_cents,rationale,source_reference,recorded_by,recorded_at) VALUES(?,?,?,?,?,?,?,?)',
   key,d.projectId,d.revision,d.forecastTotalCents,d.rationale,d.sourceReference,user.id,now()),
   activity(env,user,'v2.capital_forecast_recorded','capital-forecast',key)]);
  return {id:key};
 }
 if(area==='reports'&&!id){
  const d=z.object({title:shortText,reportKind:z.enum(['operations','assets','compliance','maintenance','sectors','capital']),
   clientId:recordId.optional(),marketCode:markets.optional(),portfolioId:recordId.optional(),
   windowDays:span}).parse(input);
  const key=uid('v2report');
  await env.DB.batch([statement(env.DB,
   'INSERT INTO v2_saved_report_definitions(id,title,report_kind,client_id,market_code,portfolio_id,window_days,owner_user_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
   key,d.title,d.reportKind,d.clientId??null,d.marketCode??null,d.portfolioId??null,d.windowDays,user.id,now()),
   activity(env,user,'v2.saved_report_created','report-definition',key)]);
  return {id:key};
 }
 if(area==='reports'&&id&&operation==='snapshot'){
  const r=await statement(env.DB,'SELECT * FROM v2_saved_report_definitions WHERE id=? AND status=?',id,'active').first<Record<string,any>>();
  assert(r,404,'V2_REPORT_NOT_FOUND','Saved report definition unavailable.');
  const metrics=await liveMetrics(env,{days:r.window_days,clientId:r.client_id??undefined,marketCode:r.market_code??undefined,portfolioId:r.portfolio_id??undefined});
  const key=uid('v2snapshot');
  await env.DB.batch([statement(env.DB,
   'INSERT INTO v2_report_snapshots(id,definition_id,period_start,period_end,metrics_json,created_by,generated_at) VALUES(?,?,?,?,?,?,?)',
   key,id,metrics.periodStart,metrics.periodEnd,JSON.stringify(metrics),user.id,now()),
   activity(env,user,'v2.enterprise_snapshot_created','report-snapshot',key)]);
  return {id:key,summary:metrics};
 }
 if(area==='alerts'&&!id){
  const d=z.object({sourceKind:z.enum(['asset','preventive','compliance','maintenance','capital','sector']),
   sourceId:assetId,alertCode:reference,severity:z.enum(['info','warning','critical']),
   summary:reference,dueOn:dateOnly.optional(),assignedStaffId:recordId.optional()}).parse(input);
  const key=uid('v2alert');
  await env.DB.batch([statement(env.DB,
   'INSERT INTO v2_enterprise_alerts(id,source_kind,source_id,alert_code,severity,summary,due_on,assigned_staff_id,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
   key,d.sourceKind,d.sourceId,d.alertCode,d.severity,d.summary,d.dueOn??null,d.assignedStaffId??null,user.id,now()),
   activity(env,user,'v2.enterprise_alert_opened','enterprise-alert',key)]);
  return {id:key};
 }
 if(area==='alerts'&&id&&operation==='state'){
  const d=z.object({status:z.enum(['acknowledged','resolved']),resolutionReference:reference.optional()}).parse(input);
  assert(d.status!=='resolved'||d.resolutionReference,422,'V2_ALERT_RESOLUTION_REQUIRED','Provide resolution evidence.');
  await tx(env,user,"UPDATE v2_enterprise_alerts SET status=?,resolution_reference=?,resolved_by=?,resolved_at=? WHERE id=? AND status IN('open','acknowledged')",
   [d.status,d.resolutionReference??null,d.status==='resolved'?user.id:null,d.status==='resolved'?now():null,id],
   'v2.enterprise_alert_reviewed','enterprise-alert',id);
  return {id,status:d.status};
 }
 assert(false,404,'V2_INTELLIGENCE_OPERATION_UNKNOWN','Enterprise action unavailable.');
}
