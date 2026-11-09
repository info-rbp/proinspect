import type {Env} from '../../../../packages/database/types';
import {statement} from '../../../../packages/database/types';
import {assessStage6Launch,type Stage6Inputs} from '../../../../packages/operations/stage6-launch';

type Feature = {name:string;configured:boolean;approval:unknown};
type Provider = {provider:string;state:string};
type Operational = {signals:readonly {code:string;state:string;count:number|null}[]};

/** Read-only evidence preflight. No provider request, customer data or signed
 * operator acceptance is created by this endpoint. In isolated CI, Wrangler's
 * migration ledger may be absent: report blocked rather than assuming applied.
 */
export async function stage6LaunchData(env:Env,features:Feature[],
 providers:Provider[],operations:Operational){
 const tables=new Set((await statement(env.DB,
  "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('d1_migrations','services')")
  .all<{name:string}>()).results.map(x=>x.name));
 const migration=tables.has('d1_migrations')
  ?await statement(env.DB,'SELECT COUNT(*) AS count, MAX(name) AS latest FROM d1_migrations')
    .first<{count:number;latest:string|null}>()
  :null;
 const catalogue=tables.has('services')
  ?await statement(env.DB,'SELECT COUNT(*) AS count FROM services')
    .first<{count:number}>()
  :null;
 const input:Stage6Inputs={
  environment:env.APP_ENV,source:env.BUILD_SHA??null,
  bindings:{database:!!env.DB,documents:!!env.DOCUMENTS,
   restrictedDocuments:!!env.RESTRICTED_DOCUMENTS,queue:!!env.EVENTS,scheduler:!!env.SCHEDULER},
  migration:{available:tables.has('d1_migrations'),count:migration?.count??null,
   latest:migration?.latest??null},
  catalogue:{available:tables.has('services'),count:catalogue?.count??null},
  features:features.map(f=>({name:f.name,configured:f.configured,approved:!!f.approval})),
  providers:providers.map(p=>({provider:p.provider,state:p.state})),
  operations:operations.signals.map(s=>({code:s.code,state:s.state,count:s.count}))
 };
 return assessStage6Launch(input);
}
