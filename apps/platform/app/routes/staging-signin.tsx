import {
  Form,
  Link,
  data,
  redirectDocument,
  useLoaderData,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from 'react-router';
import { platformEnv } from '../../../../packages/database/context';
import {
  confirmStagingIdentity,
  verifyStagingIdentity,
} from '../../../../packages/auth/staging-access';
import { authDestination } from '../../../../packages/onboarding/entry';
import { apiError } from '../../worker/api';

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
};
export const meta = () => [
  { title: 'Confirm staging sign-in | ProInspect' },
  { name: 'robots', content: 'noindex,nofollow' },
];
export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const { email } = await verifyStagingIdentity(request, platformEnv(context));
    return data({ email }, { headers: privateHeaders });
  } catch (error) {
    throw apiError(error);
  }
}
export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const cookie = await confirmStagingIdentity(request, platformEnv(context));
    const target = authDestination(new URL(request.url).searchParams.get('returnTo'));
    return redirectDocument(target, {
      status: 303,
      headers: { ...privateHeaders, 'Set-Cookie': cookie },
    });
  } catch (error) {
    throw apiError(error);
  }
}
export default function StagingSignIn() {
  const { email } = useLoaderData<typeof loader>();
  return (
    <main id="main" className="auth-page form-width">
      <section className="panel stack">
        <h1>Sign in to ProInspect staging</h1>
        <p>Continue as {email} to open your authorised test workspaces.</p>
        <Form method="post" reloadDocument>
          <button className="primary">Continue to ProInspect</button>
        </Form>
        <Link reloadDocument to="/cdn-cgi/access/logout">
          Use a different test email
        </Link>
      </section>
    </main>
  );
}
