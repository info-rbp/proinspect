-- Uploaded source masters are not approved for legal issuance merely by upload.
-- Require independent administrator release review and source-asset validation.
ALTER TABLE wa_residential_form_templates ADD COLUMN release_approved_at TEXT;
ALTER TABLE wa_residential_form_templates ADD COLUMN release_approved_by TEXT REFERENCES users(id);
ALTER TABLE wa_residential_form_templates ADD COLUMN release_review_reference TEXT;

-- Confidential WA Form 2 workflow follows RESIDENTIAL tenancy scope even
-- when its separate production feature switch is enabled.
CREATE TRIGGER wa_restricted_cases_residential_i BEFORE INSERT ON restricted_form_cases
BEGIN
 SELECT RAISE(ABORT,'RESTRICTED_FORM_RESIDENTIAL_ONLY')
 WHERE NOT EXISTS (
  SELECT 1 FROM tenancies t JOIN properties p ON p.id=t.property_id
  WHERE t.id=NEW.tenancy_id AND p.sector='residential'
 );
END;
