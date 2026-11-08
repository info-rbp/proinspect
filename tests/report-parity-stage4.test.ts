import test from 'node:test';
import assert from 'node:assert/strict';
import { REPORT_TEMPLATE_PARITY,reportTemplateParitySummary } from '../packages/report-engine/parity.ts';
import { SERVICE_SEEDS } from '../packages/service-catalogue/index.ts';
import { TOOL_REPORT_TYPES,TOOL_TEMPLATE_FOR_SERVICE } from '../packages/report-engine/report-tool-catalogue.ts';

test('retained upstream report template inventory preserves 25 types and all current service mappings',()=>{
 const summary=reportTemplateParitySummary();
 assert.equal(TOOL_REPORT_TYPES.length,25);
 assert.equal(REPORT_TEMPLATE_PARITY.length,25);
 assert.equal(summary.retainedTemplates,25);
 assert.equal(summary.totalServices,SERVICE_SEEDS.length);
 assert.equal(summary.routedServices,23);
 assert.deepEqual(Object.keys(TOOL_TEMPLATE_FOR_SERVICE).sort(),SERVICE_SEEDS.map(s=>s.id).sort());
 assert.deepEqual(REPORT_TEMPLATE_PARITY.map(r=>r.template),[...TOOL_REPORT_TYPES]);
});
test('unmapped templates remain visible and no type is falsely marked visually accepted',()=>{
 const summary=reportTemplateParitySummary();
 assert.ok(summary.unmappedTemplates.length>0);
 assert.equal(summary.visualAccepted,0);
 for(const row of REPORT_TEMPLATE_PARITY){
  assert.equal(row.fidelityState,'pending_visual_acceptance');
  assert.equal(row.routeState,row.serviceIds.length?'service_mapped':'unmapped_retained');
 }
});
