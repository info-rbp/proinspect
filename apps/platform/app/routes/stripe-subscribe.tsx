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
    enabled: env.APP_ENV === 'staging' && env.STRIPE_BILLING_ENABLED === 'true' && env.STRIPE_TAX_READY === 'true',
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
  const { property, enabled, workspaceHref, kind } = useLoaderData<typeof loader>();
  const error = useActionData<typeof action>();
  const weekly = kind === 'landlord';
  return <main className="auth-page"><section className="panel stack">
    <h1>Property support subscription — sandbox</h1>
    <p>{property?.address}</p>
    <p>{weekly ? '$50 per property per week' : '$250 per property per month'} excluding applicable GST.</p>
    <p>Test mode only. This flow cannot take live payments or change your existing subscription entitlements.</p>
    {enabled ? <Form method="post"><LegalAcceptance purpose="subscription"/><button className="button">Open Stripe test Checkout</button></Form>
      : <p role="status">Stripe sandbox subscription checkout remains disabled pending Tax, credentials, webhook verification and acceptance.</p>}
    {error && 'error' in error && <p role="alert">{error.error}</p>}
    <Link to={workspaceHref}>Return to your workspace</Link>
  </section></main>;
}