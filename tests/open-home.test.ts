import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  openHomeCheckInInput,isOpenHomeCheckInAvailable,openHomeCheckInUrl,CHECK_IN_CONSENT_VERSION,
} from '../packages/marketing/open-home.ts';
import {
  perthDay,isPerthNineAm,previousPerthDayWindow,formatPerthReportTime,
} from '../packages/marketing/open-home-report.ts';
import { isMarketingStylePath,isPublicSitePath } from '../apps/platform/app/lib/public-routes.ts';

test('public check-in requires validated property, session, name, email, phone and event consent',()=>{
 const input={requestKey:'10000000-0000-4000-8000-000000000001',
  listingId:'lst_123',sessionId:'lsn_123',name:'Example Visitor',
  email:'Example@EXAMPLE.test',phone:'+61 412 345 678',consent:true,source:'qr'};
 const ok=openHomeCheckInInput.safeParse(input);
 assert.equal(ok.success,true);
 if(ok.success)assert.equal(ok.data.email,'example@example.test');
 assert.equal(openHomeCheckInInput.safeParse({...input,consent:false}).success,false);
 assert.equal(openHomeCheckInInput.safeParse({...input,phone:'<script>'}).success,false);
 assert.equal(openHomeCheckInInput.safeParse({...input,email:'invalid'}).success,false);
 assert.equal(openHomeCheckInInput.safeParse({...input,sessionId:''}).success,false);
});
test('on-site check-in opens 30 minutes early and closes 45 minutes after the session',()=>{
 const session={starts_at:'2026-10-21T05:00:00.000Z',ends_at:'2026-10-21T05:30:00.000Z'};
 const at=(x:string)=>new Date('2026-10-21T'+x+':00.000Z');
 assert.equal(isOpenHomeCheckInAvailable(session,at('04:29')),false);
 assert.equal(isOpenHomeCheckInAvailable(session,at('04:30')),true);
 assert.equal(isOpenHomeCheckInAvailable(session,at('05:10')),true);
 assert.equal(isOpenHomeCheckInAvailable(session,at('06:15')),true);
 assert.equal(isOpenHomeCheckInAvailable(session,at('06:16')),false);
});
test('QR links contain only existing listing and session identifiers',()=>{
 const url=new URL(openHomeCheckInUrl('https://proinspect.systems','lst_123','lsn_123'));
 assert.equal(url.pathname,'/open-home/check-in');
 assert.equal(url.searchParams.get('property'),'lst_123');
 assert.equal(url.searchParams.get('session'),'lsn_123');
 assert.equal(url.searchParams.get('email'),null);
 assert.equal(isPublicSitePath(url.pathname),false);
 assert.equal(isMarketingStylePath(url.pathname),true);
});
test('public attendance records remain in Cloudflare D1 with no Apps Script or Sheets integration',()=>{
 assert.equal(CHECK_IN_CONSENT_VERSION,'open-home-attendance-v1');
 const server=readFileSync('apps/platform/worker/features/open-home.server.ts','utf8');
 const api=readFileSync('apps/platform/worker/api.ts','utf8');
 const sql=readFileSync('database/migrations/0010_open_home_checkins.sql','utf8');
 assert.match(server,/INSERT INTO leasing_checkins/);
 assert.doesNotMatch(server,/INSERT INTO open_home_sheet_events/);
 assert.doesNotMatch(api,/api\/integrations\/open-home-sheet/);
 assert.match(server,/leasing_sessions s JOIN leasing_listings l/);
 assert.match(server,/registered_lead_id/);
 assert.match(sql,/OPEN_HOME_SESSION_NOT_LINKED/);
 assert.match(sql,/OPEN_HOME_LEAD_NOT_LINKED/);
 assert.match(sql,/UNIQUE\(session_id,attendee_hash\)/);
});
test('Cloudflare reports run at exactly 09:00 Australia/Perth (01:00 UTC), including month boundaries',()=>{
 assert.equal(isPerthNineAm(Date.parse('2026-10-22T00:59:00Z')),false);
 assert.equal(isPerthNineAm(Date.parse('2026-10-22T01:00:00Z')),true);
 assert.equal(isPerthNineAm(Date.parse('2026-10-22T01:01:00Z')),false);
 assert.equal(isPerthNineAm(Date.parse('2026-12-31T01:00:00Z')),true);
 assert.equal(perthDay('2026-10-21T23:59:00+08:00'),'2026-10-21');
 assert.equal(perthDay('2026-10-22T00:01:00+08:00'),'2026-10-22');
 assert.deepEqual(previousPerthDayWindow(Date.parse('2026-10-22T01:00:00Z')),{
  reportDatePerth:'2026-10-21',
  startUtc:'2026-10-20T16:00:00.000Z',
  endUtc:'2026-10-21T16:00:00.000Z',
 });
 assert.deepEqual(previousPerthDayWindow(Date.parse('2027-01-01T01:00:00Z')),{
  reportDatePerth:'2026-12-31',
  startUtc:'2026-12-30T16:00:00.000Z',
  endUtc:'2026-12-31T16:00:00.000Z',
 });
 assert.match(formatPerthReportTime('2026-10-21T05:00:00Z'),/1:00/);
});
test('next-day report dispatch and Resend email are fail-closed with scoped client recipients',()=>{
 const wrangler=JSON.parse(readFileSync('apps/platform/wrangler.jsonc','utf8'));
 assert.ok(wrangler.triggers.crons.includes('0 1 * * *'));
 assert.ok(wrangler.env.connected.triggers.crons.includes('0 1 * * *'));
 assert.equal(wrangler.vars.OPEN_HOME_REPORTS_ENABLED,'false');
 assert.equal(wrangler.env.connected.vars.OPEN_HOME_REPORTS_ENABLED,'false');
 assert.equal(wrangler.vars.OPEN_HOME_REPORT_EMAIL_PROVIDER,'resend');
 assert.equal(wrangler.env.connected.vars.OPEN_HOME_REPORT_EMAIL_PROVIDER,'resend');
 assert.equal(wrangler.env.connected.vars.EMAIL_PROVIDER,'resend');
 assert.equal(wrangler.env.connected.vars.EMAIL_FROM,'info@proinspect.systems');
 assert.equal(JSON.parse(readFileSync('config/environment.json','utf8')).variables.OPEN_HOME_REPORT_EMAIL_PROVIDER.default,'resend');
 const worker=readFileSync('apps/platform/worker/app.ts','utf8');
 const report=readFileSync('apps/platform/worker/features/open-home-reports.server.ts','utf8');
 const mail=readFileSync('packages/notifications/server.ts','utf8');
 assert.match(worker,/_event\.cron === '0 1 \* \* \*'/);
 assert.match(report,/OPEN_HOME_REPORTS_ENABLED/);
 assert.match(report,/verified_at IS NOT NULL/);
 assert.match(report,/open_home_inspection_reports/);
 assert.match(report,/session\.ends_at/);
 assert.match(mail,/REPORT_RECIPIENT_SUPPRESSED/);
 assert.match(mail,/https:\/\/api\.resend\.com\/emails/);
 assert.match(mail,/Idempotency-Key/);
 assert.match(mail,/RESEND_API_KEY/);
 assert.match(mail,/OPEN_HOME_REPORT_EMAIL_PROVIDER/);
 assert.match(mail,/reportAccess/);
});
