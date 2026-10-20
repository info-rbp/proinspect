import { Link, useLoaderData, redirect, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { bookingIntent, propertySetupPath } from '../../../../packages/domain/booking-intent';
import type { Workspace } from '../../../../packages/domain/index';
export async function loader({request,context,params}:LoaderFunctionArgs){
 const serviceId=bookingIntent(params.serviceId),suffix=serviceId?'/'+serviceId:'';
 try{
  const session=await loadApi(request,context,'/api/session');
  const options=(session.workspaces as Workspace[]).filter(w=>['landlord','property-manager','strata-manager','commercial'].includes(w.kind));
  return {options,suffix};
 }catch{return {options:[] as Workspace[],suffix};}
}
export default function BookingChoice(){
 const {options,suffix}=useLoaderData<typeof loader>();
 return <main id="main" className="auth-page"><section className="panel stack">
 <p className="eyebrow">Book a ProInspect service</p><h1>How would you like to book?</h1><p>Both options connect to the same ProInspect team and operational system.</p>
 <div className="workspace-grid">
 <article className="workspace-card"><h2>Book a one-off service</h2><p>No account, password or subscription. Request a quote or book a published-price inspection.</p><Link className="button" to={'/guest/book'+suffix}>Book once</Link></article>
 <article className="workspace-card"><h2>Subscription customer</h2><p>Book included services for properties in your authorised workspace.</p>
 {options.length===1?<Link className="button" to={options[0].href+'/book'+suffix}>Continue to your workspace</Link>:
 <Link className="button" to={'/signin?returnTo='+encodeURIComponent('/book/subscriber'+suffix)}>Sign in to your portal</Link>}</article>
 </div></section></main>;
}
