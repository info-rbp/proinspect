export interface Env {
  APP_ENV: 'local' | 'staging' | 'production';
  BUILD_SHA?: string;
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
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function assert(
  condition: unknown,
  status: number,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new AppError(status, code, message);
}
export function statement(db: D1Database, sql: string, ...values: (string | number | null)[]) {
  return db.prepare(sql).bind(...values);
}
export function now() {
  return new Date().toISOString();
}
export function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}
