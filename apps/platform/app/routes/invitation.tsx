import {
  Form,
  useLoaderData,
  useActionData,
  redirect,
  data,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from 'react-router';
import { loadApi, callApi } from '../lib/api.server';
import { Feedback } from '../../../../packages/ui/components';
export async function loader({ request, context }: LoaderFunctionArgs) {
  const session = await loadApi(request, context, '/api/session');
  return { email: session.user.email, token: new URL(request.url).searchParams.get('token') ?? '' };
}
export async function action({ request, context }: ActionFunctionArgs) {
  const form = await request.formData();
  const response = await callApi(request, context, '/api/invitations/accept', {
    method: 'POST',
    body: { token: form.get('token') },
  });
  const result = (await response.json()) as any;
  if (!response.ok) return data({ error: result.message }, { status: response.status });
  return redirect(result.tenancyId ? `/w/tenant/${result.tenancyId}` : '/workspaces');
}
export default function Invitation() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<any>();
  return (
    <main id="main" className="auth-page form-width">
      <section className="panel stack">
        <p className="eyebrow">Workspace invitation</p>
        <h1>Accept your workspace invitation.</h1>
        <p>
          You are signed in as {data.email}. Only the invited email address can accept this
          invitation.
        </p>
        <Form method="post" className="form">
          <input type="hidden" name="token" value={data.token} />
          <Feedback value={result} />
          <button className="primary">Accept invitation</button>
        </Form>
      </section>
    </main>
  );
}
