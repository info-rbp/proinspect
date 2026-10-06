import {
  Form,
  Link,
  useLoaderData,
  useActionData,
  useNavigation,
  redirect,
  data,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from 'react-router';
import { platformEnv } from '../../../../packages/database/context';
import { completeSignIn } from '../../../../packages/auth/server';
import { apiError } from '../../worker/api';
import { Field, Feedback } from '../../../../packages/ui/components';
export const meta = () => [
  { title: 'Confirm sign-in | ProInspect' },
  { name: 'robots', content: 'noindex,nofollow' },
];
export function loader({ request }: LoaderFunctionArgs) {
  return { token: new URL(request.url).searchParams.get('token') ?? '' };
}
export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const form = await request.formData();
    const result = await completeSignIn(request, platformEnv(context), {
      email: form.get('email'),
      token: form.get('token'),
    });
    throw redirect(result.returnTo, { headers: { 'Set-Cookie': result.cookie } });
  } catch (error) {
    if (error instanceof Response) throw error;
    const response = apiError(error);
    const result = (await response.json()) as any;
    return data({ error: result.message, fields: result.fields }, { status: response.status });
  }
}
export default function Complete() {
  const { token } = useLoaderData<typeof loader>();
  const result = useActionData<any>();
  const busy = useNavigation().state !== 'idle';
  return (
    <main id="main" className="auth-page form-width">
      <Link className="brand" to="/">
        ProInspect<span>PROPERTY OPERATIONS</span>
      </Link>
      <section className="panel stack">
        <p className="eyebrow">Secure sign-in</p>
        <h1>Confirm it is you.</h1>
        <p>
          Enter the email address that received this link, then confirm. Opening the link alone does
          not sign you in.
        </p>
        <Form method="post" className="form">
          <input type="hidden" name="token" value={token} />
          <Field label="Email address" name="email">
            <input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Feedback value={result} />
          <button className="primary" disabled={busy || !token}>
            {busy ? 'Signing in…' : 'Confirm sign-in'}
          </button>
        </Form>
        <Link to="/signin">Request a new sign-in link</Link>
      </section>
    </main>
  );
}
