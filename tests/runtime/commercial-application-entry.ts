/** Synthetic-only entrypoint. Never imported by either application router or deployed Worker. */
import { AppError, type Env } from '../../packages/database/types';
import type { Principal } from '../../packages/domain/index';
import {
  commercialReady,
  beginCommercial,
  exchangeCommercialLink,
  commercialRecover,
  commercialPage,
} from '../../apps/platform/worker/features/commercial-intake.server';
import {
  draftCommercialFlow,
  verifyCommercialRecipient,
  approveCommercialFlow,
  commercialStaffCommand,
  commercialStaffDetail,
  attachCommercialOffer,
} from '../../apps/platform/worker/features/commercial-review.server';
import {
  saveCommercialShared,
  inviteCommercialPerson,
  declareCommercialPerson,
  submitCommercial,
  uploadCommercialEvidence,
  deleteCommercialEvidence,
  withdrawCommercial,
  correctCommercialEmail,
  withdrawCommercialParticipation,
} from '../../apps/platform/worker/features/commercial-application-actions.server';
import {
  dispatchCommercialScans,
  acceptCommercialScan,
  reviewCommercialDocument,
  downloadCommercialEvidence,
  prepareCommercialReferral,
  dispatchCommercialReferral,
  retrieveCommercialReferral,
  reconcileCommercialReferral,
} from '../../apps/platform/worker/features/commercial-delivery.server';
import {
  requestCommercialPrivacy,
  purgeCommercialApplication,
} from '../../apps/platform/worker/features/commercial-privacy.server';
export default {
  async fetch(request: Request, env: Env) {
    if (env.APP_ENV !== 'local') return new Response('Unavailable', { status: 404 });
    const path = new URL(request.url).pathname;
    try {
      if (path === '/scan-result') return Response.json(await acceptCommercialScan(env, request));
      if (path.startsWith('/retrieve/')) {
        const parts = path.split('/');
        return await retrieveCommercialReferral(env, request, parts[2], parts[3]);
      }
      const d = (await request.json()) as Record<string, any>,
        user = {
          id: d.staffId || 'usr_cm_a',
          staffRole: d.staffRole || 'administrator',
        } as Principal;
      let result: unknown;
      switch (path) {
        case '/gate':
          result = {
            ready: await commercialReady(
              d.disabled ? { ...env, COMMERCIAL_APPLICATIONS_ENABLED: 'false' } : env,
            ),
          };
          break;
        case '/draft-flow':
          result = await draftCommercialFlow(env, user, d.input);
          break;
        case '/verify-recipient':
          result = await verifyCommercialRecipient(env, d.token);
          break;
        case '/approve-flow':
          result = await approveCommercialFlow(env, user, d.flowId, d.input);
          break;
        case '/grant':
          result = await commercialStaffCommand(env, user, '', 'permission', d.input);
          break;
        case '/begin':
          result = await beginCommercial(env, request, d.flowId, d.input);
          break;
        case '/exchange':
          result = { session: await exchangeCommercialLink(env, d.token) };
          break;
        case '/recover':
          result = await commercialRecover(env, request, d.input);
          break;
        case '/page':
          result = await commercialPage(
            d.disabled ? { ...env, COMMERCIAL_APPLICATIONS_ENABLED: 'false' } : env,
            d.session,
          );
          break;
        case '/save':
          result = await saveCommercialShared(env, d.session, d.section, d.input, d.version);
          break;
        case '/invite':
          result = await inviteCommercialPerson(env, d.session, d.input, d.version);
          break;
        case '/declare':
          result = await declareCommercialPerson(
            env,
            d.session,
            d.input,
            d.version,
            d.personVersion,
          );
          break;
        case '/correct-email':
          result = await correctCommercialEmail(
            env,
            d.session,
            d.email,
            d.version,
            d.personVersion,
          );
          break;
        case '/upload': {
          const form = new FormData();
          form.set('category', d.category);
          if (d.entityId) form.set('entityId', d.entityId);
          if (d.period) form.set('period', d.period);
          form.set(
            'file',
            new File(
              [d.bytes || '%PDF-1.7\nSynthetic ' + d.category + ' ' + d.period + '\n%%EOF'],
              d.filename || 'synthetic.pdf',
              { type: d.type || 'application/pdf' },
            ),
          );
          result = await uploadCommercialEvidence(env, d.session, form, d.version);
          break;
        }
        case '/delete':
          result = await deleteCommercialEvidence(env, d.session, d.documentId, d.version);
          break;
        case '/scan':
          result = await dispatchCommercialScans(env, user, d.applicationId);
          break;
        case '/review-doc':
          result = await reviewCommercialDocument(
            env,
            user,
            d.applicationId,
            d.documentId,
            d.input,
          );
          break;
        case '/download':
          return await downloadCommercialEvidence(env, user, d.applicationId, d.documentId);
        case '/submit':
          result = await submitCommercial(env, d.session, d.requestKey, d.version);
          break;
        case '/staff-detail':
          result = await commercialStaffDetail(env, user, d.applicationId);
          break;
        case '/offer':
          result = await attachCommercialOffer(env, user, d.applicationId, d.input, d.version);
          break;
        case '/prepare':
          result = await prepareCommercialReferral(
            env,
            user,
            d.applicationId,
            d.version,
            d.reviewReference,
            d.manualReviewConfirmed,
          );
          break;
        case '/dispatch':
          result = await dispatchCommercialReferral(env, user, d.referralId);
          break;
        case '/reconcile':
          result = await reconcileCommercialReferral(env, user, d.referralId, d.input);
          break;
        case '/staff-review':
          result = await commercialStaffCommand(env, user, d.applicationId, d.command, d.input);
          break;
        case '/withdraw-person':
          result = await withdrawCommercialParticipation(env, d.session, d.version);
          break;
        case '/withdraw':
          result = await withdrawCommercial(env, d.session, d.version);
          break;
        case '/privacy':
          result = await requestCommercialPrivacy(env, d.session, d.input);
          break;
        case '/purge':
          result = await purgeCommercialApplication(env, user, d.applicationId, d.input);
          break;
        default:
          return new Response('Unavailable', { status: 404 });
      }
      return Response.json(result);
    } catch (error) {
      return Response.json(
        {
          code: error instanceof AppError ? error.code : 'VALIDATION_ERROR',
          message: error instanceof Error ? error.message : 'Unavailable',
        },
        { status: error instanceof AppError ? error.status : 422 },
      );
    }
  },
};
