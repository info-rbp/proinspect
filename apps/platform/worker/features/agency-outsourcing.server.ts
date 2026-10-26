import { z } from 'zod';
import { assert,now,statement,uid,type Env } from '../../../../packages/database/types';
import { operationsWrite,clientAdmin,approvedProfessionalPortfolio,propertyAccess,propertiesFor } from '../../../../packages/authorization/server';
import type { Principal,Workspace } from '../../../../packages/domain/index';
import { activity } from '../../../../packages/operations/core';
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const ref=z.string().trim().min(4).max(500);
const cents=z.number().int().min(0).max(100000000);
const isAgency=(w:Workspace)=>assert(w.kind==='property-manager',403,'AGENCY_REQUIRED','Use the Property Manager workspace.');
async function agencyAdmin(env:Env,user:Principal,w:Workspace){
 isAgency(w); await clientAdmin(env,user,w);
 assert(await approvedProfessionalPortfolio(env,w),403,'AGENCY_NOT_APPROVED','A reviewed agency account is required.');
}
export async function ownerView(env:Env,user:Principal){
 const rows=(await statement(env.DB,`SELECT g.id,g.property_id,g.allow_inspections,g.allow_reports,
 p.address,p.suburb,p.postcode,c.name AS agency_name,g.agency_client_id
 FROM agency_owner_grants g
 JOIN properties p ON p.id=g.property_id AND p.archived_at IS NULL
 JOIN clients c ON c.id=g.agency_client_id AND c.client_type='agency' AND c.status='active'
 JOIN client_entitlements ce ON ce.client_id=c.id AND ce.workspace_kind='property-manager' AND ce.active=1 AND ce.approved_by IS NOT NULL
 JOIN property_management_relationships m ON m.id=g.management_id AND m.property_id=g.property_id AND m.manager_client_id=g.agency_client_id
 WHERE g.owner_user_id=? AND g.revoked_at IS NULL
 AND m.mode='agency_managed' AND m.starts_at<=? AND (m.ends_at IS NULL OR m.ends_at>?)
 ORDER BY p.address LIMIT 200`,user.id,now(),now()).all<any>()).results;
 const properties=[];
 for(const g of rows){
 const inspections=g.allow_inspections?(await statement(env.DB,`SELECT b.reference,b.starts_at,b.status,s.name AS service
 FROM bookings b JOIN services s ON s.id=b.service_id
 WHERE b.client_id=? AND b.property_id=? ORDER BY b.starts_at DESC LIMIT 30`,g.agency_client_id,g.property_id).all()).results:[];
 const reports=g.allow_reports?(await statement(env.DB,`SELECT d.id,d.title,d.issued_at
 FROM documents d JOIN agency_owner_report_shares sh ON sh.document_id=d.id AND sh.grant_id=?
 JOIN document_grants dg ON dg.document_id=d.id AND dg.recipient_kind='client' AND dg.recipient_id=?
 WHERE d.property_id=? AND d.status='issued' AND d.category IN('service_report','property_condition_report')
 ORDER BY d.issued_at DESC LIMIT 30`,g.id,g.agency_client_id,g.property_id).all()).results:[];
 properties.push({propertyId:g.property_id,address:g.address,suburb:g.suburb,postcode:g.postcode,agencyName:g.agency_name,inspections,reports});
 } return {properties};
}
export async function ownerReportDownload(env:Env,user:Principal,documentId:string){
 const d=await statement(env.DB,`SELECT d.id,d.object_key,d.content_type,d.property_id FROM documents d
 JOIN agency_owner_report_shares sh ON sh.document_id=d.id
 JOIN agency_owner_grants g ON g.id=sh.grant_id AND g.owner_user_id=? AND g.revoked_at IS NULL AND g.allow_reports=1
 JOIN property_management_relationships m ON m.id=g.management_id AND m.property_id=g.property_id AND m.manager_client_id=g.agency_client_id
 JOIN clients c ON c.id=g.agency_client_id AND c.status='active' AND c.client_type='agency'
 JOIN client_entitlements ce ON ce.client_id=c.id AND ce.workspace_kind='property-manager' AND ce.active=1 AND ce.approved_by IS NOT NULL
 JOIN document_grants dg ON dg.document_id=d.id AND dg.recipient_kind='client' AND dg.recipient_id=g.agency_client_id
 WHERE d.id=? AND d.property_id=g.property_id AND d.status='issued' AND d.category IN('service_report','property_condition_report')
 AND m.mode='agency_managed' AND m.starts_at<=? AND (m.ends_at IS NULL OR m.ends_at>?) LIMIT 1`,
 user.id,documentId,now(),now()).first<{id:string;object_key:string;content_type:string;property_id:string}>();
 assert(d,404,'REPORT_UNAVAILABLE','This report is not available.');
 const file=await env.DOCUMENTS.get(d.object_key);
 assert(file,404,'REPORT_UNAVAILABLE','This report is unavailable.');
 await activity(env,user,'agency.owner_report_downloaded','document',d.id,d.property_id).run();
 return new Response(file.body,{headers:{'Content-Type':d.content_type,'Content-Disposition':'attachment; filename="ProInspect-report.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}
export async function agencyDashboard(env:Env,user:Principal,w:Workspace){
 isAgency(w);const properties=await propertiesFor(env,user,w);
 const ids=properties.map(p=>p.id);
 const works=ids.length?(await statement(env.DB,`SELECT wo.id,wo.reference,wo.title,wo.status,p.address FROM work_orders wo JOIN properties p ON p.id=wo.property_id WHERE wo.client_id=? AND wo.property_id IN (${ids.map(()=>'?').join(',')}) ORDER BY wo.updated_at DESC LIMIT 80`,w.scopeId,...ids).all()).results:[];
 const plans=ids.length?(await statement(env.DB,`SELECT r.id,r.next_due,s.name AS service,p.address FROM recurring_plans r JOIN properties p ON p.id=r.property_id JOIN services s ON s.id=r.service_id WHERE r.client_id=? AND r.status='active' AND r.property_id IN (${ids.map(()=>'?').join(',')}) ORDER BY r.next_due LIMIT 50`,w.scopeId,...ids).all()).results:[];
 const agreements=(await statement(env.DB,"SELECT reference,tier,pricing_model,base_monthly_cents,status FROM agency_commercial_agreements WHERE client_id=? AND status IN('approved','ended') ORDER BY created_at DESC LIMIT 30",w.scopeId).all()).results;
 const statements=(await statement(env.DB,`SELECT s.period,s.total_cents,s.status FROM agency_monthly_statements s JOIN agency_commercial_agreements a ON a.id=s.agreement_id WHERE a.client_id=? AND s.status='approved' ORDER BY s.period DESC LIMIT 24`,w.scopeId).all()).results;
 return {properties:properties.map(p=>({id:p.id,address:p.address})),works,plans,agreements,statements};
}
export async function agencyAdminCommand(env:Env,user:Principal,w:Workspace,command:string,input:unknown){
 await agencyAdmin(env,user,w);
 if(command==='revoke'){
 const d=z.object({grantId:id}).parse(input);
 const grant=await statement(env.DB,"SELECT id,property_id FROM agency_owner_grants WHERE id=? AND agency_client_id=? AND revoked_at IS NULL",d.grantId,w.scopeId).first<{id:string;property_id:string}>();
 assert(grant,404,'GRANT_NOT_FOUND','Grant not found.');
 await env.DB.batch([statement(env.DB,"UPDATE agency_owner_grants SET revoked_at=? WHERE id=? AND revoked_at IS NULL",now(),d.grantId),activity(env,user,'agency.owner_access_revoked','agency_owner_grant',d.grantId,grant.property_id)]);return {ok:true};
 }
 if(command==='share-report'){
 const d=z.object({grantId:id,documentId:id}).parse(input);
 const grant=await statement(env.DB,"SELECT * FROM agency_owner_grants WHERE id=? AND agency_client_id=? AND revoked_at IS NULL AND allow_reports=1",d.grantId,w.scopeId).first<any>();
 assert(grant,403,'GRANT_FORBIDDEN','Report permission is not active.');
 await propertyAccess(env,user,w,grant.property_id,true);
 const manager=await statement(env.DB,"SELECT id FROM property_management_relationships WHERE id=? AND property_id=? AND manager_client_id=? AND mode='agency_managed' AND starts_at<=? AND (ends_at IS NULL OR ends_at>?)",grant.management_id,grant.property_id,w.scopeId,now(),now()).first();
 assert(manager,403,'MANAGEMENT_ENDED','The appointment has ended.');
 const document=await statement(env.DB,`SELECT d.id FROM documents d JOIN document_grants dg ON dg.document_id=d.id AND dg.recipient_kind='client' AND dg.recipient_id=? WHERE d.id=? AND d.property_id=? AND d.status='issued' AND d.category IN('service_report','property_condition_report')`,w.scopeId,d.documentId,grant.property_id).first();
 assert(document,403,'DOCUMENT_FORBIDDEN','Only expressly issued agency reports may be shared.');
 await env.DB.batch([statement(env.DB,"INSERT INTO agency_owner_report_shares(grant_id,document_id,shared_by,shared_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING",d.grantId,d.documentId,user.id,now()),activity(env,user,'agency.owner_report_shared','document',d.documentId,grant.property_id)]);return {ok:true};
 }
 assert(false,404,'ACTION_UNKNOWN','Unknown agency action.');
}
export async function staffAgencyCommand(env:Env,user:Principal,command:string,input:unknown){
 operationsWrite(user);
 if(command==='grant-owner'){
 const d=z.object({agencyClientId:id,propertyId:id,ownerUserId:id,authorityReference:ref,allowInspections:z.boolean(),allowReports:z.boolean()}).parse(input);
 const owner=await statement(env.DB,"SELECT id FROM users WHERE id=? AND verified_at IS NOT NULL AND active=1",d.ownerUserId).first();
 assert(owner,422,'OWNER_NOT_VERIFIED','A verified owner identity is required.');
 const manager=await statement(env.DB,`SELECT m.id FROM property_management_relationships m JOIN clients c ON c.id=m.manager_client_id AND c.client_type='agency' AND c.status='active'
 JOIN client_entitlements e ON e.client_id=c.id AND e.workspace_kind='property-manager' AND e.active=1 AND e.approved_by IS NOT NULL
 WHERE m.manager_client_id=? AND m.property_id=? AND m.mode='agency_managed' AND m.starts_at<=? AND (m.ends_at IS NULL OR m.ends_at>?)`,d.agencyClientId,d.propertyId,now(),now()).first<{id:string}>();
 assert(manager,403,'AGENCY_AUTHORITY_REQUIRED','Verify an active agency management appointment.');
 const grantId=uid('ag');
 await env.DB.batch([statement(env.DB,`INSERT INTO agency_owner_grants(id,agency_client_id,property_id,management_id,owner_user_id,verified_by,authority_reference,allow_inspections,allow_reports,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,grantId,d.agencyClientId,d.propertyId,manager.id,d.ownerUserId,user.id,d.authorityReference,+d.allowInspections,+d.allowReports,now()),activity(env,user,'agency.owner_granted','agency_owner_grant',grantId,d.propertyId)]);
 return {grantId};
 }
 if(command==='draft-agreement'){
 const d=z.object({clientId:id,reference:ref,tier:z.enum(['50_149','150_499','500_1000','custom']),pricingModel:z.enum(['per_service','retainer','hybrid']),baseMonthlyCents:cents,gstBasisPoints:z.number().int().min(0).max(10000),effectiveAt:z.string().datetime({offset:true})}).parse(input);
 const approved=await statement(env.DB,`SELECT c.id FROM clients c JOIN client_entitlements e ON e.client_id=c.id AND e.workspace_kind='property-manager' AND e.active=1 AND e.approved_by IS NOT NULL WHERE c.id=? AND c.client_type='agency' AND c.status='active'`,d.clientId).first();
 assert(approved,422,'AGENCY_NOT_APPROVED','Select an approved agency.');
 const key=uid('aa');await env.DB.batch([statement(env.DB,`INSERT INTO agency_commercial_agreements(id,client_id,reference,tier,pricing_model,base_monthly_cents,gst_basis_points,effective_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,key,d.clientId,d.reference,d.tier,d.pricingModel,d.baseMonthlyCents,d.gstBasisPoints,d.effectiveAt,user.id,now()),activity(env,user,'agency.agreement_drafted','agency_commercial_agreement',key)]);return {id:key,status:'draft'};
 }
 if(command==='set-rate'){
 const d=z.object({agreementId:id,serviceId:id,rateCents:cents,included:z.boolean()}).parse(input);
 assert(d.included?d.rateCents===0:d.rateCents>0,422,'RATE_INVALID','Included services cost zero extra; chargeable services need a positive approved rate.');
 const draft=await statement(env.DB,"SELECT id FROM agency_commercial_agreements WHERE id=? AND status='draft'",d.agreementId).first();
 assert(draft,409,'AGREEMENT_LOCKED','Only draft rates may change.');
 const svc=await statement(env.DB,"SELECT id FROM services WHERE id=? AND active=1",d.serviceId).first();assert(svc,422,'SERVICE_INVALID','Select a valid service.');
 await statement(env.DB,"INSERT INTO agency_contract_rates(agreement_id,service_id,rate_cents,included) VALUES(?,?,?,?) ON CONFLICT(agreement_id,service_id) DO UPDATE SET rate_cents=excluded.rate_cents,included=excluded.included",d.agreementId,d.serviceId,d.rateCents,+d.included).run();return {ok:true};
 }
 if(command==='approve-agreement'){
 const d=z.object({agreementId:id,approvalReference:ref}).parse(input);
 const row=await statement(env.DB,"SELECT * FROM agency_commercial_agreements WHERE id=? AND status='draft'",d.agreementId).first<any>();
 assert(row,409,'AGREEMENT_LOCKED','Agreement is not a draft.');
 assert(row.created_by!==user.id,403,'INDEPENDENT_REVIEW','A different authorised Staff member must approve.');
 const properties=await statement(env.DB,`SELECT COUNT(DISTINCT property_id) AS n FROM property_management_relationships
    WHERE manager_client_id=? AND mode='agency_managed' AND starts_at<=? AND (ends_at IS NULL OR ends_at>?)`,
    row.client_id,now(),now()).first<{n:number}>();
 const quantity=properties?.n??0;
 const band=quantity>=50&&quantity<150?'50_149':quantity>=150&&quantity<500?'150_499':quantity>=500&&quantity<=1000?'500_1000':'custom';
 assert(row.tier===band,409,'AGENCY_BAND_MISMATCH','Update the draft to the verified portfolio band before approving.');
 assert(row.pricing_model==='per_service'||row.base_monthly_cents>0,422,'BASE_FEE_REQUIRED','A retainer or hybrid agreement requires a positive approved monthly fee.');
 const overlap=await statement(env.DB,`SELECT id FROM agency_commercial_agreements WHERE client_id=? AND id!=? AND status='approved'`,
 row.client_id,d.agreementId).first();
 assert(!overlap,409,'AGREEMENT_OVERLAP','End or reconcile the existing approved commercial contract first.');
 const count=await statement(env.DB,"SELECT COUNT(*) AS n FROM agency_contract_rates WHERE agreement_id=?",d.agreementId).first<{n:number}>();
 assert((count?.n??0)>0,422,'RATES_REQUIRED','At least one contract service must be reviewed.');
 await env.DB.batch([statement(env.DB,"UPDATE agency_commercial_agreements SET status='approved',approved_by=?,approval_reference=? WHERE id=? AND status='draft'",user.id,d.approvalReference,d.agreementId),activity(env,user,'agency.agreement_approved','agency_commercial_agreement',d.agreementId)]);return {status:'approved'};
 }
 assert(false,404,'ACTION_UNKNOWN','Unknown Staff agency action.');
}

export async function agencyBillingCommand(env:Env,user:Principal,command:string,input:unknown){
 operationsWrite(user);
 if(command==='record-work'){
  const d=z.object({agreementId:id,workOrderId:id}).parse(input);
  const w=await statement(env.DB,`SELECT wo.id,wo.client_id,wo.property_id,wo.updated_at,b.service_id
    FROM work_orders wo JOIN bookings b ON b.id=wo.booking_id
    WHERE wo.id=? AND wo.status='completed' AND wo.client_id IS NOT NULL AND wo.property_id IS NOT NULL`,d.workOrderId).first<any>();
  assert(w,422,'COMPLETED_WORK_REQUIRED','Choose a completed agency booking.');
  const agreement=await statement(env.DB,`SELECT a.id,r.rate_cents,r.included FROM agency_commercial_agreements a
    JOIN agency_contract_rates r ON r.agreement_id=a.id AND r.service_id=?
    WHERE a.id=? AND a.client_id=? AND a.status='approved' AND a.effective_at<=?`,
    w.service_id,d.agreementId,w.client_id,w.updated_at).first<any>();
  assert(agreement&&!agreement.included&&agreement.rate_cents>0,422,'CHARGEABLE_RATE_REQUIRED','A signed, approved service charge must exist.');
  const management=await statement(env.DB,`SELECT id FROM property_management_relationships WHERE property_id=? AND manager_client_id=? AND mode='agency_managed'
    AND starts_at<=? AND (ends_at IS NULL OR ends_at>?)`,w.property_id,w.client_id,w.updated_at,w.updated_at).first();
  assert(management,403,'MANAGEMENT_REQUIRED','The agency was not appointed when the work was completed.');
  const eventId=uid('ab');
  await env.DB.batch([statement(env.DB,`INSERT INTO agency_billable_work(id,agreement_id,work_order_id,property_id,service_id,charge_cents,completed_at,recorded_by)
    VALUES(?,?,?,?,?,?,?,?)`,eventId,d.agreementId,w.id,w.property_id,w.service_id,agreement.rate_cents,w.updated_at,user.id),
    activity(env,user,'agency.billable_work_recorded','agency_billable_work',eventId,w.property_id)]);
  return {id:eventId,chargeCents:agreement.rate_cents};
 }
 if(command==='prepare-statement'){
  const d=z.object({agreementId:id,period:z.string().regex(/^20\d\d-(0[1-9]|1[0-2])$/)}).parse(input);
  const a=await statement(env.DB,"SELECT * FROM agency_commercial_agreements WHERE id=? AND status='approved'",d.agreementId).first<any>();
  assert(a,422,'APPROVED_AGREEMENT_REQUIRED','Choose an approved agreement.');
  const start=d.period+'-01T00:00:00.000Z',year=Number(d.period.slice(0,4)),m=Number(d.period.slice(5,7));
  const end=new Date(Date.UTC(year,m,1)).toISOString();
  assert(end<=now(),422,'MONTH_NOT_CLOSED','Statements require a completed calendar month.');
  assert(a.effective_at<=start,422,'PARTIAL_MONTH_REVIEW_REQUIRED','A partial-month retainer requires separately reviewed proration.');
  const existing=await statement(env.DB,"SELECT id,status FROM agency_monthly_statements WHERE agreement_id=? AND period=?",d.agreementId,d.period).first();
  if(existing)return existing;
  const rows=(await statement(env.DB,`SELECT bw.id,bw.property_id,bw.charge_cents,wo.reference FROM agency_billable_work bw
    JOIN work_orders wo ON wo.id=bw.work_order_id WHERE bw.agreement_id=? AND bw.completed_at>=? AND bw.completed_at<?
    AND NOT EXISTS(SELECT 1 FROM agency_statement_lines sl WHERE sl.billable_work_id=bw.id)
    ORDER BY bw.completed_at,bw.id`,d.agreementId,start,end).all<any>()).results;
  const retainer=a.pricing_model==='per_service'?0:a.base_monthly_cents;
  const subtotal=retainer+rows.reduce((t:number,r:any)=>t+r.charge_cents,0);
  assert(Number.isSafeInteger(subtotal)&&subtotal<=100000000,422,'INVOICE_AMOUNT_INVALID','Statement exceeds approved limits.');
  const gst=Math.round(subtotal*a.gst_basis_points/10000),key=uid('ast');
  await env.DB.batch([
    statement(env.DB,`INSERT INTO agency_monthly_statements(id,agreement_id,period,subtotal_cents,gst_cents,total_cents,prepared_by,created_at) VALUES(?,?,?,?,?,?,?,?)`,key,d.agreementId,d.period,subtotal,gst,subtotal+gst,user.id,now()),
    ...(retainer?[statement(env.DB,`INSERT INTO agency_statement_lines(id,statement_id,description,amount_cents) VALUES(?,?,?,?)`,uid('asl'),key,'Monthly approved contractual base',retainer)]:[]),
    ...rows.map((r:any)=>statement(env.DB,`INSERT INTO agency_statement_lines(id,statement_id,billable_work_id,property_id,description,amount_cents) VALUES(?,?,?,?,?,?)`,uid('asl'),key,r.id,r.property_id,'Completed Work Order '+r.reference,r.charge_cents)),
    activity(env,user,'agency.statement_prepared','agency_monthly_statement',key)
  ]);
  return {id:key,status:'draft',subtotalCents:subtotal,gstCents:gst,totalCents:subtotal+gst};
 }
 if(command==='approve-statement'){
  const d=z.object({statementId:id,reviewReference:ref}).parse(input);
  const row=await statement(env.DB,"SELECT prepared_by,status FROM agency_monthly_statements WHERE id=?",d.statementId).first<any>();
  assert(row&&row.status==='draft',409,'STATEMENT_LOCKED','Statement is not a draft.');
  assert(row.prepared_by!==user.id,403,'INDEPENDENT_REVIEW','A different Staff reviewer must approve this statement.');
  await env.DB.batch([statement(env.DB,"UPDATE agency_monthly_statements SET status='approved',approved_by=? WHERE id=? AND status='draft'",user.id,d.statementId),
    activity(env,user,'agency.statement_approved','agency_monthly_statement',d.statementId,null,null,{reference:d.reviewReference})]);
  return {id:d.statementId,status:'approved',sent:false,paid:false};
 }
 assert(false,404,'ACTION_UNKNOWN','Unknown agency billing command.');
}
export async function agencyStaffOverview(env:Env,user:Principal){
 operationsWrite(user);
 const [agencies,agreements,services,works,statements]=await Promise.all([
 statement(env.DB,`SELECT c.id,c.name FROM clients c JOIN client_entitlements e ON e.client_id=c.id AND e.workspace_kind='property-manager' AND e.active=1 AND e.approved_by IS NOT NULL WHERE c.client_type='agency' AND c.status='active' ORDER BY c.name`).all(),
 statement(env.DB,'SELECT * FROM agency_commercial_agreements ORDER BY created_at DESC LIMIT 100').all(),
 statement(env.DB,"SELECT id,name FROM services WHERE active=1 ORDER BY name").all(),
 statement(env.DB,"SELECT w.id,w.reference,w.title,w.client_id FROM work_orders w JOIN clients c ON c.id=w.client_id WHERE c.client_type='agency' AND w.status='completed' ORDER BY w.updated_at DESC LIMIT 100").all(),
 statement(env.DB,'SELECT * FROM agency_monthly_statements ORDER BY created_at DESC LIMIT 100').all()]);
 return {agencies:agencies.results,agreements:agreements.results,services:services.results,works:works.results,statements:statements.results};
}
