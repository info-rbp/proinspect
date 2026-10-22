import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isMarketingStylePath,shouldIndexPublicPage} from '../apps/platform/app/lib/public-routes.ts';
test('guest journeys share the marketing header without becoming indexable',()=>{
 for(const path of ['/guest/book','/guest/book/routine-inspection','/guest/verify','/guest/quote','/guest/manage']){
  assert.equal(isMarketingStylePath(path),true,path);
  assert.equal(shouldIndexPublicPage(path,'https://proinspect.systems','production'),false,path);
 }
 assert.equal(isMarketingStylePath('/w/staff/operations'),false);
});
test('guest request flag is enforced and production canonical origin agrees',()=>{
 const config=JSON.parse(readFileSync('apps/platform/wrangler.jsonc','utf8'));
 for(const key of ['APP_ORIGIN','MARKETING_ORIGIN','PLATFORM_ORIGIN'])assert.equal(config.env.connected.vars[key],'https://proinspect.systems');
 assert.match(readFileSync('apps/platform/worker/features/guest.server.ts','utf8'),/GUEST_BOOKINGS_ENABLED==='true'/);
});
