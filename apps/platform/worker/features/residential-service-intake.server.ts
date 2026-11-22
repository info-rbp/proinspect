import { unseal } from '../../../../packages/auth/crypto';
import { assert, statement, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { propertyAccess, managesProperty, operationsWrite } from '../../../../packages/authorization/server';
import type { ResidentialServiceRequestIntake } from '../../../../packages/booking/residential-service-requests.ts';

/** Only current authorised property owners/managers or operational staff can
 * inspect confidential attendee/recipient and claimant information.
 * Never embed this data into generic workspace requests or outbound email. */
export async function confidentialServiceRequestIntake(
  env:Env,user:Principal,w:Workspace,requestId:string,
) {
  const row=await statement(env.DB,
    `SELECT r.id,r.property_id,r.client_id,i.encrypted_envelope,i.service_kind
     FROM requests r JOIN request_service_intakes i ON i.request_id=r.id
     WHERE r.id=?`,requestId).first<{
       id:string;property_id:string;client_id:string|null;
       encrypted_envelope:string;service_kind:string;
     }>();
  assert(row,404,'SERVICE_INTAKE_MISSING','No confidential intake is recorded for this request.');
  if(w.kind==='staff') operationsWrite(user);
  else {
    assert(managesProperty(w) && w.role!=='viewer' && row.client_id===w.scopeId,
      403,'SERVICE_INTAKE_FORBIDDEN','This request is not in your authorised account.');
    await propertyAccess(env,user,w,row.property_id);
  }
  const intake=await unseal<ResidentialServiceRequestIntake>(
    env.DATA_ENCRYPTION_KEY,`request-service:${requestId}`,row.encrypted_envelope);
  return {requestId,propertyId:row.property_id,serviceCode:row.service_kind,
    intake,deliveryState:'review_required'};
}
