import { requireResidentialSector } from './features/residential-policy.server';
import { cashInvoicePeriod } from '../../../packages/booking/inspection-checkout';
import { legalStatements } from './features/legal-acceptance.server';
import { serviceInterestTableReady } from './features/client-service-interests.server';
import { calendarSchedulingEnabled, calendarSyncStatement } from './features/calendar-scheduling.server';
import { activity, projection } from '../../../packages/operations/core';
import type { Env } from '../../../packages/database/types';
import { assert, AppError, statement, now, uid } from '../../../packages/database/types';
import type { Principal, Workspace, Service } from '../../../packages/domain/index';
import { canTransition } from '../../../packages/domain/index';
import {
  onboardingSchema,
  propertySchema,
  residentialPropertyOnboardingSchema,
  addressKey,
  requestSchema,
  workOrderUpdateSchema,
} from '../../../packages/validation/index';
import {
  clientMembership,
  propertyAccess,
  currentTenancy,
  workOrderAccess,
  operationsWrite,
  managesProperty,
  booksServices,
  clientAdmin,
} from '../../../packages/authorization/server';
import { guestReportDelivery } from './features/guest-report.server';
import { mailEvent } from '../../../packages/notifications/server';
import { digest, seal } from '../../../packages/auth/crypto';
import { initialPropertySetupStatements } from './features/residential-property-setup.server';
import { assertOpenHomeLead } from '../../../packages/booking/residential-service-requests';

export function audit(
  env: Env,
  user: Principal,
  action: string,
  type: string,
  id: string,
  propertyId: string | null = null,
  metadata: Record<string, unknown> = {},
) {
  return statement(
    env.DB,
    'INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,property_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?)',
    uid('aud'),
    user.id,
    action,
    type,
    id,
    propertyId,
    JSON.stringify(metadata),
    now(),
  );
}
export function changedExactlyOne(env: Env) {
  return statement(env.DB, 'INSERT INTO mutation_guards(changed_rows) VALUES(changes())');
}
export function clearMutationGuard(env: Env) {
  return statement(env.DB, 'DELETE FROM mutation_guards');
}
export async function catalogue(env: Env, includeInactive = false): Promise<Service[]> {
  const rows = await statement(
    env.DB,
    `SELECT * FROM services ${includeInactive ? '' : 'WHERE active=1'} ORDER BY name`,
  ).all<Record<string, any>>();
  return rows.results.map((row) => ({ ...row, sectors: JSON.parse(row.sectors_json) }) as Service);
}

/**
 * Self-managing owners can open independent Residential and Commercial
 * accounts. Professional management of third-party property still requires
 * the separately reviewed organisation-application route.
 *
 * The existing D1 client insert trigger provisions the all-inclusive plan.
 */
export async function onboard(env: Env, user: Principal, input: unknown) {
  const data = onboardingSchema.parse(input);
  requireResidentialSector(data.landlordType);
  const residential = data.landlordType === 'residential';
  const clientType = residential ? 'landlord' : 'commercial_landlord';
  const workspaceKind = residential ? 'landlord' : 'commercial';
  const existing = await statement(
    env.DB,
    `SELECT c.id FROM clients c
     JOIN client_memberships m ON m.client_id=c.id
     JOIN client_entitlements e ON e.client_id=c.id AND e.workspace_kind=?
     WHERE m.user_id=? AND c.client_type=? AND m.role='owner'
       AND m.active=1 AND c.status='active' AND e.active=1
     ORDER BY c.created_at LIMIT 1`,
    workspaceKind,
    user.id,
    clientType,
  ).first<{ id: string }>();
  if (existing) return { clientId: existing.id, workspaceKind, landlordType: data.landlordType };
  // Retain the old Residential stable ID contract for retries/existing clients.
  const salt = residential ? 'landlord' : 'commercial_landlord';
  const clientId = `cli_${(await digest(`${salt}:${user.id}`)).slice(0, 32)}`;
  const membershipId = `mem_${clientId.slice(4)}`;
  const legal = await legalStatements(env,{kind:'user',id:user.id},'onboarding',clientId,{clientId,clientName:data.clientName,landlordType:data.landlordType},data.legalConsent);
  assert(!data.serviceInterests.some(area=>['commercial','strata','construction'].includes(area)),410,'SECTOR_RETIRED','Choose a current Residential service area.');
  const interests=[...new Set([residential?'residential':'commercial',...data.serviceInterests])];
  assert(await serviceInterestTableReady(env),503,'ONBOARDING_MIGRATION_PENDING','Account preferences are not configured.');
  await env.DB.batch([
    ...legal,
    statement(
      env.DB,
      `INSERT INTO clients(id,name,client_type,billing_email,created_at) VALUES(?,?,?,?,?)
       ON CONFLICT(id) DO NOTHING`,
      clientId,
      data.clientName,
      clientType,
      user.email,
      now(),
    ),
    statement(
      env.DB,
      `INSERT INTO client_memberships(id,client_id,user_id,role,created_at)
       VALUES(?,?,?,'owner',?) ON CONFLICT(client_id,user_id) DO NOTHING`,
      membershipId,
      clientId,
      user.id,
      now(),
    ),
    statement(
      env.DB,
      `INSERT INTO client_entitlements(client_id,workspace_kind,created_at)
       VALUES(?,?,?) ON CONFLICT DO NOTHING`,
      clientId,
      workspaceKind,
      now(),
    ),
    // Requested sectors are preferences, never entitlement, property authority or billing instructions.
    ...interests.map(area=>statement(env.DB,'INSERT INTO client_service_interests(client_id,service_area,requested_by,requested_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(client_id,service_area) DO NOTHING',clientId,area,user.id,now(),now())),
    // A verified account starts without Stripe customer, plan or payment obligation.
    statement(env.DB,`INSERT INTO account_subscription_preferences(client_id,account_state,subscription_intent,updated_at)
      VALUES(?,'verified','none',?) ON CONFLICT(client_id) DO NOTHING`,
      clientId,now()),
    statement(env.DB, 'UPDATE users SET display_name=? WHERE id=?', data.displayName, user.id),
    audit(env, user, 'client.onboarded', 'client', clientId, null, {
      landlordType: data.landlordType,
      workspaceKind,
    }),
  ]);
  return { clientId, workspaceKind, landlordType: data.landlordType };
}
export async function createProperty(env: Env, user: Principal, w: Workspace, input: unknown) {
  requireResidentialSector(w.kind === 'landlord' ? 'residential' : w.kind);
  assert(
    w.kind === 'landlord' || w.kind === 'commercial',
    403,
    'SELF_MANAGEMENT_REQUIRED',
    'Create a property from your Residential or Commercial Landlord workspace.',
  );
  const member = await clientMembership(env, user, w.scopeId, true);
  assert(
    ['owner', 'admin'].includes(member.role),
    403,
    'ACCOUNT_ADMIN_REQUIRED',
    'An account administrator must add the property.',
  );
  // Free property onboarding is never a payment or subscription event.
  // Checkout is a separate, explicitly consented action after property setup.
  const commercial = w.kind === 'commercial';
  const allowedPropertyTypes = commercial
    ? ['Office', 'Retail', 'Warehouse', 'Industrial', 'Mixed-use', 'Other']
    : ['House', 'Unit', 'Apartment', 'Townhouse', 'Villa', 'Duplex', 'Studio', 'Other'];
  const extended = w.kind==='landlord' && !!input && typeof input==='object' &&
    ('profile' in input || 'tenancy' in input || 'notes' in input);
  const data = extended
    ? residentialPropertyOnboardingSchema.parse(input)
    : propertySchema.parse(input);
  assert(
    allowedPropertyTypes.includes(data.propertyType),
    422,
    'PROPERTY_TYPE_INVALID',
    `Choose a ${commercial ? 'commercial' : 'residential'} property type.`,
  );
  const key = addressKey(data.address, data.suburb, data.postcode);
  const existing = await statement(
    env.DB,
    'SELECT id FROM properties WHERE address_key=?',
    key,
  ).first<{ id: string }>();
  if (existing) {
    try {
      await propertyAccess(env, user, w, existing.id);
      return { propertyId: existing.id, billingRequired: false, alreadyExists: true };
    } catch {
      assert(
        false,
        409,
        'PROPERTY_REVIEW_REQUIRED',
        'This property needs a relationship review. Contact ProInspect to link it securely.',
      );
    }
  }
  const propertyId = uid('prop');
  const time = now();
  await env.DB.batch([
    statement(
      env.DB,
      `INSERT INTO properties(id,address,suburb,postcode,address_key,sector,property_type,created_at)
       VALUES(?,?,?,?,?,?,?,?)`,
      propertyId,
      data.address,
      data.suburb,
      data.postcode,
      key,
      commercial ? 'commercial' : 'residential',
      data.propertyType,
      time,
    ),
    statement(
      env.DB,
      `INSERT INTO client_property_links(id,client_id,property_id,role,starts_at)
       VALUES(?,?,?,'owner',?)`,
      uid('link'),
      w.scopeId,
      propertyId,
      time,
    ),
    statement(
      env.DB,
      `INSERT INTO property_management_relationships(id,property_id,manager_client_id,mode,starts_at)
       VALUES(?,?,?,?,?)`,
      uid('mgmt'),
      propertyId,
      w.scopeId,
      commercial ? 'commercial_managed' : 'self_managed',
      time,
    ),
    ...(commercial
      ? [statement(
          env.DB,
          'INSERT INTO portfolio_owners(property_id,client_id,name,email) VALUES(?,?,?,?)',
          propertyId, w.scopeId, user.display_name || user.email, user.email,
        )]
      : []),
    ...(extended ? await initialPropertySetupStatements(env,user,propertyId,
      residentialPropertyOnboardingSchema.parse(data)) : []),
    statement(env.DB,"UPDATE account_subscription_preferences SET account_state='active',updated_at=? WHERE client_id=? AND account_state='verified'",time,w.scopeId),
    audit(env, user, 'property.created', 'property', propertyId, propertyId, {
      landlordType: commercial ? 'commercial' : 'residential',
    }),
  ]);
  return { propertyId, billingRequired: false };
}
export async function createRequest(env: Env, user: Principal, w: Workspace, input: unknown) {
  const data = requestSchema.parse(input);
  if(data.serviceIntake) assert(
    ['landlord','property-manager'].includes(w.kind),403,
    'SERVICE_REQUEST_ROLE','Use an authorised residential owner or manager workspace.',
  );
  let propertyId: string;
  let clientId: string | null = null;
  let tenancyId: string | null = null;
  let source = 'client';
  if (w.kind === 'tenant') {
    const tenancy = await currentTenancy(env, user, w.scopeId);
    propertyId = tenancy.property_id;
    tenancyId = tenancy.id;
    source = 'tenant';
    const manager = await statement(
      env.DB,
      `SELECT manager_client_id FROM property_management_relationships WHERE property_id=? AND starts_at<=? AND (ends_at IS NULL OR ends_at>?)`,
      propertyId,
      now(),
      now(),
    ).first<{ manager_client_id: string }>();
    clientId = manager?.manager_client_id ?? null;
  } else {
    assert(
      managesProperty(w) && data.propertyId,
      403,
      'REQUEST_FORBIDDEN',
      'Select an authorised property.',
    );
    const requestProperty=await propertyAccess(env, user, w, data.propertyId, true);
    if(data.serviceIntake){
      assert(['landlord','property-manager'].includes(w.kind),403,
        'SERVICE_REQUEST_ROLE','Use an authorised residential client workspace.');
      assert(requestProperty.sector==='residential',422,
        'SERVICE_SECTOR_MISMATCH','This request is only available for residential properties.');
    }
    propertyId = data.propertyId;
    clientId = w.scopeId;
  }
  if (data.spaceId) {
    const space = w.kind === 'tenant'
      ? await statement(env.DB,
        `SELECT s.id FROM co_living_spaces s
          JOIN co_living_occupancies own ON own.tenancy_id=?
          JOIN co_living_spaces mine ON mine.id=own.space_id AND mine.property_id=s.property_id
          WHERE s.id=? AND s.property_id=? AND s.active=1
            AND (s.space_type='shared_area' OR s.id=own.space_id)`,
        tenancyId,data.spaceId,propertyId,
      ).first()
      : await statement(env.DB,
        'SELECT id FROM co_living_spaces WHERE id=? AND property_id=? AND active=1',
        data.spaceId,propertyId,
      ).first();
    assert(space,404,'CO_LIVING_SPACE_NOT_FOUND',
      'Choose your own assigned room or bed, or an authorised shared area.');
  }
  if(data.serviceIntake){
    try{ assertOpenHomeLead(data.serviceIntake); }
    catch(e){throw new AppError(422,'OPEN_HOME_NOTICE',
      e instanceof Error?e.message:'Open Home scheduling requirements not met.');}
  }
  const id = uid('req'),
    reference = `REQ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    time = now();
  const statements = [
    statement(
      env.DB,
      `INSERT INTO requests(id,reference,client_id,property_id,tenancy_id,created_by,source,category,title,details,priority,co_living_space_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'submitted',?,?)`,
      id,
      reference,
      clientId,
      propertyId,
      tenancyId,
      user.id,
      source,
      data.category,
      data.title,
      data.details,
      data.priority,
      data.spaceId ?? null,
      time,
      time,
    ),
    ...(data.serviceIntake ? [statement(env.DB,
      `INSERT INTO request_service_intakes
        (request_id,service_kind,encrypted_envelope,created_at) VALUES(?,?,?,?)`,
      id,data.serviceIntake.serviceCode,
      await seal(env.DATA_ENCRYPTION_KEY,`request-service:${id}`,data.serviceIntake),time)] : []),
    audit(env, user, 'request.created', 'request', id, propertyId, {
      source,serviceCode:data.serviceIntake?.serviceCode??null,
      schedulingConfirmed:false,additionalChargesApproved:false,
    }),
    await mailEvent(env, 'request.received', {
      to: user.email,
      subject: `Request received: ${reference}`,
      heading: 'Your request has been received',
      body: 'ProInspect will review the request. Track progress from your portal. This submission is not confirmation of an emergency response.',
      href: `${env.APP_ORIGIN}${w.href}/requests`,
      facts: { Reference: reference, Request: data.title },
    }),
  ];
  if (env.OPERATIONS_EMAIL)
    statements.push(
      await mailEvent(env, 'operations.request', {
        to: env.OPERATIONS_EMAIL,
        subject: `New request ${reference}`,
        heading: 'New property request',
        body: 'Review and triage this request in ProInspect.',
        href: `${env.APP_ORIGIN}/w/staff/operations/requests`,
        facts: { Reference: reference, Priority: data.priority },
      }),
    );
  await env.DB.batch(statements);
  return { id, reference };
}
export async function convertRequest(env: Env, user: Principal, requestId: string) {
  operationsWrite(user);
  const request = await statement(env.DB, 'SELECT * FROM requests WHERE id=?', requestId).first<
    Record<string, any>
  >();
  assert(request, 404, 'REQUEST_NOT_FOUND', 'Request not found.');
  const existing = await statement(
    env.DB,
    'SELECT id FROM work_orders WHERE request_id=?',
    requestId,
  ).first<{ id: string }>();
  if (existing) return existing;
  const id = `wo_req_${requestId.slice(4)}`,
    time = now();
  await env.DB.batch([
    statement(
      env.DB,
      `INSERT INTO work_orders(id,reference,request_id,client_id,property_id,scheme_id,title,status,priority,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'triage',?,?,?)`,
      id,
      `WO-${request.reference.slice(4)}`,
      requestId,
      request.client_id,
      request.property_id,
      request.scheme_id,
      request.title,
      request.priority,
      time,
      time,
    ),
    statement(
      env.DB,
      "UPDATE requests SET status='under_review',updated_at=? WHERE id=?",
      time,
      requestId,
    ),
    audit(env, user, 'request.converted', 'work_order', id, request.property_id),
  ]);
  return { id };
}
export async function updateWorkOrder(
  env: Env,
  user: Principal,
  w: Workspace,
  id: string,
  input: unknown,
) {
  assert(w.kind === 'staff', 403, 'STAFF_REQUIRED', 'Work execution is managed by ProInspect.');
  const data = workOrderUpdateSchema.parse(input);
  const order = await workOrderAccess(env, user, w, id, true);
  assert(
    order.version === data.version,
    409,
    'STALE_VERSION',
    'This work order has changed. Reload before saving.',
  );
  if (data.assignedStaffId) {
    operationsWrite(user);
    const staff = await statement(
      env.DB,
      `SELECT user_id FROM staff_profiles WHERE user_id=? AND active=1 AND role!='read_only'`,
      data.assignedStaffId,
    ).first();
    assert(staff, 422, 'ASSIGNEE_INVALID', 'Select an active staff member.');
  }
  const next = data.status ?? order.status;
  assert(
    next === order.status || canTransition(order.status, next),
    422,
    'INVALID_TRANSITION',
    'This status change is not available.',
  );
  if(order.booking_id){
    const linkedPayment=await statement(env.DB,
      `SELECT p.status,p.provider,p.checkout_session_id FROM registered_booking_payment_links l
        JOIN payments p ON p.id=l.payment_id WHERE l.booking_id=?`,order.booking_id,
    ).first<{status:string;provider:string;checkout_session_id:string|null}>();
    if(linkedPayment&&next!==order.status&&next!=='cancelled'){
      assert(linkedPayment.status==='paid'&&linkedPayment.provider==='stripe'&&
        Boolean(linkedPayment.checkout_session_id),409,'REGISTERED_PAYMENT_NOT_VERIFIED',
        'The one-off booking cannot proceed until a provider-signed payment is settled.');
    }
    if(linkedPayment&&next==='cancelled'){
      assert(linkedPayment.status!=='paid'&&!linkedPayment.checkout_session_id,409,
        'PAYMENT_CANCELLATION_REVIEW',
        'A payment or open Checkout requires a separate financial cancellation/reconciliation review.');
    }
  }
  if (next === 'approved')
    assert(
      await statement(
        env.DB,
        "SELECT id FROM approvals WHERE work_order_id=? AND status='approved'",
        id,
      ).first(),
      409,
      'APPROVAL_REQUIRED',
      'A recorded approval is required.',
    );
  if (next === 'completed') {
    // Once native report creation is started it becomes the authoritative output
    // gate. An unrelated/manual PDF is not enough to complete that Work Order.
    const native = await statement(
      env.DB,
      'SELECT status,approved_version_id,issued_document_id FROM inspection_reports WHERE work_order_id=?',
      id,
    ).first<{status:string;approved_version_id:string|null;issued_document_id:string|null}>();
    if (native) {
      const reviewedOutput = native.status === 'issued' && native.approved_version_id && native.issued_document_id
        ? await statement(env.DB,`SELECT d.id FROM documents d JOIN report_render_manifests m
           ON m.document_id=d.id AND m.report_version_id=?
           WHERE d.id=? AND d.work_order_id=? AND d.status='issued'`,
          native.approved_version_id,native.issued_document_id,id).first()
        : null;
      assert(reviewedOutput,409,'APPROVED_REPORT_REQUIRED',
        'Issue the independently reviewed native report version before completing this work.');
    } else if (order.booking_id) {
      assert(
        await statement(env.DB,"SELECT id FROM documents WHERE work_order_id=? AND status='issued'",id).first(),
        409,'REPORT_REQUIRED','Issue the service report before completing this booking.'
      );
    }
  }
  const time = now();
  const updates = [
    statement(
      env.DB,
      `UPDATE work_orders SET status=?,assigned_staff_id=COALESCE(?,assigned_staff_id),completion_notes=COALESCE(?,completion_notes),version=version+1,updated_at=? WHERE id=? AND version=?`,
      next,
      data.assignedStaffId ?? null,
      data.completionNotes ?? null,
      time,
      id,
      data.version,
    ),
    changedExactlyOne(env),
    audit(env, user, 'work_order.updated', 'work_order', id, order.property_id, {
      from: order.status,
      to: next,
    }),
  ];
  if (order.booking_id && ['completed', 'cancelled'].includes(next)) {
    updates.push(
      statement(env.DB,'UPDATE bookings SET status=?,version=version+1 WHERE id=?',next,order.booking_id),
    );
    // Credit bookings are payable by invoice after completed service; no
    // Stripe card payment is needed to begin work with approved account terms.
    if (next === 'completed') {
      const credit = await statement(env.DB,
        "SELECT term_code FROM cash_booking_charges WHERE booking_id=? AND status='awaiting_service'",order.booking_id)
        .first<{term_code:'net_7'|'eom_7'}>();
      if (credit) updates.push(statement(env.DB,
        "UPDATE cash_booking_charges SET status='ready_to_invoice',completed_at=?,period=? WHERE booking_id=? AND status='awaiting_service'",
        time,cashInvoicePeriod(time,credit.term_code),order.booking_id));
    } else updates.push(statement(env.DB,
      "UPDATE cash_booking_charges SET status='cancelled' WHERE booking_id=? AND status='awaiting_service'",
      order.booking_id));
  }
  if (order.request_id && next === 'completed')
    updates.push(
      statement(
        env.DB,
        "UPDATE requests SET status='completed',version=version+1,updated_at=? WHERE id=?",
        time,
        order.request_id,
      ),
    );
  if (order.request_id && next === 'completed')
    updates.push(
      statement(
        env.DB,
        "INSERT INTO notifications(id,user_id,title,message,href,created_at) SELECT ?,created_by,'Request completed','The work linked to your request is complete. Open your authorised workspace for details.','/workspaces',? FROM requests WHERE id=?",
        uid('ntf'),
        time,
        order.request_id,
      ),
    );
  if (order.booking_id && ['completed', 'cancelled'].includes(next) && calendarSchedulingEnabled(env)) {
    const existingBooking = await statement(env.DB, 'SELECT version FROM bookings WHERE id=?', order.booking_id)
      .first<{ version: number }>();
    if (existingBooking)
      updates.push(calendarSyncStatement(env, order.booking_id, existingBooking.version + 1));
  }
  updates.push(
    projection(env, 'work_order.updated', id, {
      workOrderId: id,
      propertyId: order.property_id,
      schemeId: order.scheme_id,
      status: next,
    }),
  );
  updates.push(clearMutationGuard(env));
  await env.DB.batch(updates);
  return { id, status: next };
}
export async function directReportIssueOrder(env: Env, user: Principal, w: Workspace, workOrderId: string) {
  assert(w.kind === 'staff', 403, 'STAFF_REQUIRED', 'Only authorised staff may issue reports.');
  const order = await workOrderAccess(env, user, w, workOrderId, true);
  operationsWrite(user);
  assert(order.assigned_staff_id !== user.id, 403, 'REPORT_INDEPENDENT_REVIEW',
    'The assigned inspector cannot issue the final report.');
  const managed = await statement(env.DB,
    'SELECT id FROM inspection_reports WHERE work_order_id=?', workOrderId).first();
  assert(!managed, 409, 'USE_REPORT_REVIEW',
    'Complete review and issue the approved version in the report workspace.');
  return order;
}
export async function issueReport(
  env: Env,
  user: Principal,
  w: Workspace,
  workOrderId: string,
  form: FormData,
  options?: { handoffId: string },
) {
  const order = await directReportIssueOrder(env, user, w, workOrderId);
  const file = form.get('file');
  assert(file instanceof File, 422, 'FILE_REQUIRED', 'Choose a PDF report.');
  assert(
    file.size > 5 && file.size <= 10 * 1024 * 1024,
    422,
    'FILE_SIZE',
    'The PDF must be smaller than 10 MB.',
  );
  assert(file.type === 'application/pdf', 422, 'PDF_REQUIRED', 'Only PDF reports are accepted.');
  const bytes = await file.arrayBuffer();
  assert(
    new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-',
    422,
    'INVALID_PDF',
    'The file is not a PDF document.',
  );
  assert(
    order.client_id && (order.property_id || order.scheme_id),
    409,
    'DOCUMENT_CONTEXT_REQUIRED',
    'This work order needs an explicit commissioning client and property.',
  );
  const hash = await digest(bytes);
  const previous = await statement(
    env.DB,
    "SELECT id,title FROM documents WHERE work_order_id=? AND sha256=? AND category='service_report'",
    workOrderId,
    hash,
  ).first<{ id: string; title: string }>();
  if (previous) {
    if (options?.handoffId)
      await env.DB.batch([
        statement(
          env.DB,
          'UPDATE report_handoffs SET consumed_at=?,document_id=? WHERE id=? AND consumed_at IS NULL AND expires_at>?',
          now(),
          previous.id,
          options.handoffId,
          now(),
        ),
        changedExactlyOne(env),
        clearMutationGuard(env),
      ]);
    return { ...previous, replayed: true };
  }
  const id = uid('doc'),
    objectKey = `reports/${order.property_id ?? order.scheme_id}/${id}.pdf`,
    time = now();
  const title =
    String(form.get('title') ?? order.title)
      .trim()
      .slice(0, 180) || order.title;
  await env.DOCUMENTS.put(objectKey, bytes, {
    httpMetadata: { contentType: 'application/pdf' },
    customMetadata: { documentId: id, sha256: hash },
  });
  try {
    const statements = [
      statement(
        env.DB,
        `INSERT INTO documents(id,property_id,scheme_id,booking_id,work_order_id,request_id,title,category,object_key,content_type,size,sha256,status,created_by,created_at,issued_at,source_report_id) SELECT ?,?,?,?,?,?,?,'service_report',?,'application/pdf',?,?,'issued',?,?,?,?
         FROM work_orders wo WHERE wo.id=? AND wo.client_id=? AND wo.property_id IS ? AND wo.assigned_staff_id IS NOT ?
         AND NOT EXISTS (SELECT 1 FROM inspection_reports ir WHERE ir.work_order_id=wo.id)
         AND EXISTS (SELECT 1 FROM staff_profiles s JOIN users u ON u.id=s.user_id
           WHERE s.user_id=? AND s.active=1 AND u.active=1 AND s.role IN ('administrator','operations_manager'))`,
        id,
        order.property_id,
        order.scheme_id,
        order.booking_id,
        workOrderId,
        order.request_id,
        title,
        objectKey,
        file.size,
        hash,
        user.id,
        time,
        time,
        options?.handoffId ?? null,
        workOrderId,
        order.client_id,
        order.property_id,
        user.id,
        user.id,
      ),
      changedExactlyOne(env),
      clearMutationGuard(env),
      statement(
        env.DB,
        `INSERT INTO document_grants(document_id,recipient_kind,recipient_id,created_by,created_at) VALUES(?,'client',?,?,?)`,
        id,
        order.client_id,
        user.id,
        time,
      ),
      audit(env, user, 'report.issued', 'document', id, order.property_id, { workOrderId }),
    ];
    if (options?.handoffId)
      statements.push(
        statement(
          env.DB,
          'UPDATE report_handoffs SET consumed_at=?,document_id=? WHERE id=? AND consumed_at IS NULL AND expires_at>?',
          now(),
          id,
          options.handoffId,
          now(),
        ),
        changedExactlyOne(env),
        clearMutationGuard(env),
      );
    statements.push(
      projection(env, 'report.issued', id, {
        documentId: id,
        workOrderId,
        propertyId: order.property_id,
        schemeId: order.scheme_id,
        status: 'issued',
      }),
    );
    const recipients = await statement(
      env.DB,
      `SELECT u.id,u.email FROM users u JOIN client_memberships m ON m.user_id=u.id WHERE m.client_id=? AND m.active=1 AND u.active=1`,
      order.client_id,
    ).all<{ id: string; email: string }>();
    assert(
      recipients.results.length <= 30,
      409,
      'RECIPIENT_REVIEW_REQUIRED',
      'This account requires batch notification review before report issuance.',
    );
    for (const recipient of recipients.results) {
      const href = `${env.APP_ORIGIN}/workspaces`;
      statements.push(
        statement(
          env.DB,
          'INSERT INTO notifications(id,user_id,title,message,href,created_at) VALUES(?,?,?,?,?,?)',
          uid('ntf'),
          recipient.id,
          'Your report is ready',
          title,
          href,
          time,
        ),
        await mailEvent(env, 'report.issued', {
          to: recipient.email,
          subject: 'Your ProInspect report is ready',
          heading: 'A new report is available',
          body: 'Your report is stored securely in your property account. Sign in to view it.',
          href,
          facts: { Report: title },
        }),
      );
    }
    const guestDelivery=order.booking_id ? await guestReportDelivery(env,order.booking_id,id,title):null;
    if(guestDelivery) statements.push(...guestDelivery);
    await env.DB.batch(statements);
  } catch (error) {
    await env.DOCUMENTS.delete(objectKey);
    throw error;
  }
  return { id, title };
}
