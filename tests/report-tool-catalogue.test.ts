import test from 'node:test';
import assert from 'node:assert/strict';
import {SERVICE_SEEDS} from '../packages/service-catalogue/index.ts';
import {TOOL_REPORT_TYPES,TOOL_TEMPLATE_FOR_SERVICE,templateForBooking} from '../packages/report-engine/report-tool-catalogue.ts';

test('the complete 23-service ProInspect booking catalogue maps to native Tool templates',()=>{
 const ids=SERVICE_SEEDS.map(s=>s.id);
 assert.equal(ids.length,23);
 assert.deepEqual(Object.keys(TOOL_TEMPLATE_FOR_SERVICE).sort(),ids.sort());
 for(const id of ids){
  const reportType=templateForBooking(id);
  assert.ok(reportType,`missing template for ${id}`);
  assert.ok(TOOL_REPORT_TYPES.includes(reportType),`unknown report type for ${id}`);
 }
 assert.equal(templateForBooking('not-a-real-service'),null);
});
test('specialist residential, commercial and common-property templates retain their individual types',()=>{
 assert.equal(templateForBooking('property-condition-report'),'Entry');
 assert.equal(templateForBooking('final-exit-inspection'),'Exit');
 assert.equal(templateForBooking('commercial-property-inspection'),'CommercialPeriodic');
 assert.equal(templateForBooking('commercial-final-make-good-inspection'),'CommercialExit');
 assert.equal(templateForBooking('common-property-inspection'),'CommonProperty');
 assert.equal(templateForBooking('building-management-attendance'),'BuildingManagementDaily');
 assert.equal(templateForBooking('key-handover-collection'),'KeyReceipt');
});
