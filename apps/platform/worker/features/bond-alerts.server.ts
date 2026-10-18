import { now, statement, uid, type Env } from '../../../../packages/database/types';
import { mailEvent } from '../../../../packages/notifications/server';
/**
 * Idempotent safe summaries only. Never include bond amounts, claims, estate
 * evidence or family violence details in an out-of-band notification.
 * A government response deadline must come from the actual recorded notice.
 */
export async function dispatchBondAlerts(env:Env) {
 const instant=now(), soon=new Date(Date.now()+72*3600000).toISOString();
 const rows=(await statement(env.DB,`
 SELECT d.id,d.kind,d.due_at,b.tenancy_id,b.property_id,b.id as bond_id,
  c.id as client_id,u.id as user_id,u.email
 FROM bond_deadlines d
 JOIN bonds b ON b.id=d.bond_id
 JOIN property_management_relationships m ON m.property_id=b.property_id
  AND m.starts_at<=? AND (m.ends_at IS NULL OR m.ends_at>?)
 JOIN clients c ON c.id=m.manager_client_id AND c.status='active'
 JOIN client_memberships cm ON cm.client_id=c.id AND cm.active=1 AND cm.role IN ('owner','admin')
 JOIN users u ON u.id=cm.user_id AND u.active=1
 WHERE d.completed_at IS NULL AND d.due_at<=?
 ORDER BY d.due_at LIMIT 75
 `,instant,instant,soon).all<{
 id:string;kind:string;due_at:string;tenancy_id:string;property_id:string;
 bond_id:string;client_id:string;user_id:string;email:string
 }>()).results;
 for(const row of rows){
  const phase=row.due_at<instant?'overdue':'approaching';
  const found=await statement(env.DB,'SELECT 1 FROM bond_alert_dispatches WHERE deadline_id=? AND user_id=? AND phase=?',
    row.id,row.user_id,phase).first();
  if(found)continue;
  const workspace=await statement(env.DB,`SELECT workspace_kind FROM client_entitlements
     WHERE client_id=? AND active=1 AND workspace_kind IN('landlord','property-manager')
     ORDER BY CASE workspace_kind WHEN 'landlord' THEN 0 ELSE 1 END LIMIT 1`,row.client_id)
   .first<{workspace_kind:string}>();
  if(!workspace)continue;
  const eventId=uid('evt');
  const actionHref=`/w/${workspace.workspace_kind}/${row.client_id}/tenancies/${row.tenancy_id}/bonds`;
  const label=phase==='overdue'?'past its recorded deadline':'approaching its recorded deadline';
  const notice=await mailEvent(env,'bond.deadline',{
   to:row.email,subject:'ProInspect bond action requires attention',
   heading:'Review a bond deadline',body:`A bond action is ${label}. Review the official requirements and supporting records in your authorised workspace.`,
   href:env.APP_ORIGIN+actionHref,
   sensitive:true
  },eventId);
  try {
    await env.DB.batch([
      statement(env.DB,'INSERT INTO bond_alert_dispatches(deadline_id,user_id,phase,created_at) VALUES(?,?,?,?)',
        row.id,row.user_id,phase,instant),
      statement(env.DB,'INSERT INTO notifications(id,user_id,title,message,href,created_at) VALUES(?,?,?,?,?,?)',
        uid('ntf'),row.user_id,'Bond action needs attention',`A bond deadline is ${label}. Verify the official government notice or receipt.`,actionHref,instant),
      notice,
    ]);
  } catch(e) {
    // Another cron invocation may have delivered the same alert first.
    if(!String(e).includes('UNIQUE'))throw e;
  }
 }
 return {eligible:rows.length};
}
