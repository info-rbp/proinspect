import {LegalAcceptance} from '../components/LegalAcceptance';
import { data, Form, redirect, useActionData, useLoaderData, Link, type LoaderFunctionArgs, type ActionFunctionArgs } from 'react-router';
import { loadApi, callApi } from '../lib/api.server';
import { platformEnv } from '../../../../packages/database/context';
export const meta = () => [{ title: 'Subscription Checkout | ProInspect' }, { name: 'robots', content: 'noindex,nofollow' }];
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const env = platformEnv(context);
  const property = await loadApi(request, context, `/api/w/${params.kind}/${params.scopeId}/properties/${params.propertyId}`);
  return {
    property: property.property,
    enabled: env.APP_ENV === 'production'
      ? params.kind === 'landlord' && env.RESIDENTIAL_LIVE_BILLING_ENABLED === 'true' && /^txcd_[0-9]{8}$/.test(env.RESIDENTIAL_APPROVED_TAX_CODE ?? '') &&
        env.RESIDENTIAL_APPROVED_TAX_CODE !== 'txcd_10203001'
      : env.APP_ENV === 'staging' && env.STRIPE_BILLING_ENABLED === 'true' && env.STRIPE_TAX_READY === 'true',
    live: env.APP_ENV === 'production',
    friday: env.APP_ENV === 'production',
    workspaceHref: `/w/${params.kind}/${params.scopeId}`,
    kind: params.kind,
  };
}
export async function action({ request, context, params }: ActionFunctionArgs) {
  const form=await request.formData();
  const response = await callApi(request, context, '/api/stripe/subscription-checkout', {
    method: 'POST',
    body: { workspaceKind: params.kind, clientId: params.scopeId, propertyId: params.propertyId,legalConsent:form.get('legalConsent') },
  });
  const result = await response.json() as { checkoutUrl?: string; message?: string };
  if (!response.ok) return data({ error: result.message ?? 'Checkout is unavailable.' }, { status: response.status });
  if (!result.checkoutUrl || new URL(result.checkoutUrl).origin !== 'https://checkout.stripe.com')
    return data({ error: 'Stripe returned an invalid Checkout URL.' }, { status: 502 });
  throw redirect(result.checkoutUrl);
}
export default function StripeSubscribe() {
  const { property, enabled, workspaceHref, kind, live, friday } = useLoaderData<typeof loader>();
  const error = useActionData<typeof action>();
  const weekly = kind === 'landlord';
  return <main className="auth-page"><section className="panel stack">
    <h1>Residential Property Support Subscription</h1>
    <p>{property?.address}</p>
    <p>{weekly ? '$50 + GST ($55 including 10% Australian GST) per residential property per week' : '$250 per property per month excluding applicable GST'}.</p>
    {friday
      ? <p>All subscription renewals are scheduled for Fridays at 9:00 am Perth time. The first weekly payment is scheduled for the next eligible Friday, at least two hours after registration. No subscription-covered services become available until your first weekly invoice is paid and verified. If a payment fails later, a configurable grace period applies to previously paid customers.</p>
      : <p>Test environment. No live charges occur in this flow.</p>}
    {live ? <p>Cancellation is effective at the end of the paid weekly period. There is no automatic partial-week refund, except where law requires or an approved exception applies. Stripe will retry failed payments automatically according to the approved recovery settings.</p> : null}
    {enabled ? <Form method="post"><LegalAcceptance purpose="subscription"/><button className="button">{live ? 'Continue to Stripe subscription billing' : 'Open Stripe test Checkout'}</button></Form>
      : <p role="status">Residential subscription Checkout remains unavailable until the approved Stripe tax code, live webhook, restricted credentials and independent release acceptance are complete.</p>}
    {error && 'error' in error && <p role="alert">{error.error}</p>}
    <Link to={workspaceHref}>Return to your workspace</Link>
  </section></main>;
}