// Isolated test entrypoint for the same staging session functions used by the HTML route.
import { confirmStagingIdentity, verifyStagingIdentity } from '../../packages/auth/staging-access';
import { principal, signOut } from '../../packages/auth/server';
import { AppError, type Env } from '../../packages/database/types';

export default {
  async fetch(request: Request, env: Env) {
    const path = new URL(request.url).pathname;
    try {
      if (path === '/session') return Response.json(await principal(request, env));
      if (path === '/logout')
        return Response.json({}, { headers: { 'Set-Cookie': await signOut(request, env) } });
      if (request.method === 'POST')
        return Response.json(
          {},
          { headers: { 'Set-Cookie': await confirmStagingIdentity(request, env) } },
        );
      return Response.json(await verifyStagingIdentity(request, env));
    } catch (error) {
      if (error instanceof AppError)
        return Response.json({ code: error.code }, { status: error.status });
      throw error;
    }
  },
};
