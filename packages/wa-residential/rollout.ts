/** Safe staged release plan for every ordinary WA tenancy form.
 * State remains 'blocked' until evidence is independently signed off.
 */
import {WA_FORM_SPECIFICATIONS} from './form-specifications.ts';
export type RolloutPhase='foundation'|'ordinary_requests'|'notices'|'specialist';
const foundation=new Set(['WA_FORM_1AA','WA_FORM_1','WA_FORM_19','WA_FORM_25']);
const requests=new Set(['WA_FORM_1AC','WA_FORM_1AD','WA_FORM_18','WA_FORM_18A','WA_FORM_24','WA_FORM_26','WA_FORM_27','WA_FORM_28']);
const notices=new Set(['WA_FORM_10','WA_FORM_11','WA_FORM_20','WA_FORM_21','WA_FORM_23','WA_FORM_22','WA_FORM_1A','WA_FORM_1B','WA_FORM_1C']);
const phaseOf=(code:string):RolloutPhase=>foundation.has(code)?'foundation':requests.has(code)?'ordinary_requests':notices.has(code)?'notices':'specialist';
export const WA_FORM_ROLLOUT=WA_FORM_SPECIFICATIONS.map(spec=>({
 code:spec.code,form:spec.name,phase:phaseOf(spec.code),status:'blocked' as const,
 owner:spec.stage==='bond'?'Bonds Administration liaison':spec.actor==='specialist'?'legal reviewer':'operations + legal reviewer',
 deployment:'off',signedTemplate:false,officialEditionVerified:false,fieldMappingReviewed:false,
 authorisationTests:false,signingOrResponseTests:false,deliveryServiceTests:false,
 privacyAccepted:false,externalAcceptance:false,
 releaseChecks:[...spec.releaseChecks,
  'Evidence: authenticated real Landlord, Tenant and Staff routes; third-party identity denied',
  'Evidence: approved statutory delivery or external government workflow',
  'Evidence: rollback and previous document editions remain accessible'] as const,
}));
export const WA_PHASES=[
 {phase:'foundation',purpose:'Form 1AA + Form 1 + Form 19 + Form 25',exit:'Real agreement signing, PCR/inspection binding, entry notice service, tenant request decision'},
 {phase:'ordinary_requests',purpose:'Remaining commencement disclosures and tenant/landlord modifications',exit:'Complete two-way response and actual receipt evidence'},
 {phase:'notices',purpose:'Breach, rent increase and termination notices',exit:'Independent review of grounds, statutory dates and service before any issue'},
 {phase:'specialist',purpose:'Abandonment, title, goods and external bond cases',exit:'Specialist reviewer and government/external confirmation; restricted records separate'},
] as const;
export function verifyRolloutCompleteness(){
 const ids=WA_FORM_ROLLOUT.map(f=>f.code);
 return ids.length===32&&new Set(ids).size===ids.length&&WA_FORM_ROLLOUT.every(f=>f.status==='blocked'&&f.deployment==='off');
}
