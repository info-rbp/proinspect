import {
  Form,
  Link,
  data,
  useLoaderData,
  useActionData,
  useNavigation,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from 'react-router';
import { loadApi, callApi } from '../lib/api.server';
import { getOnboardingFlow } from '../../../../packages/onboarding/registry';
import { withService } from '../../../../packages/onboarding/entry';
import { bookingIntent } from '../../../../packages/domain/booking-intent';
import { PageHeading, Badge, Field, Feedback } from '../../../../packages/ui/components';
import { Panel } from '../components/OperationForm';

type ProfessionalTag = 'ONB-RES-AGENCY';
const categories: Record<ProfessionalTag, { kind: string; label: string }> = {
  'ONB-RES-AGENCY': { kind: 'property-manager', label: 'Residential management' },
};
function professionalTag(value: unknown): ProfessionalTag {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(categories, value)
    ? (value as ProfessionalTag)
    : 'ONB-RES-AGENCY';
}
export async function loader({ request, context }: LoaderFunctionArgs) {
  const d = (await loadApi(request, context, '/api/organisation-applications')) as any;
  const query = new URL(request.url).searchParams;
  const flowId = professionalTag(query.get('flow'));
  return { ...d, flowId, serviceId: bookingIntent(query.get('service')) };
}
export const meta = () => [
  { title: 'Set up your professional organisation | ProInspect' },
  { name: 'robots', content: 'noindex,nofollow' },
];
export async function action({ request, context }: ActionFunctionArgs) {
  const form = await request.formData();
  const selected = professionalTag(form.get('flowId'));
  if (form.get('flowId') !== selected)
    return data({ error: 'Choose a valid professional organisation type.' }, { status: 422 });
  const response = await callApi(request, context, '/api/organisation-applications', {
    method: 'POST',
    body: {
      kind: categories[selected].kind,
      name: form.get('name'),
      businessReference: form.get('businessReference'),
    },
  });
  const result = (await response.json()) as Record<string, any>;
  if (!response.ok)
    return data({ error: result.message, fields: result.fields }, { status: response.status });
  return {
    ok: true,
    message:
      'Your setup request is awaiting ProInspect review. We will confirm your authority and assignments before activating professional access.',
  };
}
export default function Organisation() {
  const d = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const busy = useNavigation().state !== 'idle';
  const selected = d.flowId as ProfessionalTag;
  const flow = getOnboardingFlow(selected)!;
  return (
    <main id="main" className="content">
      <PageHeading
        title="Set up your organisation"
        description="Get inspection, reporting and property support for the portfolio you manage. Tell us who you represent so we can confirm your authority and connect the right accounts."
      />
      <div className="stack">
        <nav className="actions" aria-label="Professional organisation type">
          {(Object.entries(categories) as [ProfessionalTag, { kind: string; label: string }][]).map(
            ([id, cat]) => (
              <Link
                key={id}
                className={id === selected ? 'button' : 'button secondary'}
                to={withService('/organisation?flow=' + id, d.serviceId)}
              >
                {cat.label}
              </Link>
            ),
          )}
        </nav>
        <Panel title={flow.title} description={flow.summary}>
          <p className="small">
            This is a free setup request. Professional access is activated after review;
            registration does not authorise services or start a paid plan.
          </p>
          {d.serviceId && (
            <p className="notice">
              Your service selection is kept in this setup link. Once approved, return through My
              ProInspect to continue with your authorised account.
            </p>
          )}
          <Form method="post" className="form" key={selected}>
            <input type="hidden" name="flowId" value={selected} />
            <Field name="name" label="Organisation or legal business name">
              <input
                id="name"
                name="name"
                required
                minLength={2}
                maxLength={180}
                autoComplete="organization"
              />
            </Field>
            <Field
              name="businessReference"
              label="Business / engagement reference"
              help="Use a business registration or engagement reference. We may request evidence of your appointment during review."
            >
              <input
                id="businessReference"
                name="businessReference"
                required
                minLength={4}
                maxLength={500}
              />
            </Field>
            <Feedback value={result} />
            <button className="primary" disabled={busy}>
              {busy ? 'Submitting request…' : 'Submit for approval'}
            </button>
          </Form>
          <p className="small">
            ABN, appointments, management evidence and scheme or property assignments can be
            requested in a later verification step. Approval remains a separate staff decision.
          </p>
        </Panel>
        <Panel title="Your setup requests">
          {d.applications.length ? (
            d.applications.map((a: any) => (
              <div className="record-row" key={a.id}>
                <div>
                  <strong>{a.name}</strong>
                  <p className="small">{a.workspace_kind}</p>
                </div>
                <Badge status={a.status} />
              </div>
            ))
          ) : (
            <p>No professional applications submitted yet.</p>
          )}
        </Panel>
        <Link className="button secondary" to={withService('/workspaces', d.serviceId)}>
          Return to My ProInspect
        </Link>
      </div>
    </main>
  );
}
