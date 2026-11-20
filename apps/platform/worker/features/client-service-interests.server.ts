import { z } from 'zod';
import type { Env } from '../../../../packages/database/types';
import { assert, statement, now } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { clientMembership } from '../../../../packages/authorization/server';
import { activity } from '../../../../packages/operations/core';

export const SERVICE_AREAS = ['residential','commercial','strata','co-living','construction','leasing','maintenance'] as const;
export type ServiceArea = (typeof SERVICE_AREAS)[number];
export async function serviceInterestTableReady(env:Env) {
 const row=await statement(env.DB,"SELECT name FROM sqlite_master WHERE type='table' AND name='client_service_interests'").first();
 return Boolean(row);
}
export async function clientServiceInterests(env:Env, user:Principal, clientId:string) {
 await clientMembership(env,user,clientId);
 if(!await serviceInterestTableReady(env))return {ready:false,areas:[] as ServiceArea[]};
 const rows=await statement(env.DB,
   'SELECT service_area FROM client_service_interests WHERE client_id=? ORDER BY service_area',clientId
 ).all<{service_area:ServiceArea}>();
 return {ready:true,areas:rows.results.map(r=>r.service_area)};
}
export async function setClientServiceInterest(env:Env,user:Principal,clientId:string,input:unknown) {
 const member=await clientMembership(env,user,clientId,true);
 assert(['owner','admin'].includes(member.role),403,'ACCOUNT_ADMIN_REQUIRED','Account administrator access is required.');
 const d=z.object({area:z.enum(SERVICE_AREAS),requested:z.boolean()}).strict().parse(input);
 assert(await serviceInterestTableReady(env),503,'SERVICE_INTERESTS_NOT_READY','Account service preferences are not yet available.');
 const time=now();
 const sql=d.requested?
   'INSERT INTO client_service_interests(client_id,service_area,requested_by,requested_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(client_id,service_area) DO UPDATE SET updated_at=excluded.updated_at,requested_by=excluded.requested_by':
   'DELETE FROM client_service_interests WHERE client_id=? AND service_area=?';
 const statementArgs=d.requested?[clientId,d.area,user.id,time,time]:[clientId,d.area];
 await env.DB.batch([
   statement(env.DB,sql,...statementArgs),
   activity(env,user,d.requested?'client.service_interest_requested':'client.service_interest_removed','client',clientId),
 ]);
 return clientServiceInterests(env,user,clientId);
}
export async function interestsForWorkspace(env:Env,user:Principal,w:Workspace) {
 if(!['landlord','property-manager','commercial','strata-manager'].includes(w.kind))return {ready:false,areas:[] as ServiceArea[]};
 return clientServiceInterests(env,user,w.scopeId);
}
