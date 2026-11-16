import { z } from 'zod';
import { assert,statement,now,uid,type Env } from '../../../../packages/database/types';
import type { Principal,Workspace } from '../../../../packages/domain/index';
import { propertyAccess,operationsWrite } from '../../../../packages/authorization/server';
import { seal,unseal } from '../../../../packages/auth/crypto';

const recordId=z.string().min(4).max(100).regex(/^[a-zA-Z0-9_-]+$/);
async function manage(env:Env,user:Principal,w:Workspace,propertyId:string){
  assert(['landlord','property-manager','staff'].includes(w.kind),403,'MANAGER_REQUIRED','Use a Residential manager workspace.');
  if(w.kind==='staff')operationsWrite(user);
  else assert(['owner','admin'].includes(w.role),403,'ACCOUNT_ADMIN_REQUIRED','Co-living operations require account administration.');
  const property=await propertyAccess(env,user,w,propertyId,true);
  assert(property.sector==='residential',422,'RESIDENTIAL_REQUIRED','Choose a residential property.');
  assert(await statement(env.DB,'SELECT property_id FROM co_living_sites WHERE property_id=?',propertyId).first(),
    404,'CO_LIVING_NOT_CONFIGURED','Configure co-living before recording activity.');
}
async function tenancy(env:Env,propertyId:string,tenancyId:string){
  const row=await statement(env.DB,
    `SELECT t.id,t.status,o.space_id,s.label FROM co_living_occupancies o
     JOIN tenancies t ON t.id=o.tenancy_id JOIN co_living_spaces s ON s.id=o.space_id
     WHERE t.id=? AND t.property_id=? AND s.property_id=?`,tenancyId,propertyId,propertyId,
  ).first<{id:string;status:string;space_id:string;label:string}>();
  assert(row,404,'OCCUPANCY_NOT_FOUND','An occupancy in this property is required.');
  return row;
}
export async function coLivingOperationsData(env:Env,user:Principal,w:Workspace,propertyId:string){
  await manage(env,user,w,propertyId);
  const terms=(await statement(env.DB,
    `SELECT l.tenancy_id,l.rent_cents,l.rent_period,l.expected_bond_cents,l.utility_basis,
       l.agreement_document_id,l.review_status,l.source_reference,l.updated_at,s.label AS space
     FROM co_living_lease_terms l JOIN co_living_occupancies o ON o.tenancy_id=l.tenancy_id
     JOIN co_living_spaces s ON s.id=o.space_id WHERE s.property_id=?
     ORDER BY s.label LIMIT 200`,propertyId).all()).results;
  const history=(await statement(env.DB,
    `SELECT e.id,e.tenancy_id,e.kind,e.effective_at,e.evidence_reference,e.note_envelope,
       e.created_at,s.label AS space
     FROM co_living_occupancy_events e JOIN co_living_occupancies o ON o.tenancy_id=e.tenancy_id
     JOIN co_living_spaces s ON s.id=o.space_id WHERE s.property_id=?
     ORDER BY e.created_at DESC LIMIT 200`,propertyId).all<Record<string,any>>()).results;
  const events=await Promise.all(history.map(async ({note_envelope,...e})=>({
    ...e,note:(await unseal<{note:string}>(env.DATA_ENCRYPTION_KEY,'co-living-event:'+e.id,note_envelope)).note,
  })));
  const inspections=(await statement(env.DB,
    `SELECT i.id,i.space_id,i.inspected_at,i.public_summary,i.status,i.created_by,i.reviewed_by,
       i.issued_document_id,i.updated_at,s.label AS space
     FROM co_living_area_inspections i JOIN co_living_spaces s ON s.id=i.space_id
     WHERE i.property_id=? ORDER BY i.inspected_at DESC LIMIT 200`,
    propertyId).all()).results;
  return {terms,events,inspections};
}
export async function coLivingOperationsCommand(env:Env,user:Principal,w:Workspace,propertyId:string,input:unknown){
  const schema=z.discriminatedUnion('action',[
    z.object({action:z.literal('record_terms'),tenancyId:recordId,rentCents:z.number().int().min(0).max(100000000).nullable(),
      rentPeriod:z.enum(['weekly','fortnightly','monthly']),expectedBondCents:z.number().int().min(0).max(100000000).nullable(),
      utilityBasis:z.enum(['included','equal_share','metered','manual']),
      sourceReference:z.string().trim().min(8).max(240),agreementDocumentId:recordId.nullable().optional()}),
    z.object({action:z.literal('occupancy_event'),tenancyId:recordId,
      kind:z.enum(['check_in','check_out','condition_review','transfer_requested','agreement_review','rent_review','bond_review','utilities_review']),
      effectiveAt:z.string().datetime({offset:true}),note:z.string().trim().min(8).max(3000),
      evidenceReference:z.string().trim().min(8).max(240)}),
    z.object({action:z.literal('inspect_shared'),spaceId:recordId,
      inspectedAt:z.string().datetime({offset:true}),note:z.string().trim().min(8).max(3000)}),
    z.object({action:z.literal('publish_shared'),inspectionId:recordId,
      publicSummary:z.string().trim().min(8).max(500)}),
  ]);
  const data=schema.parse(input);
  await manage(env,user,w,propertyId);
  const timestamp=now();
  if(data.action==='record_terms'){
    await tenancy(env,propertyId,data.tenancyId);
    if(data.agreementDocumentId){
      const doc=await statement(env.DB,
        `SELECT d.id FROM documents d JOIN tenancies t ON t.id=? WHERE d.id=? AND
          d.status='issued' AND d.tenancy_id=t.id AND t.property_id=?`,
        data.tenancyId,data.agreementDocumentId,propertyId).first();
      assert(doc,404,'AGREEMENT_SCOPE','An issued document granted to this tenancy is required.');
    }
    await env.DB.batch([
      statement(env.DB,
        `INSERT INTO co_living_lease_terms
         (tenancy_id,rent_cents,rent_period,expected_bond_cents,utility_basis,agreement_document_id,
          review_status,source_reference,updated_by,updated_at)
         VALUES(?,?,?,?,?,?,'draft',?,?,?)
         ON CONFLICT(tenancy_id) DO UPDATE SET
          rent_cents=excluded.rent_cents,rent_period=excluded.rent_period,
          expected_bond_cents=excluded.expected_bond_cents,utility_basis=excluded.utility_basis,
          agreement_document_id=excluded.agreement_document_id,
          review_status='draft',source_reference=excluded.source_reference,
          reviewed_by=NULL,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
        data.tenancyId,data.rentCents,data.rentPeriod,data.expectedBondCents,data.utilityBasis,
        data.agreementDocumentId??null,data.sourceReference,user.id,timestamp),
      statement(env.DB,
        'INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,property_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?)',
        uid('aud'),user.id,'co_living.terms_recorded','tenancy',data.tenancyId,propertyId,
        JSON.stringify({reference:data.sourceReference,legalAgreementExecuted:false,bondLodged:false}),timestamp),
    ]);
    return {ok:true,status:'draft',message:'Terms recorded for review. No rent collected, bond lodged or agreement signed.'};
  }
  if(data.action==='occupancy_event'){
    await tenancy(env,propertyId,data.tenancyId);
    const eventId=uid('cle');
    await env.DB.batch([
      statement(env.DB,`INSERT INTO co_living_occupancy_events
       (id,tenancy_id,kind,effective_at,evidence_reference,note_envelope,created_by,created_at)
       VALUES(?,?,?,?,?,?,?,?)`,
        eventId,data.tenancyId,data.kind,data.effectiveAt,data.evidenceReference,
        await seal(env.DATA_ENCRYPTION_KEY,'co-living-event:'+eventId,{note:data.note}),user.id,timestamp),
      statement(env.DB,
        'INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,property_id,created_at) VALUES(?,?,?,?,?,?,?)',
        uid('aud'),user.id,'co_living.event_recorded','co_living_event',eventId,propertyId,timestamp),
    ]);
    return {ok:true,id:eventId,message:'Operational history recorded. Tenancy dates and legal status are unchanged.'};
  }
  if(data.action==='inspect_shared'){
    const common=await statement(env.DB,
      "SELECT id FROM co_living_spaces WHERE id=? AND property_id=? AND space_type='shared_area' AND active=1",
      data.spaceId,propertyId).first();
    assert(common,404,'SHARED_AREA_NOT_FOUND','Select an active shared area.');
    const id=uid('cli');
    await env.DB.batch([
      statement(env.DB,`INSERT INTO co_living_area_inspections
       (id,property_id,space_id,inspected_at,summary_envelope,created_by,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?)`,
        id,propertyId,data.spaceId,data.inspectedAt,
        await seal(env.DATA_ENCRYPTION_KEY,'co-living-inspection:'+id,{notes:data.note}),user.id,timestamp,timestamp),
      statement(env.DB,
        'INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,property_id,created_at) VALUES(?,?,?,?,?,?,?)',
        uid('aud'),user.id,'co_living.inspection_drafted','co_living_inspection',id,propertyId,timestamp),
    ]);
    return {ok:true,id,message:'Private shared-area inspection drafted for independent review.'};
  }
  // Publishing cannot reveal a raw report or room occupant. It exposes only a
  // reviewer-authored, explicitly safe shared-area summary to active residents.
  assert(w.kind==='staff',403,'INDEPENDENT_REVIEW_REQUIRED',
    'An independent authorised ProInspect reviewer must publish shared-area observations.');
  const inspection=await statement(env.DB,
    "SELECT id,created_by,status FROM co_living_area_inspections WHERE id=? AND property_id=?",
    data.inspectionId,propertyId).first<{id:string;created_by:string;status:string}>();
  assert(inspection&&inspection.status!=='published',409,'INSPECTION_REVIEW','Inspection unavailable for publication.');
  assert(inspection.created_by!==user.id,403,'SELF_REVIEW_DENIED','A different authorised reviewer must publish the summary.');
  await env.DB.batch([
    statement(env.DB,
      `UPDATE co_living_area_inspections SET status='published',public_summary=?,reviewed_by=?,updated_at=?
       WHERE id=? AND property_id=? AND status!='published'`,
      data.publicSummary,user.id,timestamp,data.inspectionId,propertyId),
    statement(env.DB,
      'INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,property_id,created_at) VALUES(?,?,?,?,?,?,?)',
      uid('aud'),user.id,'co_living.inspection_published','co_living_inspection',data.inspectionId,propertyId,timestamp),
  ]);
  return {ok:true,id:data.inspectionId,message:'Reviewed shared-area summary published to current residents.'};
}
