import { accountData, updateAccount, revokeSessions } from './features/account.server';
import { receiveEnquiry } from './features/enquiries.server';
import { ZodError, z } from 'zod';
import type { Env } from '../../../packages/database/types';
import { assert, AppError, statement, now, uid } from '../../../packages/database/types';
import type { Principal, Workspace } from '../../../packages/domain/index';
import {
  requireUser,
  requireOrigin,
  beginSignIn,
  completeSignIn,
  signOut,
  principal,
} from '../../../packages/auth/server';
import {
  workspaces,
  workspace,
  propertiesFor,
  propertyAccess,
  operationsWrite,
  documentAllowed,
  workOrderAccess,
} from '../../../packages/authorization/server';
import { bookingSchema, email as emailSchema } from '../../../packages/validation/index';
import { randomToken, digest, unseal } from '../../../packages/auth/crypto';
import { mailEvent, dispatchOutbox } from '../../../packages/notifications/server';
import {
  catalogue,
  onboard,
  createProperty,
  createRequest,
  convertRequest,
  updateWorkOrder,
  issueReport,
  audit,
} from './services.server';
import { availability } from './scheduler';
import { expandedWorkspaceData } from './features/workspace-data.server';
import { featureApi } from './features/router.server';
import {
  applyOrganisation,
  acceptPortalInvitation,
  addPortfolioProperty,
} from './features/portfolio.server';
import { stripeWebhook, decideApproval } from './features/finance.server';
import { reportCallback } from './features/integrations.server';
import { booksServices, managesProperty } from '../../../packages/authorization/server';

async function json(request: Request) {
  assert(
    Number(request.headers.get('content-length') ?? 0) < 65536,
    413,
    'PAYLOAD_TOO_LARGE',
    'This submission is too large.',
  );
  const text = await request.text();
  assert(text.length < 65536, 413, 'PAYLOAD_TOO_LARGE', 'This submission is too large.');
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(400, 'INVALID_JSON', 'Invalid request format.');
  }
}
function placeholders(ids: string[]) {
  return ids.map(() => '?').join(',') || "''";
}
export function apiError(error: unknown) {
  if (error instanceof AppError)
    return Response.json({ code: error.code, message: error.message }, { status: error.status });
  if (error instanceof ZodError)
    return Response.json(
      {
        code: 'VALIDATION_FAILED',
        message: 'Check the highlighted information and try again.',
        fields: error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  if (
    error instanceof Error &&
    /UNIQUE constraint|CHECK constraint|SCHEDULE_CONFLICT|APPROVAL_REQUIRED|CONTEXT_MISMATCH|TENANCY_OVERLAP/.test(
      error.message,
    )
  )
    return Response.json(
      {
        code: 'CONFLICT',
        message: 'This record has changed or already exists. Reload before retrying.',
      },
      { status: 409 },
    );
  console.error(
    JSON.stringify({
      event: 'request.failed',
      errorType: error instanceof Error ? error.name : 'unknown',
    }),
  );
  return Response.json(
    {
      code: 'INTERNAL_ERROR',
      message: 'The action could not be completed. Please retry or contact ProInspect.',
    },
    { status: 500 },
  );
}
export { expandedWorkspaceData as workspaceData } from './features/workspace-data.server';
async function inviteTenant(env: Env, user: Principal, w: Workspace, input: unknown) {
  const data = z
    .object({
      propertyId: z.string(),
      email: emailSchema,
      startsAt: z.string().datetime({ offset: true }),
      endsAt: z.string().datetime({ offset: true }).optional(),
    })
    .parse(input);
  await propertyAccess(env, user, w, data.propertyId, true);
  assert(
    managesProperty(w) || w.kind === 'staff',
    403,
    'MANAGER_REQUIRED',
    'Only the current manager may create a tenancy.',
  );
  if (w.kind === 'staff') operationsWrite(user);
  const start = new Date(data.startsAt).toISOString(),
    end = data.endsAt ? new Date(data.endsAt).toISOString() : null;
  assert(!end || end > start, 422, 'TENANCY_DATES', 'The tenancy end must be after its start.');
  const overlap = await statement(
    env.DB,
    `SELECT id FROM tenancies WHERE property_id=? AND status IN('active','pending') AND (ends_at IS NULL OR ends_at>?) AND (? IS NULL OR starts_at<?)`,
    data.propertyId,
    start,
    end,
    end,
  ).first();
  assert(
    !overlap,
    409,
    'TENANCY_REVIEW_REQUIRED',
    'A current or overlapping tenancy already exists. Review it before adding another.',
  );
  const id = uid('tnc'),
    token = randomToken(),
    time = now();
  await env.DB.batch([
    statement(
      env.DB,
      `INSERT INTO tenancies(id,property_id,status,starts_at,ends_at) VALUES(?,?,'active',?,?)`,
      id,
      data.propertyId,
      start,
      end,
    ),
    statement(
      env.DB,
      `INSERT INTO invitations(token_hash,email,tenancy_id,role,expires_at,created_by,created_at) VALUES(?,?,?,'tenant',?,?,?)`,
      await digest(token),
      data.email,
      id,
      new Date(Date.now() + 7 * 86400000).toISOString(),
      user.id,
      time,
    ),
    audit(env, user, 'tenancy.created', 'tenancy', id, data.propertyId),
    await mailEvent(env, 'tenancy.invited', {
      to: data.email,
      subject: 'Your ProInspect tenancy invitation',
      heading: 'Access your tenancy',
      body: 'Sign in with this email address to accept your tenancy invitation. Your portal provides requests, inspection information and documents issued to you.',
      href: `${env.APP_ORIGIN}/invitations/accept?token=${token}`,
      sensitive: true,
    }),
  ]);
  return { id };
}
async function acceptInvitation(env: Env, user: Principal, token: unknown) {
  assert(
    typeof token === 'string' && /^[a-f0-9]{64}$/.test(token),
    400,
    'INVITATION_INVALID',
    'Invitation invalid.',
  );
  const hash = await digest(token);
  const invitation = await statement(
    env.DB,
    `SELECT i.tenancy_id FROM invitations i JOIN tenancies t ON t.id=i.tenancy_id WHERE i.token_hash=? AND i.email=? AND i.expires_at>? AND i.consumed_at IS NULL AND t.status='active' AND (EXISTS(SELECT 1 FROM staff_profiles s WHERE s.user_id=i.created_by AND s.active=1 AND s.role IN('administrator','operations_manager')) OR EXISTS(SELECT 1 FROM property_management_relationships pm JOIN client_memberships m ON m.client_id=pm.manager_client_id WHERE pm.property_id=t.property_id AND pm.starts_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') AND pm.ends_at IS NULL AND m.user_id=i.created_by AND m.active=1 AND m.role!='viewer'))`,
    hash,
    user.email,
    now(),
  ).first<{ tenancy_id: string }>();
  assert(
    invitation?.tenancy_id,
    400,
    'INVITATION_INVALID',
    'This invitation is unavailable, expired, or belongs to another email.',
  );
  const time = now();
  await env.DB.batch([
    statement(
      env.DB,
      'UPDATE invitations SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL',
      time,
      hash,
    ),
    statement(env.DB, 'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),
    statement(
      env.DB,
      `INSERT INTO tenancy_memberships(id,tenancy_id,user_id,starts_at) VALUES(?,?,?,?) ON CONFLICT(tenancy_id,user_id) DO NOTHING`,
      uid('tm'),
      invitation.tenancy_id,
      user.id,
      time,
    ),
    statement(env.DB, 'DELETE FROM mutation_guards'),
    audit(env, user, 'tenancy.joined', 'tenancy', invitation.tenancy_id),
  ]);
  return { tenancyId: invitation.tenancy_id };
}
export async function handleApi(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
): Promise<Response> {
  try {
    const url = new URL(request.url),
      path = url.pathname,
      method = request.method;
    if (path === '/api/webhooks/stripe' && method === 'POST')
      return Response.json(await stripeWebhook(env, request));
    if (path === '/api/public/enquiries' && method === 'POST')
      return Response.json(await receiveEnquiry(env, request), { status: 201 });
    if (path === '/api/integrations/report-tool/callback' && method === 'POST')
      return Response.json(await reportCallback(env, request));
    if (path === '/api/health')
      return Response.json({
        ok: true,
        application: 'platform',
        environment: env.APP_ENV,
        source: env.BUILD_SHA ?? 'development',
        bindings: {
          database: Boolean(env.DB),
          documents: Boolean(env.DOCUMENTS),
          scheduler: Boolean(env.SCHEDULER),
          queue: Boolean(env.EVENTS),
        },
        authenticationConfigured: Boolean(
          env.DATA_ENCRYPTION_KEY && (env.APP_ENV === 'local' || env.RESEND_API_KEY),
        ),
      });
    if (path === '/api/catalogue' && method === 'GET')
      return Response.json({ services: await catalogue(env) });
    if (path === '/api/auth/start' && method === 'POST') {
      const result = await beginSignIn(request, env, await json(request));
      if (ctx) ctx.waitUntil(dispatchOutbox(env));
      return Response.json(result);
    }
    if (path === '/api/auth/complete' && method === 'POST') {
      const result = await completeSignIn(request, env, await json(request));
      return Response.json(
        { returnTo: result.returnTo },
        { headers: { 'Set-Cookie': result.cookie } },
      );
    }
    if (path === '/api/auth/signout' && method === 'POST')
      return Response.json(
        { ok: true },
        { headers: { 'Set-Cookie': await signOut(request, env) } },
      );
    const user = await requireUser(request, env);
    if (method !== 'GET' && method !== 'HEAD') requireOrigin(request, env);
    if (path === '/api/account' && method === 'GET')
      return Response.json(await accountData(request, env, user));
    if (path === '/api/account' && method === 'POST')
      return Response.json(await updateAccount(env, user, await json(request)));
    if (path === '/api/account/sessions/revoke' && method === 'POST')
      return revokeSessions(request, env, user, await json(request));
    if (path === '/api/session' && method === 'GET')
      return Response.json({ user, workspaces: await workspaces(env, user) });
    if (path === '/api/onboarding' && method === 'POST')
      return Response.json(await onboard(env, user, await json(request)), { status: 201 });
    if (path === '/api/organisation-applications' && method === 'POST')
      return Response.json(await applyOrganisation(env, user, await json(request)), {
        status: 201,
      });
    if (path === '/api/organisation-applications' && method === 'GET')
      return Response.json({
        applications: (
          await statement(
            env.DB,
            'SELECT id,name,workspace_kind,status,created_at FROM organisation_applications WHERE user_id=? ORDER BY created_at DESC',
            user.id,
          ).all()
        ).results,
      });
    if (path === '/api/my-approvals' && method === 'GET')
      return Response.json({
        approvals: (
          await statement(
            env.DB,
            "SELECT a.id,a.version,a.status,a.amount_cents,a.summary,wo.title FROM approvals a JOIN work_orders wo ON wo.id=a.work_order_id WHERE a.target_user_id=? AND a.decision_scope='named_user' AND EXISTS(SELECT 1 FROM client_property_links l JOIN client_memberships m ON m.client_id=l.client_id WHERE l.property_id=wo.property_id AND l.role IN('owner','landlord') AND l.starts_at<=? AND (l.ends_at IS NULL OR l.ends_at>?) AND m.user_id=? AND m.active=1 AND m.role IN('owner','admin')) ORDER BY a.created_at DESC",
            user.id,
            now(),
            now(),
            user.id,
          ).all()
        ).results,
      });
    const ownApproval = path.match(/^\/api\/my-approvals\/([a-zA-Z0-9_-]+)$/);
    if (ownApproval && method === 'POST')
      return Response.json(
        await decideApproval(env, user, null, ownApproval[1], await json(request)),
      );
    if (path === '/api/invitations/accept' && method === 'POST') {
      const token = (await json(request)).token;
      const portal = await acceptPortalInvitation(env, user, token);
      return Response.json(portal ?? (await acceptInvitation(env, user, token)));
    }
    const download = path.match(/^\/api\/documents\/([a-zA-Z0-9_-]+)\/download$/);
    if (download && method === 'GET') {
      assert(
        await documentAllowed(env, user, download[1]),
        404,
        'DOCUMENT_NOT_FOUND',
        'Document not found.',
      );
      const doc = await statement(
        env.DB,
        'SELECT object_key,title FROM documents WHERE id=?',
        download[1],
      ).first<{ object_key: string; title: string }>();
      assert(doc, 404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
      const object = await env.DOCUMENTS.get(doc.object_key);
      assert(object, 404, 'DOCUMENT_UNAVAILABLE', 'The document file is unavailable.');
      await audit(env, user, 'document.downloaded', 'document', download[1]).run();
      return new Response(object.body, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="ProInspect-${download[1]}.pdf"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    const match = path.match(/^\/api\/w\/([a-z-]+)\/([a-zA-Z0-9_-]+)(?:\/(.*))?$/);
    assert(match, 404, 'NOT_FOUND', 'Page not found.');
    const w = await workspace(env, user, match[1], match[2]),
      tail = match[3] ?? '';
    if (method === 'GET' && (!tail || tail === 'data'))
      return Response.json(await expandedWorkspaceData(env, user, w));
    const feature = await featureApi(request, env, user, w, tail);
    if (feature) return feature;
    if (method === 'GET' && tail === 'availability') {
      assert(
        booksServices(w),
        403,
        'BOOKING_FORBIDDEN',
        'Select an authorised customer workspace to book.',
      );
      return Response.json(
        await availability(
          env,
          url.searchParams.get('service') ?? '',
          url.searchParams.get('date') ?? '',
        ),
      );
    }
    if (method === 'POST' && tail === 'properties')
      return Response.json(
        await (w.kind === 'landlord' ? createProperty : addPortfolioProperty)(
          env,
          user,
          w,
          await json(request),
        ),
        { status: 201 },
      );
    if (method === 'POST' && tail === 'bookings') {
      const input = bookingSchema.parse(await json(request));
      assert(
        booksServices(w),
        403,
        'BOOKING_FORBIDDEN',
        'Select an authorised customer workspace to book.',
      );
      return env.SCHEDULER.get(env.SCHEDULER.idFromName('default')).fetch(
        new Request('https://scheduler.internal/reserve', {
          method: 'POST',
          body: JSON.stringify({ userId: user.id, clientId: w.scopeId, kind: w.kind, input }),
        }),
      );
    }
    if (method === 'POST' && tail === 'requests')
      return Response.json(await createRequest(env, user, w, await json(request)), { status: 201 });
    if (method === 'POST' && tail === 'tenancies')
      return Response.json(await inviteTenant(env, user, w, await json(request)), { status: 201 });
    const convert = tail.match(/^requests\/([a-zA-Z0-9_-]+)\/convert$/);
    if (convert && method === 'POST') {
      assert(w.kind === 'staff', 403, 'STAFF_REQUIRED', 'Staff access required.');
      return Response.json(await convertRequest(env, user, convert[1]));
    }
    const wo = tail.match(/^work-orders\/([a-zA-Z0-9_-]+)$/);
    if (wo && method === 'POST')
      return Response.json(await updateWorkOrder(env, user, w, wo[1], await json(request)));
    const upload = tail.match(/^work-orders\/([a-zA-Z0-9_-]+)\/report$/);
    if (upload && method === 'POST') {
      assert(
        Number(request.headers.get('content-length') ?? 0) <= 11 * 1024 * 1024,
        413,
        'FILE_TOO_LARGE',
        'Choose a PDF under 10 MB.',
      );
      return Response.json(await issueReport(env, user, w, upload[1], await request.formData()), {
        status: 201,
      });
    }
    const access = tail.match(/^work-orders\/([a-zA-Z0-9_-]+)\/access$/);
    if (access && method === 'GET') {
      assert(
        w.kind === 'staff' && user.staffRole !== 'read_only',
        403,
        'ACCESS_RESTRICTED',
        'Sensitive access is limited to operational staff.',
      );
      const order = await workOrderAccess(env, user, w, access[1]);
      assert(order.booking_id, 404, 'ACCESS_NOT_FOUND', 'No booking access instructions.');
      const encrypted = await statement(
        env.DB,
        'SELECT envelope FROM booking_access_secrets WHERE booking_id=?',
        order.booking_id,
      ).first<{ envelope: string }>();
      assert(encrypted, 404, 'ACCESS_NOT_FOUND', 'No access instructions.');
      await audit(
        env,
        user,
        'booking.access_viewed',
        'booking',
        order.booking_id,
        order.property_id,
      ).run();
      return Response.json(
        await unseal(env.DATA_ENCRYPTION_KEY, `booking:${order.booking_id}`, encrypted.envelope),
      );
    }
    const service = tail.match(/^services\/([a-zA-Z0-9_-]+)$/);
    if (service && method === 'POST') {
      assert(w.kind === 'staff', 403, 'STAFF_REQUIRED', 'Staff access required.');
      operationsWrite(user);
      const data = z
        .object({
          priceExGstCents: z.number().int().min(0).max(100000000),
          bookingMode: z.enum(['instant', 'request']),
          active: z.boolean(),
        })
        .parse(await json(request));
      await env.DB.batch([
        statement(
          env.DB,
          'UPDATE services SET price_ex_gst_cents=?,booking_mode=?,active=? WHERE id=?',
          data.priceExGstCents,
          data.bookingMode,
          data.active ? 1 : 0,
          service[1],
        ),
        statement(env.DB, 'INSERT INTO mutation_guards(changed_rows) VALUES(changes())'),
        statement(env.DB, 'DELETE FROM mutation_guards'),
        audit(env, user, 'service.updated', 'service', service[1]),
      ]);
      return Response.json({ ok: true });
    }
    if (method === 'GET' && tail === 'outbox') {
      operationsWrite(user);
      return Response.json({
        events: (
          await statement(
            env.DB,
            'SELECT id,kind,status,attempts,error_code,created_at,sent_at FROM outbox_events ORDER BY created_at DESC LIMIT 100',
          ).all()
        ).results,
      });
    }
    throw new AppError(404, 'NOT_FOUND', 'Page not found.');
  } catch (error) {
    return apiError(error);
  }
}
