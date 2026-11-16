import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { bookingIntent } from '../../../../packages/domain/booking-intent';
import type { Workspace } from '../../../../packages/domain/index';
export async function loader({request,context,params}:LoaderFunctionArgs) {
  const serviceId=bookingIntent(params.serviceId), suffix=serviceId?'/'+serviceId:'';
  try {
    const session=await loadApi(request,context,'/api/session');
    const options=(session.workspaces as Workspace[]).filter(w=>['landlord','property-manager','strata-manager','commercial'].includes(w.kind));
    return {options,suffix,signedIn:true};
  } catch { return {options:[] as Workspace[],suffix,signedIn:false}; }
}
export default function BookingChoice() {
  const {options,suffix,signedIn}=useLoaderData<typeof loader>();
  const signIn='/signin?returnTo='+encodeURIComponent('/book'+suffix);
  return <main id="main" className="auth-page"><section className="panel stack">
    <p className="eyebrow">Book a ProInspect service · UX-BOOK v1.0.0</p>
    <h1>Book using your ProInspect account</h1>
    <p>One-off service customers can create a free account without a subscription. Every confirmed booking is linked to a verified customer and an authorised property.</p>
    {options.length>0 ? <>
      <div className="workspace-grid">
        {options.map(w=><article key={w.href} className="workspace-card">
          <h2>{w.name}</h2><p>Use this authorised property or organisation account for your service.</p>
          <Link className="button" to={w.href+'/book'+suffix}>Continue to booking</Link>
        </article>)}
      </div>
      <p className="small">Need a new owner account? <Link to="/workspaces">Set up Residential or Commercial in My ProInspect</Link>.</p>
    </> : <section className="panel stack">
      <h2>{signedIn?'Create or access an authorised property account':'Sign in or register for free'}</h2>
      <p>{signedIn?'Choose Residential, Commercial or a verified professional organisation.':'Verify your email once, then add a property or join an approved organisation.'}</p>
      <Link className="button" to={signedIn?'/workspaces':signIn}>{signedIn?'Open My ProInspect':'Continue with email'}</Link>
    </section>}
    <p className="small">If a service requires a price or scope confirmation, a request is not a confirmed appointment. Historic guest booking management links remain available for existing customers.</p>
  </section></main>;
}
