import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  openHomeCheckInInput,isOpenHomeCheckInAvailable,openHomeCheckInUrl,
  OPEN_HOME_SHEET_COLUMNS,CHECK_IN_CONSENT_VERSION,
} from '../packages/marketing/open-home.ts';
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
test('Google Sheet synchronization is optional, versioned and records explicit consent',()=>{
 assert.equal(CHECK_IN_CONSENT_VERSION,'open-home-attendance-v1');
 assert.deepEqual(OPEN_HOME_SHEET_COLUMNS.slice(7,10),['Name','Phone','Email']);
 assert.equal(OPEN_HOME_SHEET_COLUMNS.at(-1),'Sync event ID');
 const server=readFileSync('apps/platform/worker/features/open-home-sheet.server.ts','utf8');
 const code=readFileSync('integrations/open-home-sheet/Code.gs','utf8');
 const wrangler=JSON.parse(readFileSync('apps/platform/wrangler.jsonc','utf8'));
 assert.match(server,/authenticateOpenHomeSheetRequest/);
 assert.match(server,/crypto\.subtle\.verify/);
 assert.match(server,/OPEN_HOME_SHEET_SYNC_ENABLED/);
 assert.match(code,/LockService\.getScriptLock/);
 assert.match(code,/storedEventIds_/);
 assert.match(code,/safeSheetCell_/);
 assert.equal(wrangler.env.connected.vars.OPEN_HOME_SHEET_SYNC_ENABLED,'false');
});
test('visitor data never writes directly to Google Sheets on a public form submission',()=>{
 const server=readFileSync('apps/platform/worker/features/open-home.server.ts','utf8');
 const sql=readFileSync('database/migrations/0010_open_home_checkins.sql','utf8');
 assert.match(server,/contact_envelope/);
 assert.match(server,/INSERT INTO open_home_sheet_events/);
 assert.match(server,/leasing_sessions s JOIN leasing_listings l/);
 assert.match(server,/registered_lead_id/);
 assert.match(sql,/OPEN_HOME_SESSION_NOT_LINKED/);
 assert.match(sql,/OPEN_HOME_LEAD_NOT_LINKED/);
 assert.match(sql,/UNIQUE\(session_id,email_hash\)/);
});
