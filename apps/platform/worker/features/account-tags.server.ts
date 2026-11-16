import { z } from 'zod';
import type { Env } from '../../../../packages/database/types';
import { assert, statement, now, uid } from '../../../../packages/database/types';
import type { Principal } from '../../../../packages/domain/index';
import { ACCOUNT_EXPERIENCE_TAGS } from '../../../../packages/domain/portal-experience';
import { operationsWrite } from '../../../../packages/authorization/server';

export async function getAccountTagDirectory(env: Env, user: Principal) {
  operationsWrite(user);
  const clients=(await statement(env.DB,
    "SELECT id,name,client_type FROM clients WHERE status='active' ORDER BY name,id LIMIT 300",
  ).all<{id:string;name:string;client_type:string}>()).results;
  const tags=(await statement(env.DB,
    'SELECT client_id,tag FROM account_experience_tags ORDER BY client_id,tag',
  ).all<{client_id:string;tag:string}>()).results;
  return {clients:clients.map(c=>({...c,tags:tags.filter(t=>t.client_id===c.id).map(t=>t.tag)}))};
}

/** Labels influence navigation and content only; never grant an entitlement or portal role. */
export async function changeAccountTag(env: Env,user: Principal,input: unknown) {
  operationsWrite(user);
  const data=z.object({
    clientId:z.string().min(4).max(100).regex(/^[a-zA-Z0-9_-]+$/),
    tag:z.enum(ACCOUNT_EXPERIENCE_TAGS),
    action:z.enum(['add','remove']),
    reference:z.string().trim().min(8).max(300),
  }).parse(input);
  const client=await statement(env.DB,'SELECT id FROM clients WHERE id=? AND status=\'active\'',data.clientId).first();
  assert(client,404,'CLIENT_NOT_FOUND','Account not found.');
  const timestamp=now();
  await env.DB.batch([
    ...(data.action==='add' ? [statement(env.DB,
      'INSERT OR IGNORE INTO account_experience_tags(client_id,tag,set_by,created_at) VALUES(?,?,?,?)',
      data.clientId,data.tag,user.id,timestamp)] : [statement(env.DB,
      'DELETE FROM account_experience_tags WHERE client_id=? AND tag=?',data.clientId,data.tag)]),
    statement(env.DB,
      'INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)',
      uid('aud'),user.id,'account.experience_tag_'+data.action,'client',data.clientId,
      JSON.stringify({tag:data.tag,reference:data.reference,permissionChange:false}),timestamp),
  ]);
  return {ok:true,message:'Presentation tag updated; existing roles, authority and billing entitlements are unchanged.'};
}
