import {Form,useLoaderData,useActionData,useNavigation,data,
  type LoaderFunctionArgs,type ActionFunctionArgs} from 'react-router';
import {loadApi,callApi} from '../lib/api.server';
import {PageHeading,Feedback} from '../../../../packages/ui/components';
export async function loader({request,context,params}:LoaderFunctionArgs){
  return loadApi(request,context,`/api/w/${params.kind}/${params.scopeId}/finance-reviews`);
}
export async function action({request,context,params}:ActionFunctionArgs){
  const f=await request.formData();
  const action=String(f.get('action')??''),get=(k:string)=>String(f.get(k)??'').trim();
  let body:Record<string,unknown>={action};
  if(action==='credit_request')body={...body,invoiceId:get('invoiceId'),
    amountCents:Number(get('amountCents')),rationale:get('rationale'),
    sourceReference:get('sourceReference'),requestKey:crypto.randomUUID()};
  else if(action==='credit_review')body={...body,proposalId:get('proposalId'),
    decision:get('decision'),sourceReference:get('sourceReference')};
  else if(action==='bank_record')body={...body,paymentId:get('paymentId'),
    observedAmountCents:Number(get('observedAmountCents')),
    observationType:get('observationType'),sourceReference:get('sourceReference'),requestKey:crypto.randomUUID()};
  else if(action==='bank_review')body={...body,observationId:get('observationId'),
    decision:get('decision'),sourceReference:get('sourceReference')};
  else return data({error:'Unsupported financial review action.'},{status:422});
  const r=await callApi(request,context,`/api/w/${params.kind}/${params.scopeId}/finance-reviews`,
    {method:'POST',body});
  const result=await r.json() as {message?:string;fields?:unknown};
  return data(r.ok?{ok:true,message:result.message??'Recorded for review.'}:
    {error:result.message??'Action unavailable.',fields:result.fields},{status:r.status});
}
const aud=(value:number)=>(value/100).toLocaleString('en-AU',{style:'currency',currency:'AUD'});
export default function FinanceReviews(){
  const d=useLoaderData<typeof loader>() as {
    invoices:{stripe_invoice_id:string;client_id:string;total_cents:number;status:string;reconciliation:string}[];
    payments:{id:string;total_cents:number;status:string;provider:string}[];
    credits:{id:string;stripe_invoice_id:string;amount_cents:number;status:string}[];
    observations:{id:string;payment_id:string;observed_amount_cents:number;observation_type:string;status:string}[];
    caveat:string;
  };
  const result=useActionData<any>(),busy=useNavigation().state!=='idle';
  return <>
    <PageHeading eyebrow="ProInspect Operations" title="Financial corrections & source evidence"
      description="Prepare and independently review customer credit proposals, bank observations and payout exceptions. Nothing here issues a Stripe credit note, processes a refund, transfers funds or changes settlement."/>
    <div className="stack"><Feedback value={result}/>
      <p className="notice warning">{d.caveat}</p>
      <section className="panel stack"><h2>Invoice correction proposals</h2>
        <Form method="post" className="form">
          <input type="hidden" name="action" value="credit_request"/>
          <label className="field">Observed invoice<select name="invoiceId" required defaultValue="">
            <option value="">Select invoice</option>
            {d.invoices.map(i=><option key={i.stripe_invoice_id} value={i.stripe_invoice_id}>
              {i.stripe_invoice_id} · {aud(i.total_cents)} · {i.status}</option>)}
          </select></label>
          <label className="field">Proposed credit (cents)<input name="amountCents" type="number" min="1" required/></label>
          <label className="field">Rationale<textarea name="rationale" minLength={8} required/></label>
          <label className="field">Source evidence reference<input name="sourceReference" minLength={8} required/></label>
          <button className="primary" disabled={busy||!d.invoices.length}>Record proposed credit</button>
        </Form>
        {d.credits.map(c=><div className="record-row" key={c.id}>
          <div><strong>{c.stripe_invoice_id}</strong><p>{aud(c.amount_cents)} · {c.status}</p></div>
          {c.status==='requested'&&<Form method="post" className="form">
            <input type="hidden" name="action" value="credit_review"/>
            <input type="hidden" name="proposalId" value={c.id}/>
            <label className="field">Independent reference<input name="sourceReference" minLength={8} required/></label>
            <button className="button secondary" name="decision" value="approved" disabled={busy}>Approve review only</button>
            <button className="button secondary" name="decision" value="rejected" disabled={busy}>Reject</button>
          </Form>}
        </div>)}
      </section>
      <section className="panel stack"><h2>Bank/payout reconciliation observations</h2>
        <Form method="post" className="form">
          <input type="hidden" name="action" value="bank_record"/>
          <label className="field">Payment<select name="paymentId" required defaultValue="">
            <option value="">Select payment</option>
            {d.payments.map(p=><option key={p.id} value={p.id}>
              {p.id} · {aud(p.total_cents)} · {p.provider}/{p.status}</option>)}
          </select></label>
          <label className="field">Observed amount (cents)<input type="number" name="observedAmountCents" min="0" required/></label>
          <label className="field">Observation<select name="observationType" defaultValue="bank_received">
            {['bank_received','bank_returned','payout_match','payout_exception']
              .map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}
          </select></label>
          <label className="field">Statement/settlement evidence reference<input name="sourceReference" minLength={8} required/></label>
          <button className="primary" disabled={busy||!d.payments.length}>Record observation</button>
        </Form>
        {d.observations.map(o=><div className="record-row" key={o.id}>
          <div><strong>{o.payment_id}</strong><p>{o.observation_type.replaceAll('_',' ')} · {aud(o.observed_amount_cents)} · {o.status}</p></div>
          {o.status==='recorded'&&<Form method="post" className="form">
            <input name="action" type="hidden" value="bank_review"/>
            <input name="observationId" type="hidden" value={o.id}/>
            <label className="field">Independent source reference<input name="sourceReference" minLength={8} required/></label>
            <button className="button secondary" name="decision" value="reviewed" disabled={busy}>Review evidence</button>
            <button className="button secondary" name="decision" value="disputed" disabled={busy}>Flag discrepancy</button>
          </Form>}
        </div>)}
      </section>
    </div>
  </>;
}
