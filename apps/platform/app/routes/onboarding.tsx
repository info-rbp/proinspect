import {
  Form, Link, useActionData, useLoaderData, useNavigation, redirect, data,
  type LoaderFunctionArgs, type ActionFunctionArgs,
} from 'react-router';
import { bookingIntent, propertySetupPath } from '../../../../packages/domain/booking-intent';
import { loadApi, callApi } from '../lib/api.server';
import { Field, Feedback } from '../../../../packages/ui/components';

export const meta = () => [{ title: 'Choose your Landlord type | ProInspect' }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const session = await loadApi(request, context, '/api/session');
  return {
    user: session.user,
    serviceId: bookingIntent(new URL(request.url).searchParams.get('service')),
  };
}
export async function action({ request, context }: ActionFunctionArgs) {
  const form = await request.formData();
  const landlordType = form.get('landlordType');
  if (landlordType !== 'residential' && landlordType !== 'commercial')
    return data({ error: 'Choose Residential or Commercial as your Landlord type.' }, { status: 422 });
  if (form.get('selfManaged') !== 'yes')
    return data({
      error: 'Confirm that you own and self-manage the properties for this account.',
    }, { status: 422 });
  const response = await callApi(request, context, '/api/onboarding', {
    method: 'POST',
    body: {
      displayName: form.get('displayName'),
      clientName: form.get('clientName'),
      landlordType,
    },
  });
  const result = (await response.json()) as Record<string, any>;
  if (!response.ok)
    return data({ error: result.message, fields: result.fields }, { status: response.status });
  return redirect(propertySetupPath(
    `/w/${result.workspaceKind}/${result.clientId}`,
    bookingIntent(form.get('serviceId')),
  ));
}
export default function Onboarding() {
  const { user, serviceId } = useLoaderData<typeof loader>();
  const result = useActionData<any>();
  const busy = useNavigation().state !== 'idle';
  return (
    <main id="main" className="auth-page form-width">
      <Link className="brand" to="/workspaces">
        ProInspect<span>PROPERTY OPERATIONS</span>
      </Link>
      <section className="panel stack">
        <p className="eyebrow">Landlord account</p>
        <h1>Start with the essentials.</h1>
        <p>
          Select Residential or Commercial for property you own and manage yourself.
          Both accounts include eligible ProInspect services in the all-inclusive subscription.
        </p>
        <Form method="post" className="form">
          <input type="hidden" name="serviceId" value={serviceId ?? ''} />
          <Field label="Landlord type" name="landlordType">
            <select id="landlordType" name="landlordType" required defaultValue="residential">
              <option value="residential">Residential Landlord</option>
              <option value="commercial">Commercial Landlord</option>
            </select>
          </Field>
          <p className="small">
            Residential includes houses and apartments. Commercial includes offices, shops,
            warehouses and other commercial premises. Each uses its appropriate portal.
          </p>
          <Field label="Your name" name="displayName">
            <input id="displayName" name="displayName" required minLength={2} maxLength={100}
              autoComplete="name" defaultValue={user.display_name} />
          </Field>
          <Field label="Account name" name="clientName"
            help="Your name or the business name you use for properties you own.">
            <input id="clientName" name="clientName" required minLength={2} maxLength={160}
              defaultValue={user.display_name} />
          </Field>
          <label className="checkbox">
            <input type="checkbox" name="selfManaged" value="yes" required />
            <span>I own and self-manage the properties added to this account.</span>
          </label>
          <p className="small">
            Managing properties for other owners as a professional organisation requires
            a separate reviewed organisation setup.
          </p>
          <Feedback value={result} />
          <div className="form-footer">
            <Link to="/workspaces">Back</Link>
            <button className="primary" disabled={busy}>
              {busy ? 'Creating account…' : 'Create Landlord account'}
            </button>
          </div>
        </Form>
      </section>
    </main>
  );
}
