import test from 'node:test';
import assert from 'node:assert/strict';
import {compareInspections,recurringMaintenance} from '../packages/report-engine/comparison.ts';
import {initialReportDraft} from '../packages/report-engine/adapter.ts';
const snap=(reportId:string,condition:string,maintenance=false,area='Kitchen',component='Ceiling')=>{
 const draft=initialReportDraft('residential');
 draft.areas[0].name=area;
 const item=draft.areas[0].components[0];item.component=component;item.commentary='Observed at inspection';item.conditionCategory=condition as typeof item.conditionCategory;item.maintenanceRequired=maintenance;
 return {reportId,capturedAt:'2026-10-01T00:00:00Z',draft};
};
test('deterministic comparison matches same area/component across separate report IDs',()=>{
 const base=snap('r1','intact'),current=snap('r2','repair_required',true);
 const result=compareInspections(base,current);
 assert.equal(result.deteriorated,1);assert.equal(result.improved,0);
 assert.equal(result.findings[0].maintenanceNow,true);
 assert.match(result.findings[0].reasons.join(' '),/Condition/);
});
test('unobservable condition is not automatically treated as damage',()=>{
 const result=compareInspections(snap('r1','intact'),snap('r2','unable_to_confirm'));
 assert.equal(result.deteriorated,0);assert.equal(result.notComparable,1);
});
test('new components are distinguished from deterioration',()=>{
 const result=compareInspections(snap('r1','intact'),snap('r2','minor_wear',false,'Bathroom'));
 assert.equal(result.newItems,1);assert.equal(result.missingItems,1);assert.equal(result.deteriorated,0);
});
test('repeated maintenance flags require different issued reports',()=>{
 const s=snap('r1','minor_wear',true),copy=snap('r2','repair_required',true),another=snap('r3','intact',false);
 const result=recurringMaintenance([s,s,copy,another]);
 assert.equal(result.length,1);assert.equal(result[0].occurrences,2);
 assert.deepEqual(result[0].reportIds,['r1','r2']);
});
test('ambiguous duplicate named items are not automatically matched',()=>{
 const a=snap('r1','intact');
 a.draft.areas[0].components.push({...a.draft.areas[0].components[0],id:'second'});
 const result=compareInspections(a,snap('r2','repair_required'));
 assert.equal(result.deteriorated,0);assert.equal(result.newItems,1);
});
