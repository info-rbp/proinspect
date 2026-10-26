import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rentRouteAllowed, rentMovementPermitted, requiresApprovalBeforeConnect,
  rentRouteDescription, RENT_ROUTE_POLICY_VERSION,
  type RentRoute, type ManagerMode,
} from '../packages/finance/rent-routing.ts';

test('agency rent cannot be diverted to a landlord direct account or Stripe Connect', () => {
  assert.equal(rentRouteAllowed('agency_managed','agency_trust_external'),true);
  assert.equal(rentRouteAllowed('agency_managed','landlord_direct_external'),false);
  assert.equal(rentRouteAllowed('agency_managed','landlord_connect_candidate'),false);
});
test('self-managed landlord routes never impersonate an agency trust account', () => {
  assert.equal(rentRouteAllowed('self_managed','agency_trust_external'),false);
  assert.equal(rentRouteAllowed('self_managed','landlord_direct_external'),true);
  assert.equal(rentRouteAllowed('self_managed','landlord_connect_candidate'),true);
});
test('every existing route and money action remains denied pending external approval', () => {
  const modes: ManagerMode[]=['self_managed','agency_managed'];
  const routes: RentRoute[]=['agency_trust_external','landlord_direct_external','landlord_connect_candidate'];
  assert.match(RENT_ROUTE_POLICY_VERSION,/WA_RENT/);
  for(const mode of modes)for(const route of routes){
    assert.equal(requiresApprovalBeforeConnect(mode,route),true);
    for(const action of ['charge','transfer','payout','refund'] as const)
      assert.equal(rentMovementPermitted(route,action),false);
    assert.match(rentRouteDescription(route),/ProInspect does not|no charge/i);
  }
});
