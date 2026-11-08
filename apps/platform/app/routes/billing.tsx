import {useState} from 'react';
import {useLoaderData,type LoaderFunctionArgs} from 'react-router';
import {loadApi} from '../lib/api.server';
import {useWorkspace,workspaceApi} from '../lib/workspace';
import {PageHeading,Badge} from '../../../../packages/ui/components';
import {OperationForm,Input,Panel,Select,options} from '../components/OperationForm';
import {inspectInvoiceObservation,invoiceObservationsCsv,type InvoiceReviewRow} from '../../../../packages/finance/invoice-review';
export async function loader({request,context,params}:LoaderFunctionArgs){return loadApi(request,context,`/api/w/${params.kind}/${params.scopeId}/billing`);}
const money=(n:number)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(n/100);
export default function Billing(){
 const d=useLoaderData<typeof loader>(),w=useWorkspace().workspace,api=workspaceApi(w.kind,w.scopeId),staff=w.kind==='staff';
 const [onlyExceptions,setOnlyExceptions]=useState(true),[csvError,setCsvError]=useState('');
 const observed=(d.invoices||[]) as InvoiceReviewRow[];
 const reviewed=observed.map(invoice=>({invoice,findings:inspectInvoiceObservation(invoice).flags}));
 const flagged=reviewed.filter(row=>row.findings.length>0);
 const visible=onlyExceptions?flagged:reviewed;
 function exportVisibleCsv(){
  setCsvError('');
  try{
   // The existing authenticated dashboard is a 100-row preview. Do not label
   // this as a complete ledger, bank statement, or financial reconciliation.
   const csv=invoiceObservationsCsv(visible.map(row=>row.invoice));
   const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
   const link=document.createElement('a');
   link.href=url;link.download='proinspect-invoice-observations-'+new Date().toISOString().slice(0,10)+'.csv';
   document.body.appendChild(link);link.click();link.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),1200);
  }catch{setCsvError('Unable to generate the invoice preview. No financial records were changed.');}
 }
 return <>
<PageHeading title="Billing and reconciliation" description="Service revenue, invoices and financial exceptions. These records do not authorise rent, bond or trust-money collection. Sandbox adapters never move live funds."/>
{!staff&&<Panel title="Secure billing self-service"><OperationForm endpoint={api+'/billing/portal'} label="Open billing portal" result={r=>r.url?<a className="button" href={r.url} rel="noreferrer">Continue to Stripe billing</a>:null}/></Panel>}
<Panel title="Property subscriptions">{d.subscriptions.map((s:any)=><p key={s.id}>{s.property_id} / {s.sector}: <Badge status={s.status}/></p>)}<p>Subscription financial status and included service entitlements are separate records.</p></Panel>
<Panel title="Invoice observations and exceptions">
 <p>Review the invoice records visible to your authorised workspace. {observed.length} invoice observation(s) returned; {flagged.length} require attention based on provider status, matching or arithmetic. This dashboard is capped at 100 recent records, so neither this view nor its export is a full bank or payout reconciliation.</p>
 <div className="actions">
  <button type="button" className="button secondary small" aria-pressed={onlyExceptions} onClick={()=>setOnlyExceptions(true)}>Needs review</button>
  <button type="button" className="button secondary small" aria-pressed={!onlyExceptions} onClick={()=>setOnlyExceptions(false)}>All visible invoices</button>
  <button type="button" className="button secondary small" onClick={exportVisibleCsv}>Download visible invoice CSV</button>
 </div>
 <p className="small muted">The download contains private client and invoice identifiers. Store it securely; it is a spreadsheet-safe observation preview, not a receipt or tax invoice.</p>
 {csvError&&<p role="alert">{csvError}</p>}
 {visible.length===0?<p>No invoice observations match this filter.</p>:visible.map(({invoice,findings})=>
  <div className="record-row" key={invoice.stripe_invoice_id}>
   <div><strong>{invoice.stripe_invoice_id}</strong>
    <p>{money(invoice.total_cents)} total · {money(invoice.paid_cents)} paid · {money(invoice.remaining_cents)} remaining</p>
    <p className="small">{findings.length?findings.join('; '):'No review flags in the visible provider snapshot.'}</p>
   </div><Badge status={invoice.status}/>
  </div>)}
</Panel>
<Panel title="Invoices">{d.invoices.map((i:any)=><div className="record-row" key={i.stripe_invoice_id}><div><strong>{i.stripe_invoice_id}</strong><p>{money(i.total_cents)} total / {money(i.paid_cents)} paid / {money(i.remaining_cents)} remaining</p><small>{i.reconciliation}</small></div><Badge status={i.status}/></div>)}{!d.invoices.length&&<p>No invoices recorded for this workspace.</p>}</Panel>
{staff&&<><Panel title="Payment exceptions">{d.exceptions.map((e:any)=><div key={e.id} className="stack"><p>{e.code} / {e.payment_id??'Unmatched provider object'}</p><OperationForm endpoint={`${api}/billing/reconciliation/${e.id}`} label="Record verified resolution"><Input name="reference" label="Investigation and resolution evidence (at least 8 characters)"/></OperationForm></div>)}</Panel>
<Panel title="Request a refund"><OperationForm endpoint={api+'/billing/refunds/request'} label="Request independent review"><Input name="paymentId" label="Settled payment ID"/><Input name="amountCents" type="number" label="Refund amount (AUD cents)"/><Input name="reason" label="Authorised refund reason and supporting reference"/></OperationForm></Panel>
{d.refunds.map((r:any)=><Panel key={r.id} title={`${r.description} - ${money(r.amount_cents)}`} description={`Refund ${r.id}: ${r.status}`}>{r.status==='requested'&&<><OperationForm endpoint={`${api}/billing/refunds/${r.id}/approve`} label="Approve refund"><Input name="reference" label="Independent review reference"/></OperationForm><OperationForm endpoint={`${api}/billing/refunds/${r.id}/reject`} label="Reject refund"><Input name="reference" label="Reason for rejection"/></OperationForm></>}{r.status==='approved'&&<OperationForm endpoint={`${api}/billing/refunds/${r.id}/execute`} label="Submit approved sandbox refund"><Input name="reference" label="Execution review reference"/></OperationForm>}</Panel>)}
<Panel title="Independently authorised invoice delivery">
 <p>Sandbox dispatch requires a currently approved billing contact, a separately finalised statement and an identical email address on the Stripe customer. Provider acceptance does not confirm inbox delivery. A lost response must be reconciled before any retry.</p>
 <OperationForm endpoint={api+'/billing/contacts/request'} label="Propose billing recipient"><Input name="clientId" label="Billing client ID"/><Input name="email" type="email" label="Billing recipient email"/><Input name="authorityReference" label="Client authority evidence"/></OperationForm>
 {d.contacts?.map((c:any)=><div className="record-row" key={c.id}><div><strong>{c.email}</strong><p>{c.client_id} · <Badge status={c.status}/></p><small>{c.id}</small></div>
 <div>{c.status==='pending'&&<OperationForm endpoint={api+'/billing/contacts/approve'} label="Independently approve"><input type="hidden" name="contactId" value={c.id}/><Input name="reference" label="Independent authority review"/></OperationForm>}
 {c.status!=='revoked'&&<OperationForm endpoint={api+'/billing/contacts/revoke'} label="Revoke recipient"><input type="hidden" name="contactId" value={c.id}/><Input name="reference" label="Revocation reason"/></OperationForm>}</div></div>)}
 <OperationForm endpoint={api+'/billing/invoices/send'} label="Dispatch independently reviewed sandbox invoice"><Input name="statementId" label="Approved statement ID"/><Input name="contactId" label="Approved recipient ID"/><Input name="approvalReference" label="Dispatch authority reference"/></OperationForm>
 {d.dispatches?.map((x:any)=><p key={x.statement_id}>{x.stripe_invoice_id} / {x.recipient_email} — {x.status}</p>)}
</Panel>
<Panel title="Approved agency statement to Stripe draft"><OperationForm endpoint={api+'/billing/invoices/export'} label="Prepare unsent sandbox invoice"><Input name="statementId" label="Independently approved statement ID"/><Input name="dueDays" type="number" label="Agreed payment term (days)"/><Input name="termsReference" label="Agreed billing terms evidence"/></OperationForm><p>The invoice stays unsent and uncharged. A second reviewer must verify the exact statement total before finalisation.</p><OperationForm endpoint={api+'/billing/invoices/finalize'} label="Independently finalise sandbox invoice"><Input name="statementId" label="Statement ID"/><Input name="approvalReference" label="Independent finalisation approval reference"/></OperationForm></Panel></>}
</>;}
