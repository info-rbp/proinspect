export interface Env {
  APP_ENV: 'local' | 'staging' | 'production';
  BUILD_SHA?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  REPORT_TOOL_ORIGIN?: string;
  REPORT_TOOL_SECRET?: string;
  SHEETS_WEBHOOK_URL?: string;
  SHEETS_WEBHOOK_SECRET?: string;
  GOOGLE_CALENDAR_ENABLED?: string;
  GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_CALENDAR_PRIVATE_KEY?: string;
  GOOGLE_CALENDAR_ID?: string;
  GOOGLE_CALENDAR_TIMEZONE?: string;
  RESTRICTED_WORKFLOWS_ENABLED?: string;
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
}
export interface CloudflareContext {
  cloudflare: { env: Env; ctx: ExecutionContext };
}
export function envFrom(context: unknown): Env {
  return (context as CloudflareContext).cloudflare.env;
}
export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function assert(condition: unknown,status: number,code: string,message: string): asserts condition {
  if (!condition) throw new AppError(status, code, message);
}
export function statement(db: D1Database, sql: string, ...values: (string | number | null)[]) {
  return db.prepare(sql).bind(...values);
}
export function now() { return new Date().toISOString(); }
export function uid(prefix: string) { return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`; }
