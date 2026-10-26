import {test} from 'node:test';import assert from 'node:assert/strict';
import {sandboxConnectEnabled,eligibleSelfManagedRoute,directChargePermission,connectAccountStatus} from '../packages/finance/connect-policy.ts';
test('sandbox only with explicit feature flag and test key',()=>{
 for(const APP_ENV of ['production','local'])assert.equal(sandboxConnectEnabled({APP_ENV,RENT_CONNECT_SANDBOX_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_mock'}),false);
 assert.equal(sandboxConnectEnabled({APP_ENV:'staging',RENT_CONNECT_SANDBOX_ENABLED:'true',STRIPE_SECRET_KEY:'sk_live_mock'}),false);
 assert.equal(sandboxConnectEnabled({APP_ENV:'staging',RENT_CONNECT_SANDBOX_ENABLED:'false',STRIPE_SECRET_KEY:'sk_test_mock'}),false);
 assert.equal(sandboxConnectEnabled({APP_ENV:'staging',RENT_CONNECT_SANDBOX_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_mock'}),true);
});
test('landlord-only route and never agency trust',()=>{
 for(const mode of ['agency_managed','self_managed'])for(const kind of ['landlord','property-manager','tenant','staff'])
 for(const role of ['owner','admin','viewer'])assert.equal(eligibleSelfManagedRoute(mode,'landlord_connect_candidate',kind,role),mode==='self_managed'&&kind==='landlord'&&role!=='viewer');
});
test('provider readiness does not imply lawful rent collection',()=>{
 assert.equal(directChargePermission({APP_ENV:'staging'}),false);
 assert.equal(connectAccountStatus(true,true,true),'provider_ready_not_approved_for_rent');
});
