-- Working all-inclusive plan: every active customer account starts with one
-- subscription. It does NOT expand user roles, property ownership or portal access.
-- Inactive clients remain ineligible, and existing subscription states are
-- preserved (in particular, do not silently reactivate paused subscriptions).
-- A missing allowance is never interpreted as free.
CREATE TRIGGER client_all_inclusive_subscription_insert
AFTER INSERT ON clients
WHEN NEW.status='active' AND NOT EXISTS(
  SELECT 1 FROM subscriptions WHERE client_id=NEW.id
)
BEGIN
  INSERT INTO subscriptions(
    id,client_id,property_id,plan_code,status,allowance_json,created_at
  ) VALUES(
    'sub_inclusive_'||NEW.id,NEW.id,NULL,'all_inclusive','active',
    '{"includedServiceIds":["*"]}',NEW.created_at
  );
END;

CREATE TRIGGER client_all_inclusive_subscription_activation
AFTER UPDATE OF status ON clients
WHEN NEW.status='active' AND OLD.status!='active' AND NOT EXISTS(
  SELECT 1 FROM subscriptions WHERE client_id=NEW.id
)
BEGIN
  INSERT INTO subscriptions(
    id,client_id,property_id,plan_code,status,allowance_json,created_at
  ) VALUES(
    'sub_inclusive_'||NEW.id,NEW.id,NULL,'all_inclusive','active',
    '{"includedServiceIds":["*"]}',strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );
END;

-- Backfill clients created before this policy. Never overwrite existing plans.
INSERT INTO subscriptions(
  id,client_id,property_id,plan_code,status,allowance_json,created_at
)
SELECT
  'sub_inclusive_'||c.id,c.id,NULL,'all_inclusive','active',
  '{"includedServiceIds":["*"]}',c.created_at
FROM clients c
WHERE c.status='active'
  AND NOT EXISTS(SELECT 1 FROM subscriptions s WHERE s.client_id=c.id);
