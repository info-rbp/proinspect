import {
  Form, Link, useLoaderData, useActionData, useNavigation, redirect, data,
  type LoaderFunctionArgs, type ActionFunctionArgs,
} from 'react-router';
import { loadApi, callApi } from '../lib/api.server';
import { Feedback } from '../../../../packages/ui/components';
export const meta = () => [
  { title: 'Accept property invitation | ProInspect' },
  { name: 'robots', content: 'noindex,nofollow' },
];
export async function loader({ request, context }: LoaderFunctionArgs) {
  const session = await loadApi(request, context, '/api/session');
  const token = new URL(request.url).searchParams.get('token') ?? '';
  const preview = await loadApi(request, context,
    '/api/invitations/preview?token=' + encodeURIComponent(token)) as any;
  return {
    email: session.user.email,
    token,
    preview,
  };
}
export async function action({ request, context }: ActionFunctionArgs) {
  const form = await request.formData();
  const response = await callApi(request, context, '/api/invitations/accept', {
    method: 'POST',
    body: { token: form.get('token') },
  });
  const result = (await response.json()) as any;
  if (!response.ok) return data({ error: result.message }, { status: response.status });
  return redirect(result.tenancyId ? `/w/tenant/${result.tenancyId}` : (result.returnTo ?? '/workspaces'));
}
export default function Invitation() {
  const { email, token, preview } = useLoaderData<typeof loader>();
  const result = useActionData<any>();
  const busy = useNavigation().state !== 'idle';
  return (
    <main id="main" className="auth-page form-width">
      <Link className="brand" to="/workspaces">ProInspect<span>PROPERTY OPERATIONS</span></Link>
      <section className="panel stack">
        <p className="eyebrow">Invitation-only access · {preview.flow_id} v{preview.version}</p>
        <h1>You've been invited to ProInspect</h1>
        <p>This invitation connects you to an existing authorised relationship. You do not need to add or claim the property yourself.</p>
        <dl className="stack">
          <div><dt>Property or organisation</dt><dd><strong>{preview.property_label}</strong></dd></div>
          <div><dt>Relationship</dt><dd>{preview.role_label}</dd></div>
          <div><dt>Invited email</dt><dd>{email}</dd></div>
        </dl>
        <p className="small">Your account will show only records granted for this relationship. Other properties and confidential documents remain private.</p>
        <Form method="post" className="form">
          <input type="hidden" name="token" value={token}/>
          <Feedback value={result}/>
          <button className="primary" disabled={busy || !token}>{busy ? 'Accepting…' : 'Accept invitation'}</button>
        </Form>
        <Link to="/workspaces">Return to My ProInspect</Link>
      </section>
    </main>
  );
}
