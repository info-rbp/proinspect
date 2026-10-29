export interface Env {
  BUILDING_OPERATIONS_ENABLED?: string;
  COMMERCIAL_OPERATIONS_ENABLED?: string;
  COUNCIL_GOVERNANCE_ENABLED?: string;
  NOTICE_LIFECYCLE_ENABLED?: string;
  AGENCY_OWNER_INVITATIONS_ENABLED?: string;
  LEGAL_ACCEPTANCE_ENABLED?: string;
  SERVICE_SALE_VARIANTS_ENABLED?: string;
  STRIPE_CUSTOMER_PORTAL_ENABLED?: string;
  STRIPE_BILLING_PORTAL_CONFIGURATION_ID?: string;
  STRIPE_INVOICING_ENABLED?: string;
  STRIPE_REFUNDS_ENABLED?: string;
  STRIPE_PAYMENTS_ENABLED?: string;
  PAYMENT_RECONCILIATION_ENABLED?: string;

  APP_ENV: 'local' | 'staging' | 'production';
  BUILD_SHA?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  REPORT_TOOL_ORIGIN?: string;
  REPORT_TOOL_SECRET?: string;
  SHEETS_WEBHOOK_URL?: string;
  SHEETS_WEBHOOK_SECRET?: string;
  OPEN_HOME_SHEET_SYNC_ENABLED?: string;
  OPEN_HOME_SHEET_API_SECRET?: string;
  OPEN_HOME_REPORTS_ENABLED?: string;
  OPEN_HOME_REPORT_EMAIL_PROVIDER?: 'cloudflare' | 'resend';
  EMAIL?: SendEmail;
  GOOGLE_CALENDAR_ENABLED?: string;
  GOOGLE_CALENDAR_BOOKINGS_ENABLED?: string;
  GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_CALENDAR_PRIVATE_KEY?: string;
  GOOGLE_CALENDAR_ID?: string;
  GOOGLE_CALENDAR_TIMEZONE?: string;
  RESTRICTED_WORKFLOWS_ENABLED?: string;
  WA_BONDS_ENABLED?: string;
  GUEST_BOOKINGS_ENABLED?: string;
  PCR_LAUNCH_ENABLED?: string;
  PCR_DISCOUNT_REDEMPTION_ENABLED?: string;
  PCR_SAMPLE_PUBLICATION_ENABLED?: string;
  PCR_SAMPLE_SHA256?: string;
  RENTAL_APPLICATIONS_ENABLED?: string;
  RENTAL_SCANNER_WEBHOOK_SECRET?: string;
  RENTAL_RETENTION_DRAFT_DAYS?: string;
  RENTAL_RETENTION_SUBMITTED_DAYS?: string;
  RENTAL_RETENTION_WITHDRAWN_DAYS?: string;
  RENTAL_RETENTION_AUTOPURGE_ENABLED?: string;
  ENQUIRY_GATEWAY_SECRET?: string;
  MARKETING_TURNSTILE_SECRET_KEY?: string;
  MARKETING_TURNSTILE_SITE_KEY?: string;
  APP_ORIGIN: string;
  MARKETING_ORIGIN?: string;
  DB: D1Database;
  DOCUMENTS: R2Bucket;
  RESTRICTED_DOCUMENTS: R2Bucket;
  SCHEDULER: DurableObjectNamespace;
  EVENTS: Queue<{ eventId: string }>;
  DATA_ENCRYPTION_KEY: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  EMAIL_PROVIDER?: 'resend' | 'local';
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  OPERATIONS_EMAIL?: string;
  EMAIL_SINK?: string;
  STRIPE_ACCOUNT_ID?: string;
  STRIPE_BILLING_ENABLED?: string;
  RESIDENTIAL_PAID_ONBOARDING_ENABLED?: string;
  RESIDENTIAL_LIVE_BILLING_ENABLED?: string;
  STRIPE_RESIDENTIAL_LIVE_ACCOUNT_ID?: string;
  STRIPE_RESIDENTIAL_LIVE_KEY?: string;
  STRIPE_RESIDENTIAL_LIVE_WEBHOOK_SECRET?: string;
  RESIDENTIAL_APPROVED_TAX_CODE?: string;
  RESIDENTIAL_PAYMENT_GRACE_HOURS?: string;
  STRIPE_GUEST_CHECKOUT_ENABLED?: string;
  STRIPE_TAX_READY?: string;
  CONTRACTOR_PAYMENTS_ENABLED?: string;
  STRIPE_CONNECT_MARKETPLACE_APPROVED?: string;
  STRIPE_CONNECT_COLLECTION_ENABLED?: string;
  STRIPE_CONNECT_TRANSFERS_ENABLED?: string;
  STRIPE_CONNECT_PLATFORM_WEBHOOK_SECRET?: string;
  STRIPE_CONNECT_RECIPIENT_WEBHOOK_SECRET?: string;
  RENTAL_SCANNER_ENABLED?: string;
  RENTAL_SCANNER_ENDPOINT?: string;
  RENTAL_SCANNER_ALLOWED_HOST?: string;
  RENTAL_SCANNER_OUTBOUND_SECRET?: string;
  RENTAL_APPS_SCRIPT_ENABLED?: string;
  RENTAL_APPS_SCRIPT_ENDPOINT?: string;
  RENTAL_APPS_SCRIPT_ALLOWED_HOST?: string;
  RENTAL_APPS_SCRIPT_SECRET?: string;
  RENT_PAYMENT_PLANNING_ENABLED?: string;
  RENT_CONNECT_SANDBOX_ENABLED?: string;
  WA_AGREEMENT_ESIGN_ENABLED?: string;
  REPORT_TOOL_V2_ORIGIN?: string;
  REPORT_TOOL_V2_HANDOFF_KEY?: string;
  REPORT_TOOL_V2_INGEST_TOKEN?: string;
  V4_SERVICE_REQUESTS_ENABLED?: string;
}
export interface CloudflareContext {
  cloudflare: { env: Env; ctx: ExecutionContext };
}
export function envFrom(context: unknown): Env {
  return (context as CloudflareContext).cloudflare.env;
}
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function assert(condition: unknown,status: number,code: string,message: string): asserts condition {
  if (!condition) throw new AppError(status, code, message);
}
export function statement(db: D1Database, sql: string, ...values: (string | number | null)[]) {
  return db.prepare(sql).bind(...values);
}
export function now() { return new Date().toISOString(); }
export function uid(prefix: string) { return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`; }
