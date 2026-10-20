import type { Env } from '../database/types';

/** Retention settings are operational choices, not statutory periods. */
export type RentalRetentionStage='draft'|'submitted'|'withdrawn';
const bounds:Record<RentalRetentionStage,[number,number]>={
 draft:[1,90],submitted:[30,1095],withdrawn:[1,180],
};
const key:Record<RentalRetentionStage,keyof Env>={
 draft:'RENTAL_RETENTION_DRAFT_DAYS',
 submitted:'RENTAL_RETENTION_SUBMITTED_DAYS',
 withdrawn:'RENTAL_RETENTION_WITHDRAWN_DAYS',
};
export function retentionDays(env:Env,stage:RentalRetentionStage):number|null{
 const raw=env[key[stage]];
 if(typeof raw!=='string'||!/^\d{1,4}$/.test(raw))return null;
 const days=Number(raw),[min,max]=bounds[stage];
 return days>=min&&days<=max?days:null;
}
export function hasRentalRetentionPolicy(env:Env){
 return (Object.keys(bounds) as RentalRetentionStage[]).every(s=>retentionDays(env,s)!==null);
}
export function retentionDeadline(env:Env,stage:RentalRetentionStage,from=new Date()):string{
 const days=retentionDays(env,stage);
 if(days===null)throw new Error('RENTAL_RETENTION_POLICY_REQUIRED');
 return new Date(from.getTime()+days*86400000).toISOString();
}
