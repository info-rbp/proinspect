import { now, statement, type Env } from '../../../../packages/database/types';
import { mailEvent } from '../../../../packages/notifications/server';

/**
 * No case contents leave this notifier. A verified receipt is required first.
 * This is an operational reminder, NOT automated statutory service, rejection
 * or approval; staff/legal review determines any statutory effects of lateness.
 */
export async function dispatchWaResidentialReminders(env:Env){
 const clock=now();
 const horizon=new Date(Date.now()+48*3600000).toISOString();
 const rows=(await statement(env.DB,`
 SELECT f.id,f.tenancy_id,f.form_code,f.due_at,
    m.user_id,u.email,e.workspace_kind,pm.manager_client_id AS client_id
 FROM wa_residential_form_cases f
 JOIN properties p ON p.id=f.property_id AND p.sector='residential'
 JOIN property_management_relationships pm ON pm.property_id=f.property_id AND pm.ends_at IS NULL
 JOIN client_memberships m ON m.client_id=pm.manager_client_id AND m.active=1 AND m.role IN('owner','admin')
 JOIN users u ON u.id=m.user_id AND u.active=1
 JOIN clients c ON c.id=pm.manager_client_id AND c.status='active'
 JOIN client_entitlements e ON e.client_id=c.id AND e.active=1 AND e.workspace_kind IN('landlord','property-manager')
 WHERE f.form_code IN('WA_FORM_25','WA_FORM_26')
   AND f.received_at IS NOT NULL AND f.due_at IS NOT NULL AND f.due_at<=?
   AND f.decision_status IS NULL
   AND f.status IN('submitted','under_review','approved','document_issued')
 ORDER BY f.due_at,f.id LIMIT 75`,
 horizon).all<{
   id:string;tenancy_id:string;form_code:string;due_at:string;
   user_id:string;email:string;workspace_kind:string;client_id:string;
 }>()).results;
 let sent=0;
 for(const item of rows){
  const phase=item.due_at<=clock?'overdue':'due_soon';
  const exists=await statement(env.DB,
   'SELECT 1 AS n FROM wa_residential_form_reminders WHERE case_id=? AND phase=? AND user_id=?',
   item.id,phase,item.user_id).first();
  if(exists)continue;
  const id=`wa_due_${item.id}_${phase}_${item.user_id}`;
  const href=`${env.APP_ORIGIN}/w/${item.workspace_kind}/${item.client_id}/tenancies/${item.tenancy_id}/wa-forms`;
  const body=phase==='overdue'
   ? 'A recorded response window has elapsed. Check the legally applicable outcome and obtain review before taking further action.'
   : 'An active residential tenancy request has an upcoming recorded response deadline. Review the original request and its legal timing.';
  await env.DB.batch([
   statement(env.DB,
    'INSERT OR IGNORE INTO wa_residential_form_reminders(case_id,phase,user_id,sent_at) VALUES(?,?,?,?)',
    item.id,phase,item.user_id,clock),
   statement(env.DB,
    'INSERT OR IGNORE INTO notifications(id,user_id,title,message,href,created_at) VALUES(?,?,?,?,?,?)',
    id,item.user_id,'Tenancy form response review',body,href.replace(env.APP_ORIGIN,''),clock),
   await mailEvent(env,'wa_form.advisory_reminder',{
    to:item.email,subject:'Residential tenancy form requires review',
    heading:'Review a tenancy form',body,
    href,sensitive:true,
   },id),
  ]);
  sent++;
 }
 return {considered:rows.length,notificationsQueued:sent,legalEffectDetermined:false};
}
