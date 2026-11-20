/** Stage 6 preflight is an evidence gap assessment, NOT a market-launch certificate.
 * Even successful code, schema, email or source checks never replace independent
 * provider, commercial, recovery, accessibility and nine-role hosted acceptance.
 */
export const EXPECTED_SCHEMA = Object.freeze({
 count:53, latest:'0053_account_first_free_registration.sql', catalogueServices:23
});
export const STAGE6_GATES = Object.freeze([
 'source_freeze','deployment','database','customer_journeys',
 'nine_portals','commercial_approval','operational_readiness','final_activation'
] as const);
export type Stage6Gate = (typeof STAGE6_GATES)[number];
export type Stage6Status = 'technical_preflight'|'requires_external_evidence'|'blocked';
export interface Stage6GateRow {
 gate:Stage6Gate;label:string;status:Stage6Status;detail:string;nextEvidence:string;
}
export interface Stage6Inputs {
 environment:string;source:string|null;
 bindings:{database:boolean;documents:boolean;restrictedDocuments:boolean;queue:boolean;scheduler:boolean};
 migration:{available:boolean;count:number|null;latest:string|null};
 catalogue:{available:boolean;count:number|null};
 features:readonly {name:string;configured:boolean;approved:boolean}[];
 providers:readonly {provider:string;state:string}[];
 operations:readonly {code:string;state:string;count:number|null}[];
}
export function assessStage6Launch(input:Stage6Inputs){
 const validSource=/^[a-f0-9]{40}$/.test(input.source??'')&&input.environment==='production';
 const bindings=Object.values(input.bindings).every(Boolean);
 const schema=input.migration.available&&input.migration.count===EXPECTED_SCHEMA.count&&
  input.migration.latest===EXPECTED_SCHEMA.latest;
 const catalogue=input.catalogue.available&&input.catalogue.count===EXPECTED_SCHEMA.catalogueServices;
 const configuredUnapproved=input.features.filter(f=>f.configured&&!f.approved).map(f=>f.name);
 const alerts=input.operations.filter(s=>s.state==='blocked'||s.state==='attention'||s.state==='not_available')
  .map(s=>s.code);
 const providerBlocks=input.providers.filter(p=>p.state!=='acceptance_verified').map(p=>p.provider);
 const rows:Stage6GateRow[]=[
  {gate:'source_freeze',label:'Source freeze',status:validSource?'requires_external_evidence':'blocked',
   detail:validSource?'Exact 40-character production source is identified; independent reviewed freeze is not recorded here.':'Production source identity is missing or invalid.',
   nextEvidence:'Reviewed commit SHA, change scope, exact migration manifest and signed source freeze.'},
  {gate:'deployment',label:'Deployment and bindings',status:validSource&&bindings?'technical_preflight':'blocked',
   detail:validSource&&bindings?'This Worker has the expected bindings; independent Cloudflare deployment/traffic readback is still required.':'Missing production source or one or more required D1/R2/Queue/Scheduler bindings.',
   nextEvidence:'Cloudflare build/deployment SHA, traffic distribution, canonical DNS, configured bindings and authenticated read-only smoke.'},
  {gate:'database',label:'Database integrity and retained records',status:schema?'technical_preflight':'blocked',
   detail:schema?`${input.migration.count} source migrations through ${input.migration.latest} are recorded. No row-count baseline, foreign-key proof or restore is inferred.`:input.migration.available?'Migration manifest differs from current approved source.':'D1 migration ledger not available.',
   nextEvidence:'Verified D1 UUID, additive migration ledger, foreign key/integrity evidence, pre/post row counts, bookmark and isolated D1/R2/Queue restoration.'},
  {gate:'customer_journeys',label:'Registration through report delivery',status:catalogue?'requires_external_evidence':'blocked',
   detail:catalogue?'Service catalogue has expected coverage; actual signup, property, booking, report and paid opt-in journeys require hosted proof.':'The service catalogue is missing or differs from the approved 23-service baseline.',
   nextEvidence:'Distinct authenticated registration, property setup, subscription opt-in/no-charge, approved booking, Staff fulfilment and recipient PDF evidence.'},
  {gate:'nine_portals',label:'All nine authenticated workspace journeys',status:'requires_external_evidence',
   detail:'Isolated CI does not establish genuine email redemption, Turnstile, relationship revocation or cross-role denial for nine independently signed-in identities.',
   nextEvidence:'Protected nine-role hosted evidence bundle, individual mailbox/link journeys, unrelated-scope denial, revocation and independent review.'},
  {gate:'commercial_approval',label:'Commercial, legal and website claims',status:'requires_external_evidence',
   detail:`Product/service prices, subscriptions, GST, statutory forms, public promises and provider state need independent decisions. ${providerBlocks.length} provider inventories are not verified live acceptances.`,
   nextEvidence:'Approved signed service catalogue, GST/tax code and price terms, official WA forms, marketing-content comparison and named legal/finance approval.'},
  {gate:'operational_readiness',label:'Monitoring, reconciliation and disaster recovery',status:alerts.length?'blocked':'requires_external_evidence',
   detail:alerts.length?`Operational D1 signals require investigation (${alerts.length} exception types); this may include disabled integrations or unapplied migrations.`:'No D1 exception counts are flagged, but provider settlement, delivered messages and successful D1/R2/Queue restore remain unproven.',
   nextEvidence:'Real provider fail/replay/settlement results, restored isolated D1+R2+Queue, alerts/owner/on-call support and RPO/RTO approval.'},
  {gate:'final_activation',label:'Signed capability activation',status:configuredUnapproved.length?'blocked':'requires_external_evidence',
   detail:configuredUnapproved.length?`Configured capabilities without valid exact-source independent approvals: ${configuredUnapproved.join(', ')}.`:'No configured unapproved feature was found in this snapshot. An independently signed release decision is still required.',
   nextEvidence:'For each enabled feature, distinct administrator approval at deployed SHA, commercial/legal/provider/recovery references, and explicit flag review.'}
 ];
 return {
  decision:'NO_GO' as const,
  source:input.source,
  environment:input.environment,
  technicalPreflightPassed:rows.filter(x=>x.status==='technical_preflight').length,
  blocked:rows.filter(x=>x.status==='blocked').map(x=>x.gate),
  externalEvidenceRequired:rows.filter(x=>x.status==='requires_external_evidence').map(x=>x.gate),
  gates:rows,
  note:'This aggregate deliberately cannot grant market-launch or financial authority. Independent protected hosted acceptance and signed commercial, security, privacy and recovery decisions are separate mandatory release controls.'
 };
}
