import {
  recordPage,
  operationalReport,
  orderDetail,
  propertyDetail,
  bookingDetail,
} from './records.server';
import { downloadWorkspaceDocument } from '../../../../packages/authorization/documents';
import * as enquiries from './enquiries.server';
import { v2StaffData,v2CustomerData,v2Command } from './v2-business.server';
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
import * as waResidential from './wa-residential.server';
import * as waLifecycle from './wa-lifecycle.server';
import * as waIssuance from './wa-issuance.server';
import * as bonds from './bonds.server';
import * as bondCompletion from './bond-completion.server';
import * as integrations from './integrations.server';
import {reportRoutes} from './report-router.server';
import { maintenanceData, maintenanceCommand } from './v2-maintenance.server';
import {estateRegister,estateCommand} from './v2-estates.server';
import {sectorData,sectorCommand} from './v2-sectors.server';
import {intelligenceData,intelligenceCommand,intelligenceExport} from './v2-intelligence.server';
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
  if(area==='reports')return reportRoutes(request,env,user,w,tail);
  const staff = () => {
    assert(w.kind === 'staff', 403, 'STAFF_REQUIRED', 'Use the Staff workspace.');
    operationsWrite(user);
  };
  if (method === 'GET') {
    if (tail === 'v2') return ok(await v2StaffData(env,user,w,url.searchParams.get('market') ?? 'RES'));
    if (tail === 'v2-account') return ok(await v2CustomerData(env,user,w));
    if (tail === 'v2-maintenance') return ok(await maintenanceData(env,user,w,url.searchParams.get('orderId')));
    if(tail==='v2-estates') return ok(await estateRegister(env,user,w));
    if(tail==='v2-sectors') return ok(await sectorData(env,user,w));
    if(tail==='v2-intelligence') return ok(await intelligenceData(env,user,w,url.searchParams));
    if(tail==='v2-intelligence/export') return intelligenceExport(env,user,w,url.searchParams);
    if (tail === 'records') return ok(await recordPage(env, user, w, url));
    if (tail === 'reporting') return ok(await operationalReport(env, user, w));
    if (area === 'work-orders' && id && parts.length === 2)
      return ok(await orderDetail(env, user, w, id));
    if (area === 'properties' && id && parts.length === 2)
      return ok(await propertyDetail(env, user, w, id));
    if (area === 'bookings' && id && parts.length === 2)
      return ok(await bookingDetail(env, user, w, id));
    if (area === 'documents' && id && action === 'download')
      return downloadWorkspaceDocument(env, user, w, id);
    if (tail === 'enquiries') return ok(await enquiries.listEnquiries(env, user, w, url));
    if (area === 'enquiries' && id && parts.length === 2)
      return ok(await enquiries.enquiryDetail(env, user, w, id));
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
    if (area === 'tenancies' && id && action === 'bonds')
      return ok(await bonds.listBonds(env,user,w,id));
    if (area === 'bonds' && id && parts.length === 2)
      return ok(await bonds.getBond(env,user,w,id));
    if (area === 'tenancies' && id && action === 'forms')
      return ok(await forms.formsData(env, user, w, id));
    if (area === 'tenancies' && id && action === 'wa-forms')
      return ok(await waResidential.waFormsData(env, user, w, id));
    if (tail === 'wa-form-queue')
      return ok(await waLifecycle.waReviewQueue(env,user,w));
    if (tail === 'wa-form-templates')
      return ok(await waLifecycle.waTemplatesData(env,user,w));
    if (area === 'wa-forms' && id && parts.length === 2)
      return ok(await waLifecycle.waCaseDetail(env,user,w,id));
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
  if (area==='v2-maintenance' && parts.length>=2 && parts.length<=4)
    return ok(await maintenanceCommand(env,user,w,parts.slice(1),await body()));
  if(area==='v2-estates' && parts.length>=2 && parts.length<=4) return ok(await estateCommand(env,user,w,parts.slice(1),await body()));
  if(area==='v2-sectors' && parts.length>=2 && parts.length<=4) return ok(await sectorCommand(env,user,w,parts.slice(1),await body()));
  if(area==='v2-intelligence' && parts.length>=2 && parts.length<=4) return ok(await intelligenceCommand(env,user,w,parts.slice(1),await body()));
  if (area === 'v2' && parts.length<=4)
    return ok(await v2Command(env,user,w,id,action,parts[3],await body()));
  if (area === 'enquiries' && id) {
    if (action === 'reply')
      return ok(await enquiries.replyToEnquiry(env, user, w, id, await body()));
    if (action === 'link') return ok(await enquiries.linkEnquiry(env, user, w, id, await body()));
    if (parts.length === 2)
      return ok(await enquiries.updateEnquiry(env, user, w, id, await body()));
  }
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
  if (tail === 'schemes') return ok(await strata.createScheme(env, user, w, await body()));
  if (area === 'schemes' && id && action === 'structure')
    return ok(await strata.schemeStructure(env, user, w, id, await body()));
  if (area === 'schemes' && id && action === 'requests')
    return ok(await strata.buildingRequest(env, user, w, id, await body()));
  if (area === 'schemes' && id && action === 'notices' && child && parts[4] === 'withdraw')
    return ok(await strata.withdrawNotice(env, user, w, id, child, await body()));
  if (area === 'schemes' && id && action === 'notices' && child && parts[4] === 'retry')
    return ok(await strata.retryNotice(env, user, w, id, child));
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
  if (tail === 'payments') return ok(await finance.createPayment(env, user, w, await body()));
  if (area === 'payments' && id && action === 'record')
    return ok(await finance.recordPayment(env, user, w, id, await body()));
  if (area === 'payments' && id && action === 'checkout')
    return ok(await finance.checkout(env, user, w, id));
  if (tail === 'bonds') return ok(await bonds.createBond(env,user,w,await body()));
  if (area === 'bonds' && id && action === 'parties' && !child)
    return ok(await bonds.addParticipant(env,user,w,id,await body()));
  if (area === 'bonds' && id && action === 'parties' && child && parts[4]==='status')
    return ok(await bonds.updateParticipant(env,user,w,id,child,await body()));
  if (area === 'bonds' && id && action === 'contributions')
    return ok(await bondCompletion.addBondContribution(env,user,w,id,await body()));
  if (area === 'bonds' && id && action === 'verifications')
    return ok(await bondCompletion.verifyExternalBondDocument(env,user,w,id,await body()));
  if (area === 'bonds' && id && action === 'exceptions' && !child)
    return ok(await bondCompletion.createBondException(env,user,w,id,await body()));
  if (area === 'bonds' && id && action === 'exceptions' && child && parts[4]==='status')
    return ok(await bondCompletion.changeBondException(env,user,w,id,child,await body()));
  if (area === 'bonds' && id && action === 'transactions' && child && parts[4]==='prepare')
    return ok(await bondCompletion.prepareBondForm(env,user,w,id,child,await body()));
  if (area === 'bonds' && id && action === 'transactions' && child && parts[4]==='allocations')
    return ok(await bondCompletion.addBondAllocation(env,user,w,id,child,await body()));
  if (area === 'bonds' && id && action === 'transactions' && child && parts[4]==='payout')
    return ok(await bondCompletion.reconcileBondPayout(env,user,w,id,child,await body()));
  if (area === 'bonds' && id && action === 'receipts')
    return ok(await bonds.recordReceipt(env,user,w,id,await body()));
  if (area === 'bonds' && id && action === 'transactions' && !child)
    return ok(await bonds.createTransaction(env,user,w,id,await body()));
  if (area === 'bonds' && id && action === 'transactions' && child && parts[4]==='status')
    return ok(await bonds.confirmTransaction(env,user,w,id,child,await body()));
  if (area === 'bonds' && id && action === 'transactions' && child && parts[4]==='claims')
    return ok(await bonds.addClaim(env,user,w,id,child,await body()));
  if (area === 'bonds' && id && action === 'transactions' && child && parts[4]==='notices')
    return ok(await bonds.addNotice(env,user,w,id,child,await body()));
  if (area === 'bonds' && id && action === 'transactions' && child && parts[4]==='case')
    return ok(await bonds.recordCase(env,user,w,id,child,await body()));
  if (area === 'bonds' && id && action === 'evidence')
    return ok(await bonds.addEvidence(env,user,w,id,await body()));
  if (tail === 'wa-form-templates/upload')
    return ok(await waLifecycle.waUploadTemplate(env,user,w,await request.formData()));
  if (area === 'wa-form-templates' && id && action === 'approve')
    return ok(await waLifecycle.waApproveTemplate(env,user,w,id,await body()));

  if (tail === 'wa-forms')
    return ok(await waResidential.waCreateForm(env,user,w,await body()));
  if (area === 'wa-forms' && id && action === 'issue')
    return ok(await waResidential.waLinkIssuedDocument(env,user,w,id,await body()));
  if (area === 'wa-forms' && id && action === 'verify')
    return ok(await waIssuance.waVerifyRequirement(env,user,w,id,await body()));
  if (area === 'wa-forms' && id && action === 'complete')
    return ok(await waIssuance.waCompleteAdministrativeCase(env,user,w,id,await body()));
  if (area === 'wa-forms' && id && action === 'receipt')
    return ok(await waLifecycle.waConfirmReceipt(env,user,w,id,await body()));
  if (area === 'wa-forms' && id && action === 'tenant-answer')
    return ok(await waLifecycle.waTenantAnswer(env,user,w,id,await body()));
  if (area === 'wa-forms' && id && action === 'decision')
    return ok(await waLifecycle.waDecision(env,user,w,id,await body()));
  if (area === 'wa-forms' && id && action === 'external')
    return ok(await waLifecycle.waExternalEvent(env,user,w,id,await body()));
  if (area === 'wa-forms' && id && action === 'signature-evidence')
    return ok(await waLifecycle.waSignatureEvidence(env,user,w,id,await body()));
  if (area === 'wa-forms' && id && action === 'delivery')
    return ok(await waResidential.waRecordDelivery(env,user,w,id,await body()));
  if (area === 'wa-forms' && id && parts.length === 2)
    return ok(await waResidential.waUpdateForm(env,user,w,id,await body()));
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
