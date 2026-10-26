CREATE TABLE agency_owner_invitations (
 id TEXT PRIMARY KEY,agency_client_id TEXT NOT NULL REFERENCES clients(id),property_id TEXT NOT NULL REFERENCES properties(id),
 management_id TEXT NOT NULL REFERENCES property_management_relationships(id),token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
 email_hash TEXT NOT NULL,recipient_envelope TEXT NOT NULL,authority_reference TEXT NOT NULL,
 allow_inspections INTEGER NOT NULL CHECK(allow_inspections IN(0,1)),allow_reports INTEGER NOT NULL CHECK(allow_reports IN(0,1)),
 invited_by TEXT NOT NULL REFERENCES users(id),expires_at TEXT NOT NULL,created_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','claimed','approved','revoked')),
 claimed_by TEXT REFERENCES users(id),claimed_at TEXT,grant_id TEXT UNIQUE REFERENCES agency_owner_grants(id),
 reviewed_by TEXT REFERENCES users(id),reviewed_at TEXT
) STRICT;
CREATE INDEX agency_invitations_queue ON agency_owner_invitations(agency_client_id,status,expires_at);
CREATE TRIGGER owner_invitation_scope BEFORE INSERT ON agency_owner_invitations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM property_management_relationships m JOIN clients c ON c.id=m.manager_client_id AND c.client_type='agency' AND c.status='active' JOIN client_entitlements e ON e.client_id=c.id AND e.workspace_kind='property-manager' AND e.active=1 AND e.approved_by IS NOT NULL WHERE m.id=NEW.management_id AND m.property_id=NEW.property_id AND m.manager_client_id=NEW.agency_client_id AND m.mode='agency_managed' AND m.starts_at<=NEW.created_at AND (m.ends_at IS NULL OR m.ends_at>NEW.created_at)) THEN RAISE(ABORT,'AGENCY_INVITATION_SCOPE') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM agency_owner_invitations i WHERE i.agency_client_id=NEW.agency_client_id AND i.property_id=NEW.property_id AND i.email_hash=NEW.email_hash AND i.status IN('pending','claimed') AND i.expires_at>NEW.created_at) THEN RAISE(ABORT,'OWNER_INVITATION_PENDING') END;
END;
CREATE TRIGGER owner_invitation_immutable BEFORE UPDATE ON agency_owner_invitations WHEN NEW.agency_client_id!=OLD.agency_client_id OR NEW.property_id!=OLD.property_id OR NEW.management_id!=OLD.management_id OR NEW.token_hash!=OLD.token_hash OR NEW.email_hash!=OLD.email_hash OR NEW.recipient_envelope!=OLD.recipient_envelope OR NEW.allow_inspections!=OLD.allow_inspections OR NEW.allow_reports!=OLD.allow_reports OR NEW.invited_by!=OLD.invited_by OR NEW.expires_at!=OLD.expires_at OR NEW.authority_reference!=OLD.authority_reference BEGIN SELECT RAISE(ABORT,'OWNER_INVITATION_IMMUTABLE'); END;
CREATE TRIGGER owner_invitation_approval BEFORE UPDATE ON agency_owner_invitations WHEN NEW.status='approved' AND OLD.status='claimed' BEGIN
 SELECT CASE WHEN NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.invited_by OR NEW.reviewed_by=OLD.claimed_by OR NOT EXISTS(SELECT 1 FROM users u JOIN staff_profiles s ON s.user_id=u.id AND s.active=1 AND s.role IN('administrator','operations_manager') WHERE u.id=NEW.reviewed_by AND u.active=1 AND u.verified_at IS NOT NULL) THEN RAISE(ABORT,'INDEPENDENT_OWNER_REVIEW') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM agency_owner_grants g WHERE g.id=NEW.grant_id AND g.agency_client_id=NEW.agency_client_id AND g.property_id=NEW.property_id AND g.management_id=NEW.management_id AND g.owner_user_id=NEW.claimed_by AND g.verified_by=NEW.reviewed_by AND g.allow_reports=NEW.allow_reports AND g.allow_inspections=NEW.allow_inspections AND g.revoked_at IS NULL) THEN RAISE(ABORT,'OWNER_INVITATION_GRANT_SCOPE') END;
END;
CREATE TRIGGER owner_invitation_no_delete BEFORE DELETE ON agency_owner_invitations BEGIN SELECT RAISE(ABORT,'OWNER_INVITATION_AUDIT_IMMUTABLE'); END;
