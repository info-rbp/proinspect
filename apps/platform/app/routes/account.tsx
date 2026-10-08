import {
  Form,
  Link,
  useLoaderData,
  useActionData,
  useNavigation,
  data,
  redirect,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from 'react-router';
import { loadApi, callApi } from '../lib/api.server';
import { Field, Feedback, PageHeading } from '../../../../packages/ui/components';
import { displayDate } from '../../../../packages/domain/index';
export async function loader({ request, context }: LoaderFunctionArgs) {
  return loadApi(request, context, '/api/account');
}
export async function action({ request, context }: ActionFunctionArgs) {
  const f = await request.formData(),
    revoke = f.get('intent') === 'sessions';
  const response = await callApi(
    request,
    context,
    revoke ? '/api/account/sessions/revoke' : '/api/account',
    {
      method: 'POST',
      body: revoke
        ? { scope: f.get('scope'), confirm: f.get('confirm') === 'yes' }
        : {
            displayName: f.get('displayName'),
            reportEmail: f.get('reportEmail') === 'yes',
            version: Number(f.get('version')),
          },
    },
  );
  const result = (await response.json()) as Record<string, any>;
  if (!response.ok)
    return data({ error: result.message, fields: result.fields }, { status: response.status });
  if (result.signedOut)
    return redirect('/signin', {
      headers: { 'Set-Cookie': response.headers.get('Set-Cookie') ?? '' },
    });
  return {
    ok: true,
    message: revoke
      ? 'Other sessions have been signed out.'
      : 'Your account preferences have been saved.',
  };
}
export default function Account() {
  const d = useLoaderData<typeof loader>(),
    result = useActionData<typeof action>(),
    busy = useNavigation().state !== 'idle';
  return (
    <main id="main" className="content form-width">
      <Link to="/workspaces">Back to your workspaces</Link>
      <PageHeading
        title="Your account"
        description="One verified identity across your authorised workspaces. These settings never change property or organisation authority."
      />
      <div className="stack">
        <Feedback value={result} />
        <section className="panel stack">
          <h2>Profile and notifications</h2>
          <p>
            Verified email: <strong>{d.user.email}</strong>
          </p>
          <p className="small">
            Changing your email requires a separate identity-verification process. Editing your
            display name does not change an account's ownership.
          </p>
          <Form method="post" className="stack" key={d.preferences.version}>
            <input type="hidden" name="version" value={d.preferences.version} />
            <Field label="Display name" name="displayName">
              <input
                name="displayName"
                required
                maxLength={100}
                defaultValue={d.user.display_name}
              />
            </Field>
            <label className="checkbox">
              <input
                type="checkbox"
                name="reportEmail"
                value="yes"
                defaultChecked={Boolean(d.preferences.report_email)}
              />
              <span>Email me when an inspection report is issued.</span>
            </label>
            <p className="small">
              Reports stay in your portal. Sign-in, invitations, bookings, approvals and operational
              building notices are not disabled by this preference.
            </p>
            <button className="button" disabled={busy}>
              Save account preferences
            </button>
          </Form>
        </section>
        <section className="panel stack">
          <h2>Active sign-ins</h2>
          <p>
            {d.activeSessions} active session(s). The 20 most recent are shown. No session
            credentials are exposed here.
          </p>
          {d.sessions.map((s: any, i: number) => (
            <div className="record-row" key={i}>
              <span>
                {s.current ? 'This session' : 'Another session'}
                <br />
                <span className="small">Started {displayDate(s.created_at)}</span>
              </span>
              <span className="small">Expires {displayDate(s.expires_at)}</span>
            </div>
          ))}
          <Form method="post">
            <input type="hidden" name="intent" value="sessions" />
            <input type="hidden" name="scope" value="others" />
            <input type="hidden" name="confirm" value="yes" />
            <button className="button secondary" disabled={busy}>
              Sign out other sessions
            </button>
          </Form>
          <Form method="post" className="stack">
            <input type="hidden" name="intent" value="sessions" />
            <input type="hidden" name="scope" value="all" />
            <label className="checkbox">
              <input type="checkbox" name="confirm" value="yes" required />
              <span>Sign out every session, including this one.</span>
            </label>
            <button className="button secondary" disabled={busy}>
              Sign out everywhere
            </button>
          </Form>
        </section>
      </div>
    </main>
  );
}
