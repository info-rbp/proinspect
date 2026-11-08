import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {catalogueSql} from '../../scripts/catalogue-sql.mjs';

// Synthetic Stripe contract: no credentials, charges, emails or public network calls.
mkdirSync('artifacts',{recursive:true});
await build({entryPoints:['tests/runtime/sprint-entry.ts'],outfile:'artifacts/invoice-delivery-worker.mjs',bundle:true,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers','node:*']});
let deliveries=0,remoteEmail='finance@agency.example.test',customerId='cus_invoice_test';
const calls=[];
const mf=new Miniflare({modules:true,scriptPath:'artifacts/invoice-delivery-worker.mjs',compatibilityDate:'2026-07-01',compatibilityFlags:['nodejs_compat'],
 d1Databases:{DB:'invoice-delivery-test'},r2Buckets:{DOCUMENTS:'invoice-docs',RESTRICTED_DOCUMENTS:'invoice-private'},durableObjects:{SCHEDULER:{className:'BookingScheduler',useSQLite:true}},
 bindings:{APP_ENV:'local',APP_ORIGIN:'http://localhost',DATA_ENCRYPTION_KEY:randomBytes(32).toString('base64'),EMAIL_PROVIDER:'local',STRIPE_ACCOUNT_ID:'acct_1USumhEv62nbUZok',STRIPE_SECRET_KEY:'rk_test_isolated_invoice',STRIPE_WEBHOOK_SECRET:'whsec_isolated_invoice',STRIPE_INVOICING_ENABLED:'true',STRIPE_TAX_READY:'true'},
 outboundService:async req=>{
  const u=new URL(req.url);assert.equal(u.origin,'https://api.stripe.com');calls.push([u.pathname,req.method]);
  if(u.pathname==='/v1/account')return Response.json({id:'acct_1USumhEv62nbUZok'});
  if(u.pathname==='/v1/invoices/in_invoice_lost')return Response.json({id:'in_invoice_lost',livemode:false,customer:customerId,currency:'aud',total:11000,status:'open',collection_method:'send_invoice'});
  if(u.pathname==='/v1/invoices/in_invoice_test')return Response.json({id:'in_invoice_test',livemode:false,customer:customerId,currency:'aud',total:11000,status:'open',collection_method:'send_invoice'});
  if(u.pathname==='/v1/customers/'+customerId)return Response.json({id:customerId,livemode:false,email:remoteEmail});
  if(u.pathname==='/v1/invoices/in_invoice_lost/send'){
   assert.equal(req.headers.get('Idempotency-Key'),'proinspect-invoice-send-stmt_lost');
   deliveries++;return new Response('provider timeout after uncertain acceptance',{status:503});
  }
  if(u.pathname==='/v1/invoices/in_invoice_test/send'){
   const idempotency=req.headers.get('Idempotency-Key');assert.equal(idempotency,'proinspect-invoice-send-stmt_invoice');
   deliveries++;
   return Response.json({id:'in_invoice_test',livemode:false,customer:customerId,status:'open'});
  }
  throw new Error('Unapproved provider request: '+u.pathname);
 }});
const db=await mf.getD1Database('DB'),run=(sql,...values)=>db.prepare(sql).bind(...values).run(),first=(sql,...values)=>db.prepare(sql).bind(...values).first();
const checks=[];async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name)}
async function api(path,user,body){const r=await mf.dispatchFetch('http://localhost'+path,{method:body===undefined?'GET':'POST',headers:{Origin:'http://localhost',...(user?{Cookie:user.cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:(r.headers.get('content-type')||'').includes('json')?await r.json():await r.text(),response:r};}
async function ok(path,user,body,status=200){const r=await api(path,user,body);assert.equal(r.status,status,`${path}: ${JSON.stringify(r.data)}`);return r.data;}
async function login(name){const email=`${name}@invoice.example.test`,start=await ok('/api/auth/start',null,{email}),token=new URL(start.localSignInUrl).searchParams.get('token'),result=await api('/api/auth/complete',null,{email,token});assert.equal(result.status,200);return {id:(await first('SELECT id FROM users WHERE email=?',email)).id,cookie:result.response.headers.get('set-cookie').split(';')[0]};}
try{
 for(const q of JSON.parse(execFileSync('python3',['scripts/schema-statements.py'],{encoding:'utf8'})))await run(q);
 for(const q of catalogueSql().split('\n'))await run(q);
 const ops1=await login('ops1'),ops2=await login('ops2'),ops3=await login('ops3'),outside=await login('outside');
 for(const user of [ops1,ops2,ops3])await run("INSERT INTO staff_profiles(user_id,role,active) VALUES(?,'operations_manager',1)",user.id);
 const stamp='2026-10-27T00:00:00.000Z';
 await run("INSERT INTO clients(id,name,client_type,created_at) VALUES('agency_invoice','Test agency','agency',?)",stamp);
 await run("INSERT INTO agency_commercial_agreements(id,client_id,reference,tier,pricing_model,base_monthly_cents,gst_basis_points,status,effective_at,created_by,approved_by,created_at) VALUES('agr_invoice','agency_invoice','AGR-INVOICE','custom','per_service',0,1000,'approved',?,?,?,?)",stamp,ops1.id,ops2.id,stamp);
 await run("INSERT INTO agency_monthly_statements(id,agreement_id,period,subtotal_cents,gst_cents,total_cents,status,prepared_by,approved_by,created_at) VALUES('stmt_invoice','agr_invoice','2026-10',10000,1000,11000,'draft',?,NULL,?)",ops1.id,stamp);
 await run("INSERT INTO agency_statement_lines(id,statement_id,description,amount_cents) VALUES('ln_invoice','stmt_invoice','Test inspection',10000)");
 await run("UPDATE agency_monthly_statements SET status='approved',approved_by=? WHERE id='stmt_invoice'",ops2.id);
 await run("INSERT INTO billing_invoices(stripe_invoice_id,client_id,statement_id,stripe_customer_id,currency,subtotal_cents,total_cents,remaining_cents,status,reconciliation,created_at,updated_at) VALUES('in_invoice_test','agency_invoice','stmt_invoice',?,'AUD',10000,11000,11000,'draft','matched',?,?)",customerId,stamp,stamp);
 await run("INSERT INTO agency_invoice_exports(statement_id,client_id,snapshot_hash,status,due_days,terms_reference,stripe_invoice_id,requested_by,approved_by,created_at,updated_at) VALUES('stmt_invoice','agency_invoice',?,'finalized',14,'SIGNED-TERMS','in_invoice_test',?,?,?,?)",'a'.repeat(64),ops1.id,ops2.id,stamp,stamp);
 const base='/api/w/staff/operations/billing';
 const send={statementId:'stmt_invoice',contactId:'unused',approvalReference:'SENDER-REFERENCE-2026'};
 await check('unauthenticated and non-Staff dispatch cannot query Stripe',async()=>{
  assert.equal((await api(base+'/invoices/send',null,send)).status,401);
  assert.equal((await api(base+'/invoices/send',outside,send)).status,403);
  assert.equal(calls.length,0);
 });
 await check('unapproved or missing contact cannot dispatch an invoice',async()=>{
  assert.equal((await api(base+'/invoices/send',ops1,send)).status,409);
  assert.equal(deliveries,0);
 });
 const contact=await ok(base+'/contacts/request',ops1,{clientId:'agency_invoice',email:remoteEmail,authorityReference:'AGENCY-FINANCE-AUTHORITY-2026'});
 await check('billing recipient requires a separate Staff reviewer',async()=>{
  assert.equal(contact.status,'pending');
  assert.equal((await api(base+'/contacts/approve',ops1,{contactId:contact.id,reference:'SELF-APPROVAL'})).status,403);
  assert.equal((await api(base+'/invoices/send',ops3,{...send,contactId:contact.id})).status,409);
  assert.equal(deliveries,0);
  assert.equal((await ok(base+'/contacts/approve',ops2,{contactId:contact.id,reference:'REVIEWED-AUTHORITY-2026'})).status,'approved');
  assert.equal((await first('SELECT approved_by FROM billing_invoice_contacts WHERE id=?',contact.id)).approved_by,ops2.id);
 });
 await check('recipient reviewer cannot also dispatch the invoice',async()=>{
  assert.equal((await api(base+'/invoices/send',ops2,{...send,contactId:contact.id})).status,403);
  assert.equal(deliveries,0);
 });
 await check('provider customer email mismatch blocks dispatch without even reserving a send',async()=>{
  remoteEmail='stranger@not-agency.example.test';
  assert.equal((await api(base+'/invoices/send',ops3,{...send,contactId:contact.id})).status,409);
  assert.equal(await first("SELECT statement_id FROM billing_invoice_dispatches WHERE statement_id='stmt_invoice'"),null);
  assert.equal(deliveries,0);
  remoteEmail='finance@agency.example.test';
 });
 await check('sandbox accepts exact invoice once, with no inbox-delivery claim',async()=>{
  const result=await ok(base+'/invoices/send',ops3,{...send,contactId:contact.id});
  assert.equal(result.providerAccepted,true);assert.equal(result.inboxDeliveryVerified,false);
  assert.equal(deliveries,1);
  const d=await first("SELECT * FROM billing_invoice_dispatches WHERE statement_id='stmt_invoice'");
  assert.equal(d.status,'provider_accepted');assert.equal(d.recipient_email,remoteEmail);
  assert.equal((await first('SELECT COUNT(*) AS n FROM billing_invoice_dispatch_events')).n,2);
  assert.equal((await first("SELECT total_cents,remaining_cents FROM billing_invoices WHERE stripe_invoice_id='in_invoice_test'")).total_cents,11000);
 });
 await check('idempotent repeat returns recorded provider acceptance without sending again',async()=>{
  const d=await ok(base+'/invoices/send',ops3,{...send,contactId:contact.id});assert.equal(d.replayed,true);assert.equal(deliveries,1);
 });
 await check('revoked billing contact blocks new or repeated disclosure',async()=>{
  await ok(base+'/contacts/revoke',ops1,{contactId:contact.id,reference:'AUTHORITY-REMOVED-2026'});
  const r=await api(base+'/invoices/send',ops3,{...send,contactId:contact.id});assert.equal(r.status,409);assert.equal(deliveries,1);
 });
 // A second approved statement represents lost response after request was submitted to Stripe.
 await run("INSERT INTO agency_monthly_statements(id,agreement_id,period,subtotal_cents,gst_cents,total_cents,status,prepared_by,approved_by,created_at) VALUES('stmt_lost','agr_invoice','2026-09',10000,1000,11000,'draft',?,NULL,?)",ops1.id,stamp);
 await run("INSERT INTO agency_statement_lines(id,statement_id,description,amount_cents) VALUES('ln_lost','stmt_lost','Test prior inspection',10000)");
 await run("UPDATE agency_monthly_statements SET status='approved',approved_by=? WHERE id='stmt_lost'",ops2.id);
 await run("INSERT INTO billing_invoices(stripe_invoice_id,client_id,statement_id,stripe_customer_id,currency,subtotal_cents,total_cents,remaining_cents,status,reconciliation,created_at,updated_at) VALUES('in_invoice_lost','agency_invoice','stmt_lost',?,'AUD',10000,11000,11000,'draft','matched',?,?)",customerId,stamp,stamp);
 await run("INSERT INTO agency_invoice_exports(statement_id,client_id,snapshot_hash,status,due_days,terms_reference,stripe_invoice_id,requested_by,approved_by,created_at,updated_at) VALUES('stmt_lost','agency_invoice',?,'finalized',14,'SIGNED-TERMS','in_invoice_lost',?,?,?,?)",'b'.repeat(64),ops1.id,ops2.id,stamp,stamp);
 const second=await ok(base+'/contacts/request',ops1,{clientId:'agency_invoice',email:remoteEmail,authorityReference:'AGENCY-FINANCE-AUTHORITY-RENEWED'});
 await ok(base+'/contacts/approve',ops2,{contactId:second.id,reference:'APPROVED-RECIPIENT-RENEWAL'});
 await check('losing provider response preserves a no-repeat dispatch reservation',async()=>{
  const before=deliveries;
  const r=await api(base+'/invoices/send',ops3,{statementId:'stmt_lost',contactId:second.id,approvalReference:'LOST-RESPONSE-TEST'});
  // The provider is intentionally not configured to accept the second invoice; the synthetic failure is controlled.
  assert.equal(r.status,502);assert.equal(deliveries,before+1);
  assert.equal((await first("SELECT status FROM billing_invoice_dispatches WHERE statement_id='stmt_lost'")).status,'needs_reconciliation');
  const retry=await api(base+'/invoices/send',ops3,{statementId:'stmt_lost',contactId:second.id,approvalReference:'LOST-RESPONSE-TEST'});
  assert.equal(retry.status,409);assert.equal(deliveries,before+1);
 });
 console.log(`Invoice delivery: ${checks.length} checks passed; synthetic adapter, no live provider.`);
}finally{await mf.dispose();}
