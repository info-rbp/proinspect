import { z } from 'zod';
import { assert, statement, uid, now, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { addressKey } from '../../../../packages/validation/index';
import { operationsWrite } from '../../../../packages/authorization/server';

const residentialTypes = ['House','Unit','Apartment','Townhouse','Villa','Duplex','Studio','Other'] as const;
const commercialTypes = ['Office','Retail','Warehouse','Industrial','Mixed-use','Other'] as const;
const addressFields = z.object({
  address: z.string().trim().min(5).max(180),
  suburb: z.string().trim().min(2).max(80),
  postcode: z.string().regex(/^\d{4}$/),
  propertyType: z.string().trim().min(2).max(80)
});
const propertyCreation = addressFields.extend({
  sector: z.enum(['residential','commercial']),
  sourceReference: z.string().trim().min(8).max(300)
});
const propertyUpdate = addressFields.extend({
  original: addressFields,
  sourceReference: z.string().trim().min(8).max(300)
});
type PropertyData = {id:string;address:string;suburb:string;postcode:string;address_key:string;
 sector:string;property_type:string;archived_at:string|null};
function permission(user:Principal,w:Workspace,write=false){
  assert(w.kind==='staff'&&w.scopeId==='operations',403,'STAFF_REQUIRED','Use the authorised Staff operations workspace.');
  operationsWrite(user);
  if(write) assert(user.staffRole==='administrator',403,'ADMIN_REQUIRED','Only an active platform administrator can change canonical property records.');
}
function allowedType(sector:string, propertyType:string){
  return sector==='residential'
    ? (residentialTypes as readonly string[]).includes(propertyType)
    : (commercialTypes as readonly string[]).includes(propertyType);
}
function recordAudit(env:Env,user:Principal,action:string,propertyId:string,metadata:Record<string,unknown>){
  return statement(env.DB,
    'INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,property_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?)',
    uid('aud'),user.id,action,'property',propertyId,propertyId,JSON.stringify(metadata),now());
}
export async function staffPropertyCreate(env:Env,user:Principal,w:Workspace,input:unknown){
  permission(user,w,true);
  const data=propertyCreation.parse(input);
  assert(allowedType(data.sector,data.propertyType),422,'PROPERTY_TYPE_INVALID','Select a property type valid for this sector.');
  const key=addressKey(data.address,data.suburb,data.postcode);
  const existing=await statement(env.DB,'SELECT id FROM properties WHERE address_key=?',key).first<{id:string}>();
  assert(!existing,409,'PROPERTY_ALREADY_EXISTS','This property is already registered. Open its existing record and verify the client relationship instead.');
  const id=uid('prop');
  await env.DB.batch([
    statement(env.DB,
      "INSERT INTO properties(id,address,suburb,postcode,state,address_key,sector,property_type,created_at) VALUES(?,?,?,?, 'WA',?,?,?,?)",
      id,data.address,data.suburb,data.postcode,key,data.sector,data.propertyType,now()),
    recordAudit(env,user,'property.staff_created',id,{
      sourceReference:data.sourceReference,sector:data.sector,propertyType:data.propertyType,
      clientAuthority:'not_assigned', note:'Creation does not establish ownership, management authority or leasing approval'
    })
  ]);
  return {propertyId:id};
}
export async function staffPropertyOverview(env:Env,user:Principal,w:Workspace,propertyId:string){
  permission(user,w);
  const property=await statement(env.DB,'SELECT * FROM properties WHERE id=? AND archived_at IS NULL',propertyId).first<PropertyData>();
  assert(property,404,'PROPERTY_NOT_FOUND','Property not found in Staff operations.');
  const [clientLinks,managers,listings,tenancies,history]=await Promise.all([
    statement(env.DB,"SELECT l.id,l.role,l.starts_at,l.ends_at,c.id AS client_id,c.name,c.client_type,c.status FROM client_property_links l JOIN clients c ON c.id=l.client_id WHERE l.property_id=? ORDER BY l.starts_at DESC LIMIT 60",propertyId).all(),
    statement(env.DB,"SELECT m.id,m.mode,m.starts_at,m.ends_at,c.name AS manager_name,c.status AS client_status FROM property_management_relationships m JOIN clients c ON c.id=m.manager_client_id WHERE m.property_id=? ORDER BY m.starts_at DESC LIMIT 30",propertyId).all(),
    statement(env.DB,"SELECT id,slug,title,kind,status,application_mode,rental_approval_state FROM leasing_listings WHERE property_id=? ORDER BY updated_at DESC LIMIT 50",propertyId).all(),
    statement(env.DB,"SELECT id,status,starts_at,ends_at FROM tenancies WHERE property_id=? ORDER BY starts_at DESC LIMIT 40",propertyId).all(),
    statement(env.DB,"SELECT e.id,e.action,e.created_at,e.metadata_json,u.display_name AS actor_name FROM audit_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.property_id=? AND e.entity_type='property' ORDER BY e.created_at DESC LIMIT 50",propertyId).all()
  ]);
  return {property,clientLinks:clientLinks.results,managers:managers.results,
    listings:listings.results,tenancies:tenancies.results,history:history.results,
    canEdit:user.staffRole==='administrator'};
}
export async function staffPropertyUpdate(env:Env,user:Principal,w:Workspace,propertyId:string,input:unknown){
  permission(user,w,true);
  const data=propertyUpdate.parse(input);
  const property=await statement(env.DB,
    'SELECT id,address,suburb,postcode,address_key,sector,property_type,archived_at FROM properties WHERE id=?',
    propertyId).first<PropertyData>();
  assert(property&&!property.archived_at,404,'PROPERTY_NOT_FOUND','Property not found.');
  assert(allowedType(property.sector,data.propertyType),422,'PROPERTY_TYPE_INVALID','The property type must match the recorded sector.');
  // Treat the exact original fields displayed in the edit form as a concurrency token.
  assert(property.address===data.original.address&&property.suburb===data.original.suburb
    &&property.postcode===data.original.postcode&&property.property_type===data.original.propertyType,
    409,'STALE_PROPERTY','This record has changed. Reload before editing it.');
  const nextKey=addressKey(data.address,data.suburb,data.postcode);
  const changedAddress=property.address!==data.address||property.suburb!==data.suburb||property.postcode!==data.postcode;
  assert(changedAddress||property.property_type!==data.propertyType,
    422,'PROPERTY_UNCHANGED','Change at least one field before saving.');
  if(changedAddress){
    const published=await statement(env.DB,
      "SELECT id FROM leasing_listings WHERE property_id=? AND status='published' LIMIT 1",propertyId).first();
    assert(!published,409,'PUBLISHED_LISTING_REVIEW_REQUIRED',
      'Withdraw or formally update the published leasing advertisement before changing the canonical property address.');
  }
  if(nextKey!==property.address_key){
    const duplicate=await statement(env.DB,
      'SELECT id FROM properties WHERE address_key=? AND id<>?',nextKey,propertyId).first();
    assert(!duplicate,409,'PROPERTY_ALREADY_EXISTS','This address already belongs to another registered property. Verify its relationships instead.');
  }
  const original={address:property.address,suburb:property.suburb,postcode:property.postcode,propertyType:property.property_type};
  const changed=await env.DB.batch([
    statement(env.DB,
      'UPDATE properties SET address=?,suburb=?,postcode=?,address_key=?,property_type=? WHERE id=? AND address=? AND suburb=? AND postcode=? AND property_type=? AND archived_at IS NULL',
      data.address,data.suburb,data.postcode,nextKey,data.propertyType,propertyId,
      property.address,property.suburb,property.postcode,property.property_type),
    statement(env.DB,'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),
    statement(env.DB,'DELETE FROM mutation_guards'),
    recordAudit(env,user,'property.staff_updated',propertyId,{before:original,
      after:{address:data.address,suburb:data.suburb,postcode:data.postcode,propertyType:data.propertyType},
      sourceReference:data.sourceReference,
      note:'Existing ownership, tenancy, agent authority and approved listing snapshots are unchanged'})
  ]);
  assert(changed[0]?.meta?.changes===1,409,'STALE_PROPERTY','This record has changed. Reload before editing.');
  return {ok:true,propertyId};
}
