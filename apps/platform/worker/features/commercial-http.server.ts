import { z } from 'zod';
import { assert, statement, now, type Env } from '../../../../packages/database/types';
import type { Principal } from '../../../../packages/domain/index';
import { requireOrigin } from '../../../../packages/auth/server';
import { boundedText } from '../../../../packages/http-bodies';
import {
  commercialPrivateHeaders,
  commercialPermission,
  commercialFlow,
  commercialEvent,
} from './commercial-intake.server';
import {
  commercialOverview,
  draftCommercialFlow,
  approveCommercialFlow,
  commercialStaffDetail,
  attachCommercialOffer,
  commercialStaffCommand,
} from './commercial-review.server';
import {
  dispatchCommercialScans,
  reviewCommercialDocument,
  downloadCommercialEvidence,
  prepareCommercialReferral,
  dispatchCommercialReferral,
  reconcileCommercialReferral,
} from './commercial-delivery.server';
import { resolveCommercialPrivacy, purgeCommercialApplication } from './commercial-privacy.server';
export async function commercialStaffHttp(
  request: Request,
  env: Env,
  user: Principal,
  tail: string,
) {
  const parts = tail.split('/').filter(Boolean);
  assert(
    parts.every((s) => /^[a-zA-Z0-9_-]{1,100}$/.test(s)),
    404,
    'COMMERCIAL_ROUTE',
    'Unknown route.',
  );
  const method = request.method;
  if (method === 'GET' && parts.length === 0)
    return Response.json(await commercialOverview(env, user), {
      headers: commercialPrivateHeaders,
    });
  if (method === 'GET' && parts.length === 1)
    return Response.json(await commercialStaffDetail(env, user, parts[0]), {
      headers: commercialPrivateHeaders,
    });
  if (method === 'GET' && parts.length === 4 && parts[1] === 'documents' && parts[3] === 'download')
    return await downloadCommercialEvidence(env, user, parts[0], parts[2]);
  assert(method === 'POST', 405, 'COMMERCIAL_METHOD', 'Choose a permitted action.');
  requireOrigin(request, env);
  const body = z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(await boundedText(request, 65536)));
  let result: unknown;
  if (parts[0] === 'permissions' && parts.length === 1)
    result = await commercialStaffCommand(env, user, '', 'permission', body);
  else if (parts[0] === 'flows' && parts.length === 1)
    result = await draftCommercialFlow(env, user, body);
  else if (parts[0] === 'flows' && parts.length === 3 && parts[2] === 'approve')
    result = await approveCommercialFlow(env, user, parts[1], body);
  else if (parts[0] === 'flows' && parts.length === 3 && parts[2] === 'revoke') {
    await commercialPermission(env, user, 'configure');
    const flow = await commercialFlow(env, parts[1], false);
    await env.DB.batch([
      statement(
        env.DB,
        "UPDATE commercial_application_flows SET status='revoked' WHERE id=?",
        flow.id,
      ),
      await commercialEvent(
        env,
        null,
        flow.id,
        'flow_revoked',
        { reference: z.string().min(8).parse(body.reference) },
        undefined,
        user.id,
      ),
    ]);
    result = { revoked: true };
  } else if (parts.length === 2 && parts[1] === 'offer')
    result = await attachCommercialOffer(env, user, parts[0], body.offer, Number(body.version));
  else if (parts.length === 2 && parts[1] === 'review')
    result = await commercialStaffCommand(env, user, parts[0], String(body.command ?? ''), body);
  else if (parts.length === 3 && parts[1] === 'privacy')
    result = await resolveCommercialPrivacy(env, user, parts[0], parts[2], body);
  else if (parts.length === 2 && parts[1] === 'purge')
    result = await purgeCommercialApplication(env, user, parts[0], body);
  else if (parts.length === 2 && parts[1] === 'scan')
    result = await dispatchCommercialScans(env, user, parts[0]);
  else if (parts.length === 2 && parts[1] === 'referrals')
    result = await prepareCommercialReferral(
      env,
      user,
      parts[0],
      Number(body.version),
      String(body.reviewReference ?? ''),
      body.manualReviewConfirmed === true,
    );
  else if (parts.length === 4 && parts[1] === 'documents' && parts[3] === 'review')
    result = await reviewCommercialDocument(env, user, parts[0], parts[2], body);
  else if (parts.length === 4 && parts[1] === 'referrals' && parts[3] === 'reconcile') {
    assert(
      await statement(
        env.DB,
        'SELECT id FROM commercial_application_referrals WHERE id=? AND application_id=?',
        parts[2],
        parts[0],
      ).first(),
      404,
      'COMMERCIAL_REFERRAL_UNAVAILABLE',
      'Referral unavailable.',
    );
    result = await reconcileCommercialReferral(env, user, parts[2], body);
  } else if (parts.length === 4 && parts[1] === 'referrals' && parts[3] === 'dispatch') {
    assert(
      await statement(
        env.DB,
        'SELECT id FROM commercial_application_referrals WHERE id=? AND application_id=?',
        parts[2],
        parts[0],
      ).first(),
      404,
      'COMMERCIAL_REFERRAL_UNAVAILABLE',
      'Referral unavailable.',
    );
    result = await dispatchCommercialReferral(env, user, parts[2]);
  } else assert(false, 404, 'COMMERCIAL_ROUTE', 'Unknown commercial action.');
  return Response.json(result, { headers: commercialPrivateHeaders });
}
