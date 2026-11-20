import test from 'node:test';
import assert from 'node:assert/strict';
import { SERVICE_SEEDS } from '../packages/service-catalogue/index.ts';
import { SERVICE_REPORT_CONTRACTS, reportPolicyForService, mayUseReportAction, REPORT_RECIPIENT_KINDS } from '../packages/report-engine/policy.ts';
import { inspectionPolicy } from '../packages/report-engine/upstream/inspectionPolicy.ts';
import { evaluateReportQuality } from '../packages/report-engine/upstream/reportOperations.ts';
import { initialReportDraft,qualityReview,type ReportReviewContext } from '../packages/report-engine/adapter.ts';
test('all 23 service outputs have explicit report contracts',()=>{
 const ids=SERVICE_SEEDS.map(x=>x.id);assert.equal(ids.length,23);
 assert.deepEqual(Object.keys(SERVICE_REPORT_CONTRACTS).sort(),ids.sort());
 for(const id of ids){const p=reportPolicyForService(id);assert.ok(p);assert.ok(inspectionPolicy(p.type));}
 assert.equal(reportPolicyForService('fake'),null);
});
test('portal actions and recipient kinds are explicit, not workspace unions',()=>{
 assert.equal(mayUseReportAction('staff','approve'),true);
 assert.equal(mayUseReportAction('tenant','approve'),false);
 assert.equal(mayUseReportAction('council','edit'),false);
 assert.equal(mayUseReportAction('building','respond'),false);
 assert.deepEqual([...REPORT_RECIPIENT_KINDS],['client','tenancy','scheme_resident','scheme_owner','scheme_council']);
});
test('actual upstream deterministic quality engine detects an incomplete report',()=>{
 const result=evaluateReportQuality({report:{id:'synthetic',reportType:'entry'} as any,areas:[]} as any);
 assert.equal(result.status,'blocked');assert.ok(result.issues.some(x=>x.code==='REPORT_AREAS_REQUIRED'));
});

test('saved report QC identifies unsupported PDF writing without deleting Unicode evidence',()=>{
 const policy=reportPolicyForService('property-meeting')!;
 const ctx:ReportReviewContext={id:'report_test',workOrderId:'work_test',propertyId:'p_test',schemeId:null,tenancyId:null,
  templateId:'system_test',templateVersion:1,layoutId:'layout_test',reportType:policy.type,profile:policy.profile,
  baselineVersionId:null,outputKind:policy.output};
 const draft=initialReportDraft('attendance');
 draft.summary='Attended the café and recorded visible condition.';
 const accepted=qualityReview(draft,ctx,policy,new Map());
 assert.equal(accepted.issues.some(x=>x.code==='PDF_TEXT_UNSUPPORTED'),false);
 draft.summary='Original customer observation: 客户 现场情况';
 const blocked=qualityReview(draft,ctx,policy,new Map());
 assert.equal(blocked.status,'blocked');
 assert.ok(blocked.issues.some(x=>x.code==='PDF_TEXT_UNSUPPORTED' && x.field==='summary'));
 assert.ok(draft.summary.includes('客户'),'the original multilingual evidence must stay unaltered');
});
