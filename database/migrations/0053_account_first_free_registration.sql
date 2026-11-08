-- Stage 1: a verified free account is never an implicit paid subscription.
-- Preserve historic, approved all-inclusive entitlements to existing property
-- relationships at migration time only. New clients/properties are not free
-- all-inclusive beneficiaries. Do not mutate existing subscription rows.
CREATE TABLE legacy_included_property_grants (
  client_id TEXT NOT NULL REFERENCES clients(id),
  property_id TEXT NOT NULL REFERENCES properties(id),
  granted_at TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'migration_0053' CHECK(origin='migration_0053'),
  PRIMARY KEY(client_id,property_id)
) STRICT;
INSERT INTO legacy_included_property_grants(client_id,property_id,granted_at)
SELECT DISTINCT l.client_id,l.property_id,strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM client_property_links l
JOIN clients c ON c.id=l.client_id AND c.status='active'
JOIN subscriptions s ON s.client_id=c.id AND s.plan_code='all_inclusive' AND s.status='active'
WHERE l.role IN ('owner','landlord') AND l.ends_at IS NULL
  AND (l.starts_at IS NULL OR l.starts_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TRIGGER legacy_included_property_grants_no_update BEFORE UPDATE ON legacy_included_property_grants
BEGIN SELECT RAISE(ABORT,'LEGACY_GRANT_IMMUTABLE'); END;
CREATE TRIGGER legacy_included_property_grants_no_delete BEFORE DELETE ON legacy_included_property_grants
BEGIN SELECT RAISE(ABORT,'LEGACY_GRANT_REQUIRES_INDEPENDENT_APPROVAL'); END;

DROP TRIGGER IF EXISTS client_all_inclusive_subscription_insert;
DROP TRIGGER IF EXISTS client_all_inclusive_subscription_activation;

-- Account creation and intent to subscribe are independent of payment or cover.
CREATE TABLE account_subscription_preferences (
  client_id TEXT PRIMARY KEY REFERENCES clients(id),
  account_state TEXT NOT NULL DEFAULT 'registered'
    CHECK(account_state IN ('registered','verified','active')),
  subscription_intent TEXT NOT NULL DEFAULT 'none'
    CHECK(subscription_intent IN ('none','checkout_requested','subscribed','canceled')),
  updated_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER account_subscription_preferences_no_implicit_payment BEFORE INSERT ON account_subscription_preferences
WHEN NEW.subscription_intent NOT IN ('none','checkout_requested')
BEGIN SELECT RAISE(ABORT,'SUBSCRIPTION_REQUIRES_PROVIDER_EVENT'); END;

-- A new paid enrolment is an explicit intent, never generated at property creation.
CREATE INDEX account_subscription_intent_state ON account_subscription_preferences(subscription_intent,account_state);
