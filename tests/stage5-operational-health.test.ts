import test from 'node:test';
import assert from 'node:assert/strict';
import {projectOperationalSignals,type OperationalMetric} from '../packages/operations/operational-health.ts';
import {readFileSync} from 'node:fs';

test('Stage 5 aggregate health is privacy-safe, does not include event records and distinguishes missing migrations',()=>{
 const metrics:OperationalMetric[]=[
  {code:'mail_failed',label:'Failures',count:3,enabled:true},
  {code:'projections_failed',label:'Projection',count:1,enabled:false},
  {code:'scanner_exhausted',label:'Scanner',count:null,enabled:false,unavailable:true},
  {code:'payment_open',label:'Payment',count:0,enabled:false},
  {code:'mail_pending',label:'Pending mail',count:20,enabled:true}
 ];
 const values=projectOperationalSignals(metrics);
 assert.deepEqual(values.map(x=>x.state),['attention','blocked','not_available','clear','clear']);
 assert.equal(values[0].count,3);
 assert.equal(values[2].count,null);
 assert.ok(!JSON.stringify(values).includes('payload'));
 assert.throws(()=>projectOperationalSignals([{code:'untrusted_synthetic',label:'Leak',count:1,enabled:true}]));
});
test('production observability has query redaction and sampled logs/traces',()=>{
 const cfg=JSON.parse(readFileSync('apps/platform/wrangler.jsonc','utf8'));
 for(const o of [cfg.observability,cfg.env.connected.observability]){
  assert.equal(o.redact_query_string,true);
  assert.equal(o.enabled,true);
  assert.equal(o.logs.enabled,true);
  assert.equal(o.logs.invocation_logs,false);
  assert.ok(o.logs.head_sampling_rate>0&&o.logs.head_sampling_rate<=0.25);
  assert.equal(o.traces.enabled,true);
  assert.ok(o.traces.head_sampling_rate>0&&o.traces.head_sampling_rate<=0.05);
 }
});
