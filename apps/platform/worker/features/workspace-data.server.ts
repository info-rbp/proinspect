import { noticeAudienceSql } from '../../../../packages/notifications/notice-policy';
import { documentScope } from '../../../../packages/authorization/document-scope';
import { statement, now, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import {
  propertiesFor,
  propertyScope,
  schemesFor,
  managesProperty,
  booksServices,
} from '../../../../packages/authorization/server';
import { catalogue } from '../services.server';
export async function expandedWorkspaceData(env: Env, user: Principal, w: Workspace) {
  const properties = await propertiesFor(env, user, w),
    schemes = await schemesFor(env, user, w),
    scope = propertyScope(user, w);
  const propertyTotal =
    (
      await statement(
        env.DB,
        `SELECT COUNT(*) AS total FROM properties p WHERE p.archived_at IS NULL AND (${scope.sql})`,
        ...scope.values,
      ).first<{ total: number }>()
    )?.total ?? 0;
  const propertyFilter = (alias: string) =>
    `EXISTS(SELECT 1 FROM properties p WHERE p.id=${alias}.property_id AND (${scope.sql}))`;
  const schemeFilter = (alias: string) =>
    `EXISTS(SELECT 1 FROM scheme_client_links l WHERE l.scheme_id=${alias}.scheme_id AND l.client_id=? AND l.starts_at<=? AND (l.ends_at IS NULL OR l.ends_at>?))`;
  let orderSql = '0=1',
    orderArgs: string[] = [];
  if (w.kind === 'staff') {
    orderSql = user.staffRole === 'inspector' ? 'wo.assigned_staff_id=?' : '1=1';
    orderArgs = user.staffRole === 'inspector' ? [user.id] : [];
  } else if (managesProperty(w)) {
    orderSql = `wo.client_id=? AND ${propertyFilter('wo')}`;
    orderArgs = [w.scopeId, ...scope.values];
  } else if (w.kind === 'strata-manager') {
    orderSql = schemeFilter('wo');
    orderArgs = [w.scopeId, now(), now()];
  } else if (w.kind === 'council') {
    orderSql = 'wo.scheme_id=?';
    orderArgs = [w.scopeId];
  } else if (w.kind === 'building') {
    orderSql = 'wo.scheme_id=? AND wo.resident_visible=1';
    orderArgs = [w.scopeId];
  }
  const resident = w.kind === 'building';
  const orders = (
    await statement(
      env.DB,
      `SELECT wo.id,wo.reference,wo.property_id,wo.scheme_id,wo.booking_id,wo.request_id,wo.contractor_id,${resident ? 'wo.public_summary' : 'wo.title'} AS title,wo.status,wo.priority,${resident ? 'NULL' : 'wo.assigned_staff_id'} AS assigned_staff_id,wo.version,wo.created_at,wo.updated_at,wo.scheduled_at,wo.resident_visible,wo.public_summary,p.address,p.suburb FROM work_orders wo LEFT JOIN properties p ON p.id=wo.property_id WHERE ${orderSql} ORDER BY wo.updated_at DESC LIMIT 300`,
      ...orderArgs,
    ).all()
  ).results;
  const bookings =
    booksServices(w) || w.kind === 'staff'
      ? (
          await statement(
            env.DB,
            `SELECT b.id,b.reference,b.property_id,b.starts_at,b.ends_at,b.status,b.price_ex_gst_cents,b.version,s.name AS service_name,p.address FROM bookings b JOIN work_orders wo ON wo.booking_id=b.id JOIN services s ON s.id=b.service_id JOIN properties p ON p.id=b.property_id WHERE ${orderSql} ORDER BY b.starts_at DESC LIMIT 300`,
            ...orderArgs,
          ).all()
        ).results
      : [];
  let reqSql = '0=1',
    reqArgs: string[] = [];
  if (w.kind === 'staff') {
    reqSql =
      user.staffRole === 'inspector'
        ? 'EXISTS(SELECT 1 FROM work_orders wo WHERE wo.request_id=r.id AND wo.assigned_staff_id=?)'
        : '1=1';
    reqArgs = user.staffRole === 'inspector' ? [user.id] : [];
  } else if (w.kind === 'tenant') {
    reqSql = 'r.tenancy_id=? AND r.created_by=?';
    reqArgs = [w.scopeId, user.id];
  } else if (w.kind === 'building') {
    reqSql = 'r.scheme_id=? AND r.created_by=?';
    reqArgs = [w.scopeId, user.id];
  } else if (w.kind === 'council') {
    reqSql = "r.scheme_id=? AND r.source='building' AND r.category!='complaint'";
    reqArgs = [w.scopeId];
  } else if (w.kind === 'strata-manager') {
    reqSql = schemeFilter('r');
    reqArgs = [w.scopeId, now(), now()];
  } else {
    reqSql = `r.client_id=? AND ${propertyFilter('r')} AND (r.source='client' OR r.category IN('maintenance','inspection_access'))`;
    reqArgs = [w.scopeId, ...scope.values];
  }
  const requests = (
    await statement(
      env.DB,
      `SELECT r.id,r.reference,r.property_id,r.scheme_id,r.title,${w.kind === 'council' ? "''" : 'r.details'} AS details,r.category,r.priority,r.status,r.version,r.created_at,r.updated_at FROM requests r WHERE ${reqSql} ORDER BY r.updated_at DESC LIMIT 300`,
      ...reqArgs,
    ).all()
  ).results;
  const tenancies =
    w.kind === 'tenant'
      ? (
          await statement(
            env.DB,
            'SELECT t.*,p.address FROM tenancies t JOIN properties p ON p.id=t.property_id WHERE t.id=?',
            w.scopeId,
          ).all()
        ).results
      : managesProperty(w) || (w.kind === 'staff' && user.staffRole !== 'inspector')
        ? (
            await statement(
              env.DB,
              `SELECT t.*,p.address FROM tenancies t JOIN properties p ON p.id=t.property_id WHERE ${scope.sql} ORDER BY t.starts_at DESC LIMIT 300`,
              ...scope.values,
            ).all()
          ).results
        : [];
  const inspections =
    w.kind === 'tenant'
      ? (
          await statement(
            env.DB,
            'SELECT b.id,b.starts_at,b.ends_at,b.status,s.name AS service_name,ti.notice_reference FROM tenant_inspections ti JOIN bookings b ON b.id=ti.booking_id JOIN services s ON s.id=b.service_id WHERE ti.tenancy_id=? ORDER BY b.starts_at DESC',
            w.scopeId,
          ).all()
        ).results
      : [];
  const docScope = documentScope(user, w);
  const candidates = (
    await statement(
      env.DB,
      `SELECT d.id,d.property_id,d.scheme_id,d.tenancy_id,d.title,d.category,d.size,d.version,d.status,d.created_at,d.issued_at,d.previous_document_id,d.created_by,d.uploaded_client_id,p.address FROM documents d LEFT JOIN properties p ON p.id=d.property_id WHERE ${docScope.sql} ORDER BY d.created_at DESC LIMIT 300`,
      ...docScope.values,
    ).all<Record<string, any>>()
  ).results;
  const documents = candidates;
  const staff =
    w.kind === 'staff' && user.staffRole !== 'inspector'
      ? (
          await statement(
            env.DB,
            "SELECT u.id,u.display_name,u.email FROM staff_profiles sp JOIN users u ON u.id=sp.user_id WHERE sp.active=1 AND sp.role!='read_only' AND u.active=1",
          ).all()
        ).results
      : [];
  const financial =
    booksServices(w) ||
    w.kind === 'council' ||
    (w.kind === 'staff' && user.staffRole !== 'inspector');
  const approvals = financial
    ? (
        await statement(
          env.DB,
          `SELECT a.*,wo.property_id,wo.title AS work_title FROM approvals a JOIN work_orders wo ON wo.id=a.work_order_id WHERE ${orderSql} ${w.kind === 'council' ? "AND a.decision_scope='council'" : ''} ORDER BY a.created_at DESC LIMIT 200`,
          ...orderArgs,
        ).all<Record<string, any>>()
      ).results
    : [];
  const payments =
    financial && w.kind !== 'council'
      ? (
          await statement(
            env.DB,
            `SELECT p.* FROM payments p JOIN work_orders wo ON wo.id=p.work_order_id WHERE ${orderSql} ORDER BY p.created_at DESC LIMIT 200`,
            ...orderArgs,
          ).all()
        ).results
      : [];
  const plans = managesProperty(w)
    ? (
        await statement(
          env.DB,
          `SELECT r.*,p.address,s.name AS service_name FROM recurring_plans r JOIN properties p ON p.id=r.property_id JOIN services s ON s.id=r.service_id WHERE r.client_id=? AND (${scope.sql}) ORDER BY r.next_due LIMIT 300`,
          w.scopeId,
          ...scope.values,
        ).all()
      ).results
    : [];
  const documentRequests = booksServices(w)
    ? (
        await statement(
          env.DB,
          `SELECT r.id,r.client_id,r.property_id,r.product_code,r.title,r.status,r.document_id,r.version,r.created_at FROM document_requests r WHERE r.client_id=? AND ${propertyFilter('r')} ORDER BY r.created_at DESC LIMIT 200`,
          w.scopeId,
          ...scope.values,
        ).all()
      ).results
    : w.kind === 'staff' && user.staffRole !== 'inspector'
      ? (
          await statement(
            env.DB,
            'SELECT id,client_id,property_id,product_code,title,status,document_id,version,created_at FROM document_requests ORDER BY created_at DESC LIMIT 200',
          ).all()
        ).results
      : [];
  const notifications = (
    await statement(
      env.DB,
      `SELECT id,title,message,href,created_at,read_at FROM notifications WHERE user_id=? AND (workspace_kind IS NULL OR (workspace_kind=? AND scope_id=?)) AND (source_notice_id IS NULL OR EXISTS(SELECT 1 FROM building_notices n WHERE n.id=source_notice_id AND n.version=source_notice_version AND n.withdrawn_at IS NULL AND n.starts_at<=? AND (n.expires_at IS NULL OR n.expires_at>?) AND EXISTS(SELECT 1 FROM scheme_memberships m LEFT JOIN strata_lots l ON l.id=m.lot_id WHERE m.scheme_id=n.scheme_id AND m.user_id=notifications.user_id AND m.starts_at<=? AND (m.ends_at IS NULL OR m.ends_at>?) AND (${noticeAudienceSql(w.kind === 'council' ? 'council' : 'building')}) AND (n.lot_id IS NULL OR n.lot_id=m.lot_id) AND (n.building_id IS NULL OR n.building_id=l.building_id)))) ORDER BY created_at DESC LIMIT 50`,
      user.id,
      w.kind,
      w.scopeId,
      now(),
      now(),
      now(),
      now(),
    ).all()
  ).results;
  const contractors =
    w.kind === 'staff' && ['administrator', 'operations_manager'].includes(user.staffRole ?? '')
      ? (
          await statement(
            env.DB,
            'SELECT id,name FROM contractors WHERE active=1 ORDER BY name LIMIT 300',
          ).all()
        ).results
      : [];
  return {
    contractors,
    user,
    workspace: w,
    properties,
    propertyTotal,
    schemes,
    bookings,
    workOrders: orders,
    requests,
    documents,
    tenancies,
    inspections,
    notifications,
    staff,
    services: await catalogue(env),
    approvals,
    payments,
    plans,
    documentRequests,
    restrictedEnabled: env.RESTRICTED_WORKFLOWS_ENABLED === 'true',
  };
}
