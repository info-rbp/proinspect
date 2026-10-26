-- Sandbox connected-account references are not authority to collect rent or release bonds.
CREATE TABLE rent_connect_sandbox_accounts (
 id TEXT PRIMARY KEY,
 plan_id TEXT NOT NULL UNIQUE REFERENCES rent_route_plans(id),
 account_id TEXT NOT NULL UNIQUE CHECK(account_id LIKE 'acct_%'),
 environment TEXT NOT NULL CHECK(environment='sandbox'),
 status TEXT NOT NULL DEFAULT 'onboarding_required' CHECK(status IN('onboarding_required','provider_requirements_pending','provider_ready_not_approved_for_rent')),
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER rent_connect_self_managed_only BEFORE INSERT ON rent_connect_sandbox_accounts
 WHEN NOT EXISTS(SELECT 1 FROM rent_route_plans p WHERE p.id=NEW.plan_id
 AND p.manager_mode='self_managed' AND p.route='landlord_connect_candidate')
 BEGIN SELECT RAISE(ABORT,'RENT_CONNECT_NOT_SELF_MANAGED'); END;
CREATE TRIGGER rent_connect_no_identity_edits BEFORE UPDATE OF plan_id,account_id,environment,created_by,created_at ON rent_connect_sandbox_accounts
 BEGIN SELECT RAISE(ABORT,'RENT_CONNECT_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER rent_connect_no_delete BEFORE DELETE ON rent_connect_sandbox_accounts
 BEGIN SELECT RAISE(ABORT,'RENT_CONNECT_NO_DELETE'); END;
