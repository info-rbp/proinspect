import { z } from 'zod';
import { statement, assert, now, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import {
  operationsWrite,
  propertyAccess,
  schemeAccess,
  requestAccess,
  documentAllowed,
  booksServices,
  currentTenancy,
} from '../../../../packages/authorization/server';
import {
  boundedFile,
  activity,
  projection,
  recordId,
  shortText,
  reference,
  version,
  guard,
  clearGuard,
} from '../../../../packages/operations/core';
import { seal, unseal } from '../../../../packages/auth/crypto';
import { mailEvent } from '../../../../packages/notifications/server';

async function documentContext(
  env: Env,
  user: Principal,
  w: Workspace,
  d: {
    property_id?: string | null;
    scheme_id?: string | null;
    created_by?: string;
    uploaded_client_id?: string | null;
  },
  write = true,
) {
  if (w.kind === 'staff') {
    operationsWrite(user);
    return;
  }
  assert(
    booksServices(w),
    403,
    'DOCUMENT_WRITE_FORBIDDEN',
    'Use an authorised management workspace.',
  );
  if (d.scheme_id) await schemeAccess(env, user, w, d.scheme_id, write);
  else {
    assert(d.property_id, 422, 'PROPERTY_REQUIRED', 'Choose a property.');
    await propertyAccess(env, user, w, d.property_id, write);
  }
  if (d.created_by)
    assert(
      d.created_by === user.id || d.uploaded_client_id === w.scopeId,
      403,
      'DOCUMENT_OWNER_REQUIRED',
      'Only the originating account can change this document.',
    );
}
export async function uploadDocument(env: Env, user: Principal, w: Workspace, form: FormData) {
  const d = z
    .object({
      title: shortText,
      category: z.enum([
        'tenancy_document',
        'property_condition_report',
        'property_record',
        'quote',
        'building_document',
        'service_report',
      ]),
      propertyId: recordId.optional(),
      schemeId: recordId.optional(),
      previousDocumentId: recordId.optional(),
    })
    .parse(Object.fromEntries([...form.entries()].filter(([k, v]) => k !== 'file' && v !== '')));
  assert(d.propertyId || d.schemeId, 422, 'CONTEXT_REQUIRED', 'Choose a property or scheme.');
  await documentContext(env, user, w, { property_id: d.propertyId, scheme_id: d.schemeId });
  assert(
    !(d.schemeId && d.propertyId),
    422,
    'SINGLE_CONTEXT',
    'Choose one primary property or scheme context.',
  );
  const f = await boundedFile(form);
  assert(
    f.mime === 'application/pdf',
    422,
    'PDF_REQUIRED',
    'Documents must be PDFs. Use request attachments for photographs.',
  );
  let previous: Record<string, any> | null = null;
  if (d.previousDocumentId) {
    previous = await statement(
      env.DB,
      'SELECT * FROM documents WHERE id=?',
      d.previousDocumentId,
    ).first<Record<string, any>>();
    assert(
      previous &&
        previous.property_id === (d.propertyId ?? null) &&
        previous.scheme_id === (d.schemeId ?? null) &&
        previous.status === 'issued',
      422,
      'REVISION_CONTEXT',
      'The new revision must match the current issued document context.',
    );
    await documentContext(env, user, w, previous);
  }
  const id = uid('doc'),
    key = `documents/${id}.pdf`,
    time = now();
  await env.DOCUMENTS.put(key, f.bytes, { httpMetadata: { contentType: f.mime } });
  try {
    await env.DB.batch([
      statement(
        env.DB,
        "INSERT INTO documents(id,property_id,scheme_id,title,category,object_key,content_type,size,sha256,version,status,created_by,created_at,previous_document_id,uploaded_client_id) VALUES(?,?,?,?,?,?,?,?,?,?,'review',?,?,?,?)",
        id,
        d.propertyId ?? null,
        d.schemeId ?? null,
        d.title,
        d.category,
        key,
        f.mime,
        f.file.size,
        f.hash,
        previous ? previous.version + 1 : 1,
        user.id,
        time,
        previous?.id ?? null,
        w.kind === 'staff' ? null : w.scopeId,
      ),
      activity(
        env,
        user,
        'document.uploaded_for_review',
        'document',
        id,
        d.propertyId ?? null,
        d.schemeId ?? null,
      ),
    ]);
  } catch (error) {
    await env.DOCUMENTS.delete(key);
    throw error;
  }
  return { id, status: 'review', version: previous ? previous.version + 1 : 1 };
}
export async function issueDocument(
  env: Env,
  user: Principal,
  w: Workspace,
  id: string,
  input: unknown,
) {
  const d = z
    .object({
      audience: z.enum(['client', 'tenancy', 'scheme_resident', 'scheme_owner', 'scheme_council']),
      recipientId: recordId,
      reviewReference: reference,
    })
    .parse(input);
  const doc = await statement(env.DB, 'SELECT * FROM documents WHERE id=?', id).first<
    Record<string, any>
  >();
  assert(doc, 404, 'DOCUMENT_NOT_FOUND', 'Document not found.');
  await documentContext(env, user, w, doc);
  assert(
    ['review', 'approved', 'issued'].includes(doc.status),
    409,
    'DOCUMENT_ALREADY_ISSUED',
    'Issue a new revision to change an issued document.',
  );
  if (d.audience === 'client') {
    if (w.kind !== 'staff')
      assert(
        d.recipientId === w.scopeId,
        403,
        'AUDIENCE_FORBIDDEN',
        'Select the originating client account.',
      );
    const linked = doc.scheme_id
      ? await statement(
          env.DB,
          'SELECT id FROM scheme_client_links WHERE scheme_id=? AND client_id=? AND starts_at<=? AND (ends_at IS NULL OR ends_at>?)',
          doc.scheme_id,
          d.recipientId,
          now(),
          now(),
        ).first()
      : await statement(
          env.DB,
          'SELECT id FROM client_property_links WHERE property_id=? AND client_id=? AND starts_at<=? AND (ends_at IS NULL OR ends_at>?)',
          doc.property_id,
          d.recipientId,
          now(),
          now(),
        ).first();
    assert(linked, 422, 'AUDIENCE_CONTEXT', 'The client is not linked to the document context.');
  } else if (d.audience === 'tenancy') {
    assert(
      w.kind !== 'strata-manager' && doc.property_id && !doc.scheme_id,
      403,
      'TENANCY_PRIVACY',
      'Scheme management does not grant access to tenancy documents.',
    );
    assert(
      !doc.tenancy_id || doc.tenancy_id === d.recipientId,
      422,
      'TENANCY_MISMATCH',
      'A tenancy document cannot be reissued to another tenancy.',
    );
    const t = await statement(
      env.DB,
      'SELECT property_id FROM tenancies WHERE id=?',
      d.recipientId,
    ).first<{ property_id: string }>();
    assert(
      t?.property_id === doc.property_id,
      422,
      'TENANCY_MISMATCH',
      'The tenancy belongs to another property.',
    );
  } else
    assert(
      doc.scheme_id && d.recipientId === doc.scheme_id,
      422,
      'SCHEME_MISMATCH',
      'Choose the document scheme audience.',
    );
  const previousGrant = await statement(
    env.DB,
    'SELECT document_id FROM document_grants WHERE document_id=? AND recipient_kind=? AND recipient_id=?',
    id,
    d.audience,
    d.recipientId,
  ).first();
  if (previousGrant) return { id, status: doc.status, replayed: true };
  const time = now(),
    statements = [
      statement(
        env.DB,
        "UPDATE documents SET status='issued',issued_at=COALESCE(issued_at,?),tenancy_id=COALESCE(tenancy_id,?) WHERE id=? AND status IN('review','approved','issued') AND (tenancy_id IS NULL OR ? IS NULL OR tenancy_id=?)",
        time,
        d.audience === 'tenancy' ? d.recipientId : null,
        id,
        d.audience === 'tenancy' ? d.recipientId : null,
        d.audience === 'tenancy' ? d.recipientId : null,
      ),
      guard(env),
      statement(
        env.DB,
        'INSERT INTO document_grants(document_id,recipient_kind,recipient_id,created_by,created_at) VALUES(?,?,?,?,?)',
        id,
        d.audience,
        d.recipientId,
        user.id,
        time,
      ),
      activity(env, user, 'document.issued', 'document', id, doc.property_id, doc.scheme_id, {
        audience: d.audience,
        reviewReference: d.reviewReference,
      }),
      projection(env, 'document.issued', id, {
        documentId: id,
        propertyId: doc.property_id,
        schemeId: doc.scheme_id,
        status: 'issued',
      }),
    ];
  if (doc.previous_document_id && doc.status !== 'issued')
    statements.push(
      statement(
        env.DB,
        "UPDATE documents SET status='archived' WHERE id=? AND status='issued'",
        doc.previous_document_id,
      ),
      guard(env),
    );
  // Notifications contain no document body and no direct storage URL.
  const recipients =
    d.audience === 'client'
      ? (
          await statement(
            env.DB,
            'SELECT user_id FROM client_memberships WHERE client_id=? AND active=1',
            d.recipientId,
          ).all<{ user_id: string }>()
        ).results
      : d.audience === 'tenancy'
        ? (
            await statement(
              env.DB,
              'SELECT user_id FROM tenancy_memberships WHERE tenancy_id=? AND starts_at<=? AND (ends_at IS NULL OR ends_at>?)',
              d.recipientId,
              time,
              time,
            ).all<{ user_id: string }>()
          ).results
        : (
            await statement(
              env.DB,
              'SELECT user_id FROM scheme_memberships WHERE scheme_id=? AND role=? AND starts_at<=? AND (ends_at IS NULL OR ends_at>?)',
              d.recipientId,
              d.audience === 'scheme_council'
                ? 'council_member'
                : d.audience === 'scheme_owner'
                  ? 'owner'
                  : 'resident',
              time,
              time,
            ).all<{ user_id: string }>()
          ).results;
  for (const r of recipients.slice(0, 100))
    statements.push(
      statement(
        env.DB,
        'INSERT INTO notifications(id,user_id,title,message,href,created_at) VALUES(?,?,?,?,?,?)',
        uid('ntf'),
        r.user_id,
        'Document available',
        'A document has been issued to an authorised workspace.',
        '/workspaces',
        time,
      ),
    );
  statements.push(clearGuard(env));
  await env.DB.batch(statements);
  return { id, status: 'issued' };
}
export async function attachRequestFile(
  env: Env,
  user: Principal,
  w: Workspace,
  requestId: string,
  form: FormData,
) {
  const r = await requestAccess(env, user, w, requestId, true);
  const f = await boundedFile(form);
  const duplicate = await statement(
    env.DB,
    'SELECT id,status FROM request_attachments WHERE request_id=? AND sha256=?',
    requestId,
    f.hash,
  ).first();
  if (duplicate) return { ...duplicate, replayed: true };
  const id = uid('att'),
    key = `request-attachments/${id}`,
    time = now();
  await env.DOCUMENTS.put(key, f.bytes, { httpMetadata: { contentType: f.mime } });
  try {
    await env.DB.batch([
      statement(
        env.DB,
        "INSERT INTO request_attachments(id,request_id,uploaded_by,object_key,file_name,content_type,size,sha256,status,created_at) VALUES(?,?,?,?,?,?,?,?,'quarantined',?)",
        id,
        requestId,
        user.id,
        key,
        f.name,
        f.mime,
        f.file.size,
        f.hash,
        time,
      ),
      activity(
        env,
        user,
        'request.attachment_uploaded',
        'request',
        requestId,
        r.property_id,
        r.scheme_id,
      ),
    ]);
  } catch (error) {
    await env.DOCUMENTS.delete(key);
    throw error;
  }
  return { id, status: 'quarantined' };
}
export async function reviewAttachment(
  env: Env,
  user: Principal,
  w: Workspace,
  id: string,
  input: unknown,
) {
  assert(
    w.kind === 'staff',
    403,
    'STAFF_REQUIRED',
    'Attachment release requires operational review.',
  );
  operationsWrite(user);
  const d = z.object({ status: z.enum(['released', 'rejected']), reference }).parse(input);
  const a = await statement(env.DB, 'SELECT * FROM request_attachments WHERE id=?', id).first<
    Record<string, any>
  >();
  assert(a, 404, 'ATTACHMENT_NOT_FOUND', 'Attachment not found.');
  await requestAccess(env, user, w, a.request_id);
  await env.DB.batch([
    statement(
      env.DB,
      "UPDATE request_attachments SET status=?,review_reference=?,reviewed_by=? WHERE id=? AND status='quarantined'",
      d.status,
      d.reference,
      user.id,
      id,
    ),
    guard(env),
    activity(env, user, 'attachment.reviewed', 'request', a.request_id, null, null, {
      attachmentId: id,
      status: d.status,
    }),
    clearGuard(env),
  ]);
  return { id, status: d.status };
}
export async function downloadAttachment(env: Env, user: Principal, w: Workspace, id: string) {
  const a = await statement(env.DB, 'SELECT * FROM request_attachments WHERE id=?', id).first<
    Record<string, any>
  >();
  assert(a, 404, 'ATTACHMENT_NOT_FOUND', 'Attachment not found.');
  const r = await requestAccess(env, user, w, a.request_id);
  assert(
    a.status === 'released' ||
      a.uploaded_by === user.id ||
      (w.kind === 'staff' &&
        ['administrator', 'operations_manager'].includes(user.staffRole ?? '')),
    404,
    'ATTACHMENT_NOT_AVAILABLE',
    'Attachment is pending release or unavailable.',
  );
  const object = await env.DOCUMENTS.get(a.object_key);
  assert(object, 404, 'FILE_NOT_FOUND', 'File unavailable.');
  await activity(
    env,
    user,
    'attachment.downloaded',
    'request',
    a.request_id,
    r.property_id,
    r.scheme_id,
    { attachmentId: id },
  ).run();
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${a.file_name.replace(/["\\\r\n]/g, '_')}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
export async function requestDetail(env: Env, user: Principal, w: Workspace, id: string) {
  const r = await requestAccess(env, user, w, id);
  const comments = (
    await statement(
      env.DB,
      `SELECT c.id,c.body,c.audience,c.created_at FROM request_comments c WHERE c.request_id=? ${w.kind === 'staff' ? '' : "AND c.audience='requester'"} ORDER BY c.created_at`,
      id,
    ).all()
  ).results;
  const attachments = (
    await statement(
      env.DB,
      'SELECT id,file_name,content_type,size,status,uploaded_by,created_at FROM request_attachments WHERE request_id=? ORDER BY created_at',
      id,
    ).all<Record<string, any>>()
  ).results.map((a) => ({
    ...a,
    downloadAvailable:
      a.status === 'released' ||
      a.uploaded_by === user.id ||
      (w.kind === 'staff' &&
        ['administrator', 'operations_manager'].includes(user.staffRole ?? '')),
  }));
  return { request: r, comments, attachments };
}
export async function commentRequest(
  env: Env,
  user: Principal,
  w: Workspace,
  id: string,
  input: unknown,
) {
  const r = await requestAccess(env, user, w, id, true),
    d = z
      .object({
        body: z.string().trim().min(2).max(3000),
        audience: z.enum(['requester', 'staff']).default('requester'),
      })
      .parse(input);
  assert(
    d.audience !== 'staff' || w.kind === 'staff',
    403,
    'AUDIENCE_FORBIDDEN',
    'Only staff can write an internal note.',
  );
  await env.DB.batch([
    statement(
      env.DB,
      'INSERT INTO request_comments(id,request_id,author_id,body,audience,created_at) VALUES(?,?,?,?,?,?)',
      uid('comment'),
      id,
      user.id,
      d.body,
      d.audience,
      now(),
    ),
    activity(env, user, 'request.comment_added', 'request', id, r.property_id, r.scheme_id, {
      audience: d.audience,
    }),
  ]);
  return { ok: true };
}
export const DOCUMENT_PRODUCTS = {
  property_record: 'Property record / report request',
  tenancy_document: 'Residential tenancy document',
  commercial_document: 'Commercial property documentation',
  strata_document: 'Strata / building documentation',
};
export async function createDocumentRequest(
  env: Env,
  user: Principal,
  w: Workspace,
  input: unknown,
) {
  assert(booksServices(w), 403, 'CLIENT_REQUIRED', 'Use an authorised client workspace.');
  const d = z
    .object({
      propertyId: recordId,
      productCode: z.enum([
        'property_record',
        'tenancy_document',
        'commercial_document',
        'strata_document',
      ]),
      title: shortText,
      answers: z.object({
        purpose: z.string().trim().min(10).max(3000),
        instructions: z.string().max(3000).default(''),
      }),
    })
    .parse(input);
  const p = await propertyAccess(env, user, w, d.propertyId, true);
  if (d.productCode === 'tenancy_document')
    assert(
      p.sector === 'residential' && w.kind !== 'strata-manager',
      422,
      'PRODUCT_CONTEXT',
      'Use a residential management workspace.',
    );
  if (d.productCode === 'commercial_document')
    assert(p.sector === 'commercial', 422, 'PRODUCT_CONTEXT', 'Select a commercial property.');
  if (d.productCode === 'strata_document')
    assert(p.sector === 'strata-building', 422, 'PRODUCT_CONTEXT', 'Select a scheme building.');
  const id = uid('dr');
  await env.DB.batch([
    statement(
      env.DB,
      "INSERT INTO document_requests(id,client_id,property_id,requested_by,product_code,title,answers_envelope,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'submitted',?,?)",
      id,
      w.scopeId,
      p.id,
      user.id,
      d.productCode,
      d.title,
      await seal(env.DATA_ENCRYPTION_KEY, `document-request:${id}`, d.answers),
      now(),
      now(),
    ),
    activity(env, user, 'document_request.created', 'document_request', id, p.id),
    projection(env, 'document_request.created', id, { propertyId: p.id, status: 'submitted' }),
  ]);
  return { id };
}
export async function updateDocumentRequest(
  env: Env,
  user: Principal,
  w: Workspace,
  id: string,
  input: unknown,
) {
  const r = await statement(env.DB, 'SELECT * FROM document_requests WHERE id=?', id).first<
    Record<string, any>
  >();
  assert(r, 404, 'REQUEST_NOT_FOUND', 'Document request not found.');
  const d = z
    .object({
      version,
      status: z.enum([
        'under_review',
        'awaiting_information',
        'in_preparation',
        'review',
        'ready',
        'completed',
        'cancelled',
      ]),
      documentId: recordId.optional(),
    })
    .parse(input);
  if (w.kind === 'staff') operationsWrite(user);
  else {
    assert(
      w.scopeId === r.client_id && d.status === 'cancelled',
      403,
      'STAFF_REQUIRED',
      'Staff manages document preparation.',
    );
    await propertyAccess(env, user, w, r.property_id, true);
  }
  const next: Record<string, string[]> = {
    submitted: ['under_review', 'cancelled'],
    under_review: ['awaiting_information', 'in_preparation', 'cancelled'],
    awaiting_information: ['under_review', 'cancelled'],
    in_preparation: ['review', 'awaiting_information', 'cancelled'],
    review: ['ready', 'in_preparation', 'cancelled'],
    ready: ['completed', 'review'],
  };
  assert(
    r.version === d.version && next[r.status]?.includes(d.status),
    409,
    'REQUEST_CHANGED',
    'This document request has changed or the transition is unavailable.',
  );
  if (d.status === 'completed') {
    assert(d.documentId, 422, 'ISSUED_DOCUMENT_REQUIRED', 'Select the issued document.');
    assert(
      await statement(
        env.DB,
        "SELECT d.id FROM documents d JOIN document_grants g ON g.document_id=d.id WHERE d.id=? AND d.property_id=? AND d.status='issued' AND g.recipient_kind='client' AND g.recipient_id=?",
        d.documentId,
        r.property_id,
        r.client_id,
      ).first(),
      422,
      'DOCUMENT_AUDIENCE_MISMATCH',
      'The issued document must belong to this property and client.',
    );
  }
  await env.DB.batch([
    statement(
      env.DB,
      'UPDATE document_requests SET status=?,document_id=COALESCE(?,document_id),version=version+1,updated_at=? WHERE id=? AND version=?',
      d.status,
      d.documentId ?? null,
      now(),
      id,
      d.version,
    ),
    guard(env),
    activity(env, user, 'document_request.updated', 'document_request', id, r.property_id, null, {
      status: d.status,
    }),
    clearGuard(env),
  ]);
  return { id, status: d.status };
}
export async function pcrResponse(env: Env, user: Principal, w: Workspace, input: unknown) {
  assert(w.kind === 'tenant', 403, 'TENANT_REQUIRED', 'Use your Tenant workspace.');
  const d = z
    .object({
      documentId: recordId,
      response: z.string().trim().min(2).max(6000),
      acceptCondition: z.boolean(),
    })
    .parse(input);
  const doc = await statement(
    env.DB,
    'SELECT * FROM documents WHERE id=? AND tenancy_id=?',
    d.documentId,
    w.scopeId,
  ).first<Record<string, any>>();
  assert(
    doc &&
      doc.category === 'property_condition_report' &&
      (await documentAllowed(env, user, d.documentId)),
    404,
    'PCR_NOT_FOUND',
    'An issued PCR for this tenancy is required.',
  );
  const previous = await statement(
    env.DB,
    'SELECT id FROM pcr_responses WHERE document_id=? AND user_id=?',
    d.documentId,
    user.id,
  ).first();
  if (previous) return { ...previous, replayed: true };
  const id = uid('pcr');
  await env.DB.batch([
    statement(
      env.DB,
      "INSERT INTO pcr_responses(id,document_id,tenancy_id,user_id,response_envelope,status,created_at) VALUES(?,?,?,?,?,'submitted',?)",
      id,
      d.documentId,
      w.scopeId,
      user.id,
      await seal(env.DATA_ENCRYPTION_KEY, `pcr:${id}`, {
        response: d.response,
        acceptCondition: d.acceptCondition,
      }),
      now(),
    ),
    activity(env, user, 'pcr.response_submitted', 'pcr_response', id, doc.property_id),
  ]);
  return { id };
}

export async function documentRequestDetail(env: Env, user: Principal, w: Workspace, id: string) {
  const r = await statement(env.DB, 'SELECT * FROM document_requests WHERE id=?', id).first<
    Record<string, any>
  >();
  assert(r, 404, 'REQUEST_NOT_FOUND', 'Document request not found.');
  if (w.kind === 'staff') operationsWrite(user);
  else {
    assert(
      booksServices(w) && w.scopeId === r.client_id,
      404,
      'REQUEST_NOT_FOUND',
      'Document request not found.',
    );
    await propertyAccess(env, user, w, r.property_id);
  }
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    version: r.version,
    property_id: r.property_id,
    answers: await unseal(env.DATA_ENCRYPTION_KEY, `document-request:${id}`, r.answers_envelope),
  };
}
export async function provideDocumentInformation(
  env: Env,
  user: Principal,
  w: Workspace,
  id: string,
  input: unknown,
) {
  const r = await documentRequestDetail(env, user, w, id);
  const d = z.object({ version, instructions: z.string().trim().min(10).max(3000) }).parse(input);
  assert(
    w.kind !== 'staff' && r.status === 'awaiting_information' && r.version === d.version,
    409,
    'REQUEST_CHANGED',
    'This request is not awaiting your information.',
  );
  await propertyAccess(env, user, w, r.property_id, true);
  await env.DB.batch([
    statement(
      env.DB,
      "UPDATE document_requests SET answers_envelope=?,status='under_review',version=version+1,updated_at=? WHERE id=? AND version=?",
      await seal(env.DATA_ENCRYPTION_KEY, `document-request:${id}`, {
        ...(r.answers as object),
        instructions: d.instructions,
      }),
      now(),
      id,
      d.version,
    ),
    guard(env),
    activity(
      env,
      user,
      'document_request.information_supplied',
      'document_request',
      id,
      r.property_id,
    ),
    clearGuard(env),
  ]);
  return { ok: true };
}
export async function acknowledgePcr(env: Env, user: Principal, w: Workspace, id: string) {
  const r = await statement(
    env.DB,
    'SELECT r.*,t.property_id FROM pcr_responses r JOIN tenancies t ON t.id=r.tenancy_id WHERE r.id=?',
    id,
  ).first<Record<string, any>>();
  assert(r, 404, 'RESPONSE_NOT_FOUND', 'Response not found.');
  assert(
    booksServices(w) || w.kind === 'staff',
    403,
    'MANAGER_REQUIRED',
    'A current property manager must acknowledge this response.',
  );
  await propertyAccess(env, user, w, r.property_id, true);
  if (w.kind === 'staff') operationsWrite(user);
  await env.DB.batch([
    statement(
      env.DB,
      "UPDATE pcr_responses SET status='acknowledged',acknowledged_by=? WHERE id=? AND status='submitted'",
      user.id,
      id,
    ),
    guard(env),
    activity(env, user, 'pcr.response_acknowledged', 'pcr_response', id, r.property_id),
    clearGuard(env),
  ]);
  return { ok: true };
}
