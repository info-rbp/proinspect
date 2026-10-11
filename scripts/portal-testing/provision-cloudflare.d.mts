/** Public type surface for the one-time Node ESM Cloudflare D1 maintenance script. */
export const TARGET_WORKER: string;
export const TARGET_DATABASE: string;
export const EXPECTED_EMAIL_PORTALS: Readonly<Record<string,string>>;
export const TEMP_WRANGLER: string;
export function cloudflareCredentials(env: Record<string,string | undefined>): { accountId: string; token: string };
export function resolveLiveDatabase(settings: any, database: any): string;
export function wranglerConfig(dbId: string): {
  name: string;
  compatibility_date: string;
  d1_databases: Array<{binding:string; database_name:string; database_id:string; migrations_dir:string}>;
};
export function validateExistingTables(names: string[]): boolean;
export function verifyPortals(rows: Array<{
  email: string;
  expected_portal: string;
  portal_status: string;
  sign_in_status: string;
}>): {count:number; verified:number};
export function livePreflight(env?: Record<string,string|undefined>, fetcher?: typeof fetch): Promise<{databaseId:string}>;
export function liveVerify(env?: Record<string,string|undefined>, fetcher?: typeof fetch): Promise<{count:number; verified:number}>;