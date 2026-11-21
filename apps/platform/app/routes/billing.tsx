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
<PageHeading title={staff?"Billing and reconciliation":"Property plans and invoices"} description={staff?"Service revenue, invoices and financial exceptions.":"Review your property subscription, paid invoices and written cancellation notices."}/>
{!staff&&d.customerCashTerms&&<Panel title="One-off inspection payment terms">
 <p>{d.customerCashTerms.termCode==='upon_booking'
  ? 'Pay-as-you-go services require payment upon booking.'
  : d.customerCashTerms.termCode==='net_7'
   ? 'Approved Cash Client terms: seven calendar days from the date an invoice is issued after service completion.'
   : 'Approved Cash Client terms: month-end invoicing, due on the seventh of the following month.'}</p>
 <p className="small">Only bookings not covered by an eligible subscription have a separate service charge. Your property-specific subscription benefits are checked when you book.</p>
</Panel>}
{!staff&&d.portalEnabled&&<Panel title="Secure billing self-service"><OperationForm endpoint={api+'/billing/portal'} label="Open billing portal" result={r=>r.url?<a className="button" href={r.url} rel="noreferrer">Continue to Stripe billing</a>:null}/></Panel>}
<Panel title="Property subscriptions">{d.subscriptions.map((s:any)=><p key={s.id}>{s.address ?? s.property_id}: <Badge status={s.status}/></p>)}<p>Subscription financial status and included service entitlements are separate records.</p></Panel>
{staff && <Panel title="Written cancellation notices">
 {d.cancellationNotices?.length ? d.cancellationNotices.map((n:any)=><article className="stack" key={n.billing_link_id}>
   <h3>{n.address}</h3><p>Received {new Date(n.received_at).toLocaleDateString('en-AU',{timeZone:'Australia/Perth'})} · Earliest ordinary end {new Date(n.earliest_end_at).toLocaleDateString('en-AU',{timeZone:'Australia/Perth'})}</p>
   <p>{n.reason}</p><Badge status={n.status}/>
   {n.reviewed_at && <p>Last verified {new Date(n.reviewed_at).toLocaleString('en-AU',{timeZone:'Australia/Perth'})}</p>}
   {d.sandboxNoticeReview && n.status!=='withdrawn' && <OperationForm endpoint={api+'/billing/cancellation-review'} defaults={{billingLinkId:n.billing_link_id}} label="Verify existing schedule in Stripe sandbox" />}
 </article>) : <p>No written cancellation notices received.</p>}
 </Panel>}
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
{w.kind==='landlord' && <Panel title="Written subscription cancellation notice">
 <p>The initial term is 24 months with 60 days’ written cancellation notice. A notice does not immediately stop charges. The end date and any statutory right or exceptional circumstances require review before cancellation is scheduled with Stripe.</p>
 {d.subscriptions.filter((s:any)=>s.plan_version).map((s:any)=><div key={s.id} className="stack">
  <h3>{s.address ?? 'Property subscription'}</h3>
  {s.notice_received_at?<p>Written notice received {new Date(s.notice_received_at).toLocaleDateString('en-AU')}. Earliest ordinary end date: {new Date(s.notice_earliest_end_at).toLocaleDateString('en-AU')}. <Badge status={s.notice_status}/> Contact ProInspect for confirmation.</p>:
   s.contract_starts_at&&!['canceled','expired'].includes(s.status)?<OperationForm endpoint={api+'/billing/cancellation-notice'} label="Record written notice" result={r=><p>Notice received: {r.received_at}. Earliest ordinary end date: {r.earliest_end_at}. Pending review; contact ProInspect for confirmation.</p>}><input type="hidden" name="billingLinkId" value={s.id}/><Input name="reason" label="Reason or instructions"/></OperationForm>:
   <p>{s.contract_starts_at?'This subscription has ended.':'The subscription start is awaiting provider verification.'} Contact ProInspect for assistance.</p>}
 </div>)}
 {!d.subscriptions.some((s:any)=>s.plan_version)&&<p>No new weekly subscription contract is recorded for this account.</p>}
</Panel>}
<Panel title="Invoices">{d.invoices.map((i:any)=><div className="record-row" key={i.stripe_invoice_id}><div><strong>{i.stripe_invoice_id}</strong><p>{money(i.total_cents)} total / {money(i.paid_cents)} paid / {money(i.remaining_cents)} remaining</p><small>{i.reconciliation}</small></div><Badge status={i.status}/></div>)}{!d.invoices.length&&<p>No invoices recorded for this workspace.</p>}</Panel>
{staff&&<><Panel title="Cash Clients — payment terms & credit">
 <p>Free accounts default to payment upon booking. Deferred payment terms are available only after a separate Staff reviewer approves the request. Subscription-covered bookings never incur a second inspection charge.</p>
 <div className="stack">
  {(d.cashClients||[]).map((c:any)=><div className="record-row" key={c.id}>
   <div><strong>{c.name}</strong><p className="small">{c.id} · {c.term_code==='upon_booking'?'Pay upon booking':c.term_code==='net_7'?'7 calendar days':'7 days end of month'} · Unsettled: {money(c.outstanding_cents??0)}</p></div>
   <span className="small muted">Credit limit: {c.credit_limit_cents===null?'Not set':money(c.credit_limit_cents)}</span>
  </div>)}
 </div>
 <h3>Propose Cash Client payment terms</h3>
 <OperationForm endpoint={api+'/billing/cash-terms/request'} label="Submit for independent approval">
  <Select name="clientId" label="Customer" options={(d.cashClients||[]).map((c:any)=>({value:c.id,label:c.name+' ('+c.id+')'}))}/>
  <Select name="termCode" label="Payment terms" options={[
   {value:'upon_booking',label:'Payment upon booking'},
   {value:'net_7',label:'7 calendar days from invoice issue'},
   {value:'eom_7',label:'7 days end of month'}]}/>
  <Input name="creditLimitCents" type="number" label="Maximum unsettled credit (AUD cents, optional)" required={false}/>
  <Input name="reason" label="Commercial approval reason (at least 8 characters)"/>
 </OperationForm>
 {(d.cashTermRequests||[]).map((r:any)=><div className="record-row" key={r.id}>
  <div><strong>{r.client_name}</strong><p>{r.term_code} · <Badge status={r.status}/> · Requested by {r.requested_by_name}</p><p className="small">{r.reason}</p></div>
  {r.status==='pending'&&<div className="stack">
   <OperationForm endpoint={api+'/billing/cash-terms/approve'} label="Approve terms"><input type="hidden" name="requestId" value={r.id}/><Input name="reviewReference" label="Independent approval evidence"/></OperationForm>
   <OperationForm endpoint={api+'/billing/cash-terms/decline'} label="Decline terms"><input type="hidden" name="requestId" value={r.id}/><Input name="reviewReference" label="Reason for decline"/></OperationForm>
  </div>}
 </div>)}
</Panel>
<Panel title="Cash Client invoices — preparation">
 <p>Only completed services enter the invoice queue. Preparing a batch does not send a tax invoice or mark it paid; an independently reconciled Stripe invoice delivery is required for issuance.</p>
 <OperationForm endpoint={api+'/billing/cash-invoices/prepare'} label="Prepare invoice batch">
  <Select name="clientId" label="Customer" options={(d.cashClients||[]).map((c:any)=>({value:c.id,label:c.name}))}/>
  <Select name="termCode" label="Approved terms" options={[{value:'net_7',label:'7 days'},{value:'eom_7',label:'7 days end of month'}]}/>
  <Input name="period" label="Completed booking ID (7-day) or closed YYYY-MM month (EOM)" />
 </OperationForm>
 {(d.cashCharges||[]).map((c:any)=><div className="record-row" key={c.booking_id}>
  <div><strong>{c.reference} · {c.address}</strong><p>{c.client_name} · {c.term_code} · {c.period??'Awaiting service'} · {money(c.amount_ex_gst_cents+c.gst_cents)}</p></div><Badge status={c.status}/>
 </div>)}
 {(d.cashInvoiceBatches||[]).map((i:any)=><div className="record-row" key={i.id}>
  <div><strong>{i.client_name} · {i.id}</strong><p>{i.period} · {money(i.total_cents)} · Provider invoice: {i.provider_invoice_id??'Not issued'}</p></div><Badge status={i.status}/>
 </div>)}
</Panel>
<Panel title="Payment exceptions">{d.exceptions.map((e:any)=><div key={e.id} className="stack"><p>{e.code} / {e.payment_id??'Unmatched provider object'}</p><OperationForm endpoint={`${api}/billing/reconciliation/${e.id}`} label="Record verified resolution"><Input name="reference" label="Investigation and resolution evidence (at least 8 characters)"/></OperationForm></div>)}</Panel>
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
