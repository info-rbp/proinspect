import { propertyDirectory } from './directory.server';
import { reconciliationData, resolveReconciliation } from './payments.server';
import { changeNotice } from './communications.server';
import { downloadWorkspaceDocument } from '../../../../packages/authorization/document-scope';
import { type Env, assert, statement } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { readJson } from '../../../../packages/operations/core';
import { operationsWrite } from '../../../../packages/authorization/server';
import * as portfolio from './portfolio.server';
import * as booking from './bookings.server';
import * as documents from './documents.server';
import * as finance from './finance.server';
import * as strata from './strata.server';
import * as tenancy from './tenancies.server';
import * as admin from './admin.server';
import * as forms from './forms.server';
import * as integrations from './integrations.server';

/** Feature endpoints run only after authentication, origin and workspace checks. */
export async function featureApi(
  request: Request,
  env: Env,
  user: Principal,
  w: Workspace,
  tail: string,
): Promise<Response | null> {
  const method = request.method,
    url = new URL(request.url),
    parts = tail.split('/'),
    [area, id, action, child] = parts;
  if (area === 'confidential' || area === 'confidential-evidence') {
    assert(
      ['tenant', 'staff'].includes(w.kind),
      404,
      'CASE_NOT_FOUND',
      'Confidential case not found.',
    );
    if (w.kind === 'tenant' && id) {
      const query =
        area === 'confidential'
          ? 'SELECT id FROM restricted_form_cases WHERE id=? AND tenancy_id=?'
          : 'SELECT e.id FROM restricted_evidence e JOIN restricted_form_cases c ON c.id=e.case_id WHERE e.id=? AND c.tenancy_id=?';
      assert(
        await statement(env.DB, query, id, w.scopeId).first(),
        404,
        'CASE_NOT_FOUND',
        'Confidential case not found.',
      );
    }
  }
  const body = () => readJson(request),
    ok = (value: unknown) => Response.json(value);
  const staff = () => {
    assert(w.kind === 'staff', 403, 'STAFF_REQUIRED', 'Use the Staff workspace.');
    operationsWrite(user);
  };
  if (method === 'GET') {
    if (tail === 'property-directory')
      return ok(await propertyDirectory(env, user, w, url.searchParams));
    if (tail === 'payment-reconciliation') return ok(await reconciliationData(env, user, w));
    if (area === 'documents' && id && action === 'download')
      return downloadWorkspaceDocument(env, user, w, id);
    if (area === 'document-requests' && id && parts.length === 2)
      return ok(await documents.documentRequestDetail(env, user, w, id));
    if (tail === 'admin') return ok(await admin.adminData(env, user, w));
    if (tail === 'search')
      return ok(await admin.searchOperations(env, user, w, url.searchParams.get('q') ?? ''));
    if (tail === 'team') return ok(await admin.teamData(env, user, w));
    if (tail === 'integrations') return ok(await integrations.integrationData(env, user, w));
    if (area === 'requests' && id && parts.length === 2)
      return ok(await documents.requestDetail(env, user, w, id));
    if (area === 'attachments' && id && action === 'download')
      return documents.downloadAttachment(env, user, w, id);
    if (area === 'tenancies' && id && parts.length === 2)
      return ok(await tenancy.tenancyDetail(env, user, w, id));
    if (area === 'tenancies' && id && action === 'forms')
      return ok(await forms.formsData(env, user, w, id));
    if (area === 'schemes' && id && parts.length === 2)
      return ok(await strata.schemeData(env, user, w, id));
    if (area === 'approvals' && id && parts.length === 2) {
      const approval = await finance.approvalAccess(env, user, w, id);
      const responses = (
        await statement(
          env.DB,
          'SELECT response,comment,created_at FROM council_responses WHERE approval_id=? ORDER BY created_at',
          id,
        ).all()
      ).results;
      return ok({ approval, responses });
    }
    if (tail === 'confidential') return ok(await forms.restrictedData(env, user, w));
    if (area === 'confidential' && id && parts.length === 2)
      return ok(await forms.restrictedDetail(env, user, id));
    if (area === 'confidential-evidence' && id && action === 'download')
      return forms.downloadRestrictedEvidence(env, user, id);
  }
  if (method !== 'POST') return null;
  if (area === 'organisation-applications' && id && action === 'review') {
    staff();
    return ok(await portfolio.approveOrganisation(env, user, id, await body()));
  }
  if (tail === 'team/invite') return ok(await portfolio.inviteMember(env, user, w, await body()));
  if (tail === 'team/assignments')
    return ok(await portfolio.assignPortfolio(env, user, w, await body()));
  if (area === 'team' && id && parts.length === 2)
    return ok(await portfolio.updateTeamMember(env, user, w, id, await body()));
  if (tail === 'imports/preview')
    return ok(await portfolio.previewImport(env, user, w, await body()));
  if (area === 'imports' && id && action === 'apply')
    return ok(await portfolio.applyImport(env, user, w, id));
  if (tail === 'bulk-bookings') return ok(await booking.bulkBook(env, user, w, await body()));
  if (area === 'notifications' && id && action === 'read') {
    await statement(
      env.DB,
      "UPDATE notifications SET read_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND user_id=?",
      id,
      user.id,
    ).run();
    return ok({ ok: true });
  }
  if (area === 'plans' && id && parts.length === 2)
    return ok(await portfolio.updatePlan(env, user, w, id, await body()));
  if (area === 'work-orders' && id && action === 'contractor')
    return ok(await admin.assignContractor(env, user, w, id, await body()));
  if (tail === 'plans') return ok(await portfolio.createPlan(env, user, w, await body()));
  if (area === 'bookings' && id && action === 'change')
    return env.SCHEDULER.get(env.SCHEDULER.idFromName('default')).fetch(
      new Request('https://scheduler.internal/change', {
        method: 'POST',
        body: JSON.stringify({
          operation: 'change',
          bookingId: id,
          userId: user.id,
          clientId: w.scopeId,
          kind: w.kind,
          input: await body(),
        }),
      }),
    );
  if (area === 'requests' && id && action === 'comments')
    return ok(await documents.commentRequest(env, user, w, id, await body()));
  if (area === 'requests' && id && action === 'attachments')
    return ok(await documents.attachRequestFile(env, user, w, id, await request.formData()));
  if (area === 'requests' && id && action === 'dispatch')
    return ok(await strata.dispatchBuildingRequest(env, user, w, id));
  if (area === 'attachments' && id && action === 'review')
    return ok(await documents.reviewAttachment(env, user, w, id, await body()));
  if (tail === 'documents/upload')
    return ok(await documents.uploadDocument(env, user, w, await request.formData()));
  if (area === 'documents' && id && action === 'issue')
    return ok(await documents.issueDocument(env, user, w, id, await body()));
  if (tail === 'document-requests')
    return ok(await documents.createDocumentRequest(env, user, w, await body()));
  if (area === 'document-requests' && id && parts.length === 2)
    return ok(await documents.updateDocumentRequest(env, user, w, id, await body()));
  if (area === 'document-requests' && id && action === 'information')
    return ok(await documents.provideDocumentInformation(env, user, w, id, await body()));
  if (area === 'pcr-responses' && id && action === 'acknowledge')
    return ok(await documents.acknowledgePcr(env, user, w, id));
  if (tail === 'pcr-responses') return ok(await documents.pcrResponse(env, user, w, await body()));
  if (area === 'tenancies' && id && parts.length === 2)
    return ok(await tenancy.updateTenancy(env, user, w, id, await body()));
  if (area === 'tenancies' && id && action === 'invite')
    return ok(await tenancy.inviteAdditionalTenant(env, user, w, id, await body()));
  if (tail === 'inspections/publish')
    return ok(await tenancy.publishInspection(env, user, w, await body()));
  if (area === 'schemes' && id && action === 'notices' && child)
    return ok(await changeNotice(env, user, w, id, child, await body()));
  if (tail === 'schemes') return ok(await strata.createScheme(env, user, w, await body()));
  if (area === 'schemes' && id && action === 'structure')
    return ok(await strata.schemeStructure(env, user, w, id, await body()));
  if (area === 'schemes' && id && action === 'requests')
    return ok(await strata.buildingRequest(env, user, w, id, await body()));
  if (area === 'schemes' && id && action === 'notices')
    return ok(await strata.publishNotice(env, user, w, id, await body()));
  if (area === 'schemes' && id && action === 'members' && child && parts[4] === 'end')
    return ok(await strata.endSchemeMembership(env, user, w, id, child));
  if (area === 'work-orders' && id && action === 'public')
    return ok(await strata.publicWork(env, user, w, id, await body()));
  if (area === 'work-orders' && id && action === 'proposals')
    return ok(await finance.proposeApproval(env, user, w, id, await body()));
  if (area === 'work-orders' && id && action === 'report-handoff')
    return ok(await integrations.reportHandoff(env, user, w, id));
  if (area === 'approvals' && id && action === 'decision')
    return ok(await finance.decideApproval(env, user, w, id, await body()));
  if (area === 'approvals' && id && action === 'response')
    return ok(await finance.councilResponse(env, user, w, id, await body()));
  if (area === 'payment-reconciliation' && id)
    return ok(await resolveReconciliation(env, user, w, id, await body()));
  if (tail === 'payments') return ok(await finance.createPayment(env, user, w, await body()));
  if (area === 'payments' && id && action === 'record')
    return ok(await finance.recordPayment(env, user, w, id, await body()));
  if (area === 'payments' && id && action === 'checkout')
    return ok(await finance.checkout(env, user, w, id));
  if (tail === 'forms') return ok(await forms.createForm(env, user, w, await body()));
  if (area === 'forms' && id && parts.length === 2)
    return ok(await forms.updateForm(env, user, w, id, await body()));
  if (tail === 'confidential')
    return ok(await forms.createRestrictedCase(env, user, w, await body()));
  if (area === 'confidential' && id && action === 'evidence')
    return ok(await forms.uploadRestrictedEvidence(env, user, id, await request.formData()));
  if (area === 'confidential' && id && parts.length === 2)
    return ok(await forms.updateRestrictedCase(env, user, id, await body()));
  if (area === 'integrations' && id && action === 'retry')
    return ok(await integrations.retryIntegration(env, user, w, id));
  if (tail === 'admin/staff') {
    staff();
    return ok(await admin.setStaff(env, user, await body()));
  }
  if (tail === 'admin/authority') {
    staff();
    return ok(await admin.setAuthority(env, user, await body()));
  }
  if (tail === 'admin/ownership') {
    staff();
    return ok(await admin.linkOwner(env, user, await body()));
  }
  if (tail === 'admin/management') {
    staff();
    return ok(await admin.transferManagement(env, user, await body()));
  }
  if (tail === 'admin/contractors') {
    staff();
    return ok(await admin.addContractor(env, user, await body()));
  }
  if (tail === 'admin/restricted-reviewers') {
    staff();
    return ok(await forms.setRestrictedReviewer(env, user, await body()));
  }
  return null;
}
