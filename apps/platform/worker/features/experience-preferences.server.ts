import { z } from 'zod';
import { assert,statement,now,type Env } from '../../../../packages/database/types';
import type {Principal,Workspace} from '../../../../packages/domain/index';
import {portalFamily,permittedExperienceSections} from '../../../../packages/domain/portal-experience';

export async function experiencePreferences(env:Env,user:Principal,w:Workspace){
  const family=portalFamily(w.kind);
  const row=await statement(env.DB,
    'SELECT display_density,landing_section,updated_at FROM user_portal_preferences WHERE user_id=? AND portal_family=?',
    user.id,family).first<{display_density:string;landing_section:string;updated_at:string}>();
  const allowed=permittedExperienceSections(w);
  return {family,availableSections:allowed,
    preferences:{displayDensity:row?.display_density??'comfortable',
      landingSection:row&&allowed.includes(row.landing_section)?row.landing_section:'overview',
      updatedAt:row?.updated_at??null}};
}
export async function saveExperiencePreferences(env:Env,user:Principal,w:Workspace,input:unknown){
  const data=z.object({
    displayDensity:z.enum(['comfortable','compact']),
    landingSection:z.enum(['overview','properties','bookings','requests','documents','co-living','facilities','finance','my-room']),
  }).strict().parse(input);
  assert(permittedExperienceSections(w).includes(data.landingSection),403,'PREFERENCE_SCOPE',
    'That section is not available to this authorised workspace.');
  const family=portalFamily(w.kind);
  const stamped=now();
  await statement(env.DB,
    `INSERT INTO user_portal_preferences(user_id,portal_family,display_density,landing_section,updated_at)
     VALUES(?,?,?,?,?) ON CONFLICT(user_id,portal_family) DO UPDATE
       SET display_density=excluded.display_density,landing_section=excluded.landing_section,
           updated_at=excluded.updated_at`,
    user.id,family,data.displayDensity,data.landingSection,stamped).run();
  return {ok:true,family,...data,message:'Your individual presentation preferences have been saved. Account authority is unchanged.'};
}
