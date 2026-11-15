import { z } from 'zod';
import type { Env } from '../../../../packages/database/types';
import { assert, statement, now, uid } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { currentTenancy, operationsWrite, propertyAccess } from '../../../../packages/authorization/server';

const id = z.string().min(4).max(100).regex(/^[a-zA-Z0-9_-]+$/);

async function requireResidentialManager(env: Env, user: Principal, w: Workspace, propertyId: string, write: boolean) {
  assert(['landlord', 'property-manager', 'staff'].includes(w.kind), 403, 'CO_LIVING_MANAGER_REQUIRED', 'Select an authorised Residential management workspace.');
  if (w.kind === 'staff') operationsWrite(user);
  else if (write) assert(['owner', 'admin'].includes(w.role), 403, 'ACCOUNT_ADMIN_REQUIRED', 'An account owner or administrator must configure co-living.');
  const property = await propertyAccess(env, user, w, propertyId, write);
  assert(property.sector === 'residential', 422, 'CO_LIVING_RESIDENTIAL_ONLY', 'Co-living is available only for residential properties.');
  return property;
}

export async function coLivingOverview(env: Env, user: Principal, w: Workspace, propertyId: string) {
  await requireResidentialManager(env, user, w, propertyId, false);
  const site = await statement(env.DB,
    'SELECT property_id,allocation_mode,created_at FROM co_living_sites WHERE property_id=?',
    propertyId,
  ).first<{property_id:string;allocation_mode:string;created_at:string}>();
  if (!site) return { site: null, spaces: [], occupancies: [] };
  const spaces = (await statement(env.DB,
    'SELECT id,label,space_type,active FROM co_living_spaces WHERE property_id=? ORDER BY space_type,label',
    propertyId,
  ).all<{id:string;label:string;space_type:string;active:number}>()).results;
  // Never expose another resident's private details. Managers only see the
  // tenancy reference, allocation and dates that they are authorised to operate.
  const occupancies = (await statement(env.DB,
    `SELECT o.space_id,o.tenancy_id,t.status,t.starts_at,t.ends_at
     FROM co_living_occupancies o JOIN tenancies t ON t.id=o.tenancy_id
     JOIN co_living_spaces s ON s.id=o.space_id WHERE s.property_id=?
     ORDER BY t.starts_at DESC LIMIT 500`,
    propertyId,
  ).all()).results;
  return { site, spaces, occupancies };
}

export async function coLivingCommand(env: Env, user: Principal, w: Workspace, propertyId: string, input: unknown) {
  const action = z.discriminatedUnion('action', [
    z.object({action:z.literal('configure'), allocationMode:z.enum(['room','bed'])}),
    z.object({action:z.literal('add_space'), label:z.string().trim().min(1).max(64), spaceType:z.enum(['room','bed','shared_area'])}),
  ]).parse(input);
  await requireResidentialManager(env, user, w, propertyId, true);
  if (action.action === 'configure') {
    const existing = await statement(env.DB,
      'SELECT property_id FROM co_living_sites WHERE property_id=?', propertyId).first();
    assert(!existing, 409, 'CO_LIVING_ALREADY_CONFIGURED', 'Co-living allocation is already configured for this property.');
    const activeTenancy = await statement(env.DB,
      "SELECT id FROM tenancies WHERE property_id=? AND status IN('pending','active') AND (ends_at IS NULL OR ends_at>?) LIMIT 1",
      propertyId,now(),
    ).first();
    assert(!activeTenancy, 409, 'EXISTING_TENANCY_REVIEW', 'Review existing tenancies before splitting the property into rooms or beds.');
    const statements = [
      statement(env.DB,
        'INSERT INTO co_living_sites(property_id,allocation_mode,created_by,created_at) VALUES(?,?,?,?)',
        propertyId,action.allocationMode,user.id,now()),
    ];
    if (w.kind !== 'staff') {
      statements.push(statement(env.DB,
        "INSERT OR IGNORE INTO account_experience_tags(client_id,tag,set_by,created_at) VALUES(?,'co_living',?,?)",
        w.scopeId,user.id,now()));
    }
    await env.DB.batch(statements);
    return { ok: true, message: 'Co-living is configured. Add each private room or bed and any shared areas.' };
  }
  const site = await statement(env.DB,
    'SELECT allocation_mode FROM co_living_sites WHERE property_id=?',propertyId,
  ).first<{allocation_mode:string}>();
  assert(site, 409, 'CO_LIVING_NOT_CONFIGURED', 'Configure co-living for this residential property first.');
  assert(action.spaceType === 'shared_area' || action.spaceType === site.allocation_mode,
    422,'CO_LIVING_SPACE_MODE','Private space type must match the selected room or bed allocation mode.');
  const spaceId=uid('cls');
  await statement(env.DB,
    'INSERT INTO co_living_spaces(id,property_id,label,space_type,created_by,created_at) VALUES(?,?,?,?,?,?)',
    spaceId,propertyId,action.label,action.spaceType,user.id,now()).run();
  return {ok:true,spaceId,message:'Space added. Private occupancy begins only after a separate verified invitation.'};
}

/** A Resident user sees ONLY their own assigned space plus named shared areas. */
export async function myCoLivingSpace(env: Env, user: Principal, w: Workspace) {
  assert(w.kind === 'tenant', 403, 'RESIDENT_INVITATION_REQUIRED','Resident access requires a verified tenancy invitation.');
  await currentTenancy(env,user,w.scopeId);
  const space=await statement(env.DB,
    `SELECT s.label,s.space_type,p.address
     FROM co_living_occupancies o JOIN co_living_spaces s ON s.id=o.space_id
     JOIN properties p ON p.id=s.property_id WHERE o.tenancy_id=?`,
    w.scopeId,
  ).first<{label:string;space_type:string;address:string}>();
  if (!space) return { space: null, sharedAreas: [] };
  const sharedAreas=(await statement(env.DB,
    `SELECT s.label FROM co_living_spaces s JOIN co_living_occupancies o ON o.space_id IN
       (SELECT private_space.id FROM co_living_spaces private_space WHERE private_space.property_id=s.property_id)
     WHERE o.tenancy_id=? AND s.space_type='shared_area' AND s.active=1
     ORDER BY s.label`,
    w.scopeId,
  ).all<{label:string}>()).results;
  return {space,sharedAreas};
}
