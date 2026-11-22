import { seal, unseal, digest } from '../../../../packages/auth/crypto';
import { assert, statement, uid, now, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { clientMembership, propertyAccess } from '../../../../packages/authorization/server';
import {
  residentialPropertySetupSchema, residentialPropertyUpdateSchema,
} from '../../../../packages/validation/index';
import type { z } from 'zod';

type Setup = z.infer<typeof residentialPropertySetupSchema>;
type ProfileRow = {
  property_id: string; bedrooms: number; bathrooms: number; ensuites: number;
  separate_toilets: number; car_spaces: number; furnishing: string;
  notes_envelope: string|null; version: number; updated_at: string;
};
type TenancySnapshotRow = {
  id: string; occupancy_status: string; lease_type: string|null;
  starts_on: string|null; ends_on: string|null; tenants_envelope: string|null;
  tenant_count: number; fingerprint: string; recorded_at: string;
};

const profileSql = `INSERT INTO residential_property_profiles
  (property_id,bedrooms,bathrooms,ensuites,separate_toilets,car_spaces,
   furnishing,notes_envelope,version,updated_by,updated_at)
  VALUES(?,?,?,?,?,?,?,?,1,?,?)`;

function notesContext(propertyId: string) {
  return 'residential-property-notes:'+propertyId;
}
function tenantsContext(snapshotId: string) {
  return 'residential-tenancy-information:'+snapshotId;
}
function profileData(row: ProfileRow, notes: string) {
  return {
    bedrooms: row.bedrooms, bathrooms: row.bathrooms, ensuites: row.ensuites,
    separateToilets: row.separate_toilets, carSpaces: row.car_spaces,
    furnishing: row.furnishing, notes, version: row.version,
    updatedAt: row.updated_at,
  };
}
/** Prepare every dependent write before property insertion, so D1.batch is atomic. */
export async function initialPropertySetupStatements(
  env: Env, user: Principal, propertyId: string, input: Setup,
) {
  const detail = residentialPropertySetupSchema.parse(input);
  const time = now(), snapshotId = uid('rts');
  const notesEnvelope = detail.notes
    ? await seal(env.DATA_ENCRYPTION_KEY,notesContext(propertyId),detail.notes)
    : null;
  const tenantsEnvelope = detail.tenancy.tenants.length
    ? await seal(env.DATA_ENCRYPTION_KEY,tenantsContext(snapshotId),detail.tenancy.tenants)
    : null;
  const fingerprint = await digest(JSON.stringify(detail.tenancy));
  return [
    statement(env.DB,profileSql,propertyId,detail.profile.bedrooms,detail.profile.bathrooms,
      detail.profile.ensuites,detail.profile.separateToilets,detail.profile.carSpaces,
      detail.profile.furnishing,notesEnvelope,user.id,time),
    statement(env.DB,`INSERT INTO residential_property_tenancy_snapshots
      (id,property_id,occupancy_status,lease_type,starts_on,ends_on,
       tenants_envelope,tenant_count,fingerprint,is_current,recorded_by,recorded_at)
       VALUES(?,?,?,?,?,?,?,?,?,1,?,?)`,snapshotId,propertyId,
       detail.tenancy.occupancyStatus,detail.tenancy.leaseType,
       detail.tenancy.startsOn,detail.tenancy.endsOn,tenantsEnvelope,
       detail.tenancy.tenants.length,fingerprint,user.id,time),
  ];
}

/**
 * Tenant personal details are not included in general workspace-data payloads.
 * Only an authorised residential owner/admin can view them. Recording these
 * contacts never creates canonical tenancies, memberships or invitations.
 */
export async function propertySetup(
  env: Env,user: Principal,w: Workspace,propertyId: string,
) {
  assert(w.kind === 'landlord',403,'RESIDENTIAL_OWNER_REQUIRED',
    'Use your Residential owner workspace to view the property setup.');
  const member = await clientMembership(env,user,w.scopeId);
  const p = await propertyAccess(env,user,w,propertyId);
  assert(p.sector==='residential',404,'RESIDENTIAL_PROPERTY_REQUIRED','Residential property not found.');
  const profile = await statement(env.DB,
    'SELECT * FROM residential_property_profiles WHERE property_id=?',propertyId,
  ).first<ProfileRow>();
  const tenancy = await statement(env.DB,
    `SELECT * FROM residential_property_tenancy_snapshots
     WHERE property_id=? AND is_current=1`,propertyId).first<TenancySnapshotRow>();
  const canViewPrivate = ['owner','admin'].includes(member.role);
  const notes = canViewPrivate && profile?.notes_envelope
    ? await unseal<string>(env.DATA_ENCRYPTION_KEY,notesContext(propertyId),profile.notes_envelope)
    : '';
  const contacts = canViewPrivate && tenancy?.tenants_envelope
    ? await unseal<Setup['tenancy']['tenants']>(
      env.DATA_ENCRYPTION_KEY,tenantsContext(tenancy.id),tenancy.tenants_envelope)
    : [];
  return {
    propertyId,
    canEdit: canViewPrivate,
    profile: profile ? profileData(profile,notes) : null,
    tenancy: canViewPrivate && tenancy ? {
      occupancyStatus: tenancy.occupancy_status,
      leaseType: tenancy.lease_type, startsOn: tenancy.starts_on,
      endsOn: tenancy.ends_on, tenants: contacts,
      recordedAt: tenancy.recorded_at,
    } : null,
    historyCount: canViewPrivate ? (await statement(env.DB,
      'SELECT COUNT(*) AS count FROM residential_property_tenancy_snapshots WHERE property_id=?',
      propertyId).first<{count:number}>())?.count ?? 0 : 0,
  };
}
export async function updatePropertySetup(
  env: Env,user: Principal,w: Workspace,propertyId: string,input: unknown,
) {
  assert(w.kind==='landlord',403,'RESIDENTIAL_OWNER_REQUIRED','Use your Residential owner workspace.');
  const member=await clientMembership(env,user,w.scopeId,true);
  assert(['owner','admin'].includes(member.role),403,'ACCOUNT_ADMIN_REQUIRED',
    'An owner or account administrator must update this property.');
  const p=await propertyAccess(env,user,w,propertyId,true);
  assert(p.sector==='residential',404,'RESIDENTIAL_PROPERTY_REQUIRED','Residential property not found.');
  const payload=residentialPropertyUpdateSchema.parse(input);
  const current=await statement(env.DB,
    'SELECT version FROM residential_property_profiles WHERE property_id=?',
    propertyId).first<{version:number}>();
  assert(payload.expectedVersion === (current?.version??0),409,'PROFILE_CHANGED',
    'Property information changed in another session. Reload before updating.');
  const previous=await statement(env.DB,
    'SELECT id,fingerprint FROM residential_property_tenancy_snapshots WHERE property_id=? AND is_current=1',
    propertyId).first<{id:string;fingerprint:string}>();
  const nextFingerprint=await digest(JSON.stringify(payload.tenancy));
  const changedTenancy=!previous||previous.fingerprint!==nextFingerprint;
  const time=now(),snapshotId=uid('rts');
  const notesEnvelope=payload.notes
    ?await seal(env.DATA_ENCRYPTION_KEY,notesContext(propertyId),payload.notes):null;
  const contactsEnvelope=payload.tenancy.tenants.length
    ?await seal(env.DATA_ENCRYPTION_KEY,tenantsContext(snapshotId),payload.tenancy.tenants):null;
  const steps = current ? [
    statement(env.DB,`UPDATE residential_property_profiles
      SET bedrooms=?,bathrooms=?,ensuites=?,separate_toilets=?,car_spaces=?,
          furnishing=?,notes_envelope=?,updated_by=?,updated_at=?,version=version+1
      WHERE property_id=? AND version=?`,
      payload.profile.bedrooms,payload.profile.bathrooms,payload.profile.ensuites,
      payload.profile.separateToilets,payload.profile.carSpaces,payload.profile.furnishing,
      notesEnvelope,user.id,time,propertyId,payload.expectedVersion),
    statement(env.DB,'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),
    statement(env.DB,'DELETE FROM mutation_guards'),
  ] : [
    statement(env.DB,profileSql,propertyId,payload.profile.bedrooms,payload.profile.bathrooms,
      payload.profile.ensuites,payload.profile.separateToilets,payload.profile.carSpaces,
      payload.profile.furnishing,notesEnvelope,user.id,time),
  ];
  if(changedTenancy) {
    if(previous) {
      steps.push(
        statement(env.DB,`UPDATE residential_property_tenancy_snapshots
          SET is_current=0 WHERE id=? AND property_id=? AND is_current=1`,previous.id,propertyId),
        statement(env.DB,'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),
        statement(env.DB,'DELETE FROM mutation_guards'),
      );
    }
    steps.push(statement(env.DB,`INSERT INTO residential_property_tenancy_snapshots
      (id,property_id,occupancy_status,lease_type,starts_on,ends_on,
       tenants_envelope,tenant_count,fingerprint,is_current,recorded_by,recorded_at)
      VALUES(?,?,?,?,?,?,?,?,?,1,?,?)`,
      snapshotId,propertyId,payload.tenancy.occupancyStatus,payload.tenancy.leaseType,
      payload.tenancy.startsOn,payload.tenancy.endsOn,contactsEnvelope,
      payload.tenancy.tenants.length,nextFingerprint,user.id,time));
  }
  steps.push(statement(env.DB,
    `INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,property_id,metadata_json,created_at)
      VALUES(?,?,'property.setup_updated','property',?,?,?,?)`,
    uid('aud'),user.id,propertyId,propertyId,JSON.stringify({
      version:payload.expectedVersion+1,occupancyUpdated:changedTenancy,
    }),time));
  await env.DB.batch(steps);
  return {propertyId,version:payload.expectedVersion+1,occupancyUpdated:changedTenancy};
}
