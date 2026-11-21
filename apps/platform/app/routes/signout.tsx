import { stagingAccess } from '../../../../packages/auth/staging-access';
import { redirectDocument, redirect, type ActionFunctionArgs } from 'react-router';
import { signOut } from '../../../../packages/auth/server';
import { platformEnv } from '../../../../packages/database/context';
export async function action({ request, context }: ActionFunctionArgs) {
  const env = platformEnv(context);
  const headers = { 'Set-Cookie': await signOut(request, env) };
  return stagingAccess(request, env)
    ? redirectDocument('/cdn-cgi/access/logout', { headers })
    : redirect('/signin', { headers });
}
export function loader() {
  return redirect('/workspaces');
}
