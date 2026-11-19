/** Synthetic isolated Worker/D1 acceptance for free registration -> priced booking -> signed settlement.
 * No production API, mailbox, real Stripe checkout, customer funds or legal claim.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {registeredBookingJourney,secret} from './registered-booking-journey.mjs';

await build({entryPoints:['tests/runtime/entry.ts'],outfile:'artifacts/registered-booking-worker.mjs',
  bundle:true,format:'esm',platform:'browser',target:'es2022',
  external:['cloudflare:workers','node:*']});
const mf=new Miniflare({modules:true,scriptPath:'artifacts/registered-booking-worker.mjs',
  compatibilityDate:'2026-07-01',compatibilityFlags:['nodejs_compat'],
  d1Databases:{DB:'registered-booking-isolated'},
  r2Buckets:{DOCUMENTS:'registered-test-docs',RESTRICTED_DOCUMENTS:'registered-test-restricted'},
  durableObjects:{SCHEDULER:{className:'BookingScheduler',useSQLite:true}},
  bindings:{APP_ENV:'local',APP_ORIGIN:'http://localhost',DATA_ENCRYPTION_KEY:randomBytes(32).toString('base64'),
    EMAIL_PROVIDER:'local',STRIPE_WEBHOOK_SECRET:secret,OPERATIONS_EMAIL:'operator@example.invalid'}});
const db=await mf.getD1Database('DB');
try{
  for(const statement of JSON.parse(execFileSync('python3',['scripts/schema-statements.py'],
    {encoding:'utf8'})))await db.prepare(statement).run();
  await registeredBookingJourney({db,dispatchFetch:mf.dispatchFetch.bind(mf)});
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  console.log('PASS: synthetic owner booking, price, single payment obligation, scope denial, signed event and replay');
}finally{await mf.dispose();}
