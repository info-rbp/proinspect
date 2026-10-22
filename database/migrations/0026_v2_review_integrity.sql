-- V2 safety hardening after accepted migrations 0001 through 0010.
-- Require a genuinely separate evidence reviewer even for direct database writes.
CREATE TRIGGER v2_condition_distinct_reviewer BEFORE UPDATE OF status ON v2_asset_conditions
WHEN NEW.status IN ('verified','rejected') AND NEW.status IS NOT OLD.status
 AND NEW.verified_by=OLD.observed_by
BEGIN SELECT RAISE(ABORT,'V2_CONDITION_SELF_REVIEW'); END;
CREATE TRIGGER v2_compliance_distinct_reviewer BEFORE UPDATE OF status ON v2_compliance_evidence
WHEN NEW.status IN ('verified','rejected') AND NEW.status IS NOT OLD.status
 AND NEW.reviewed_by=OLD.recorded_by
BEGIN SELECT RAISE(ABORT,'V2_COMPLIANCE_EVIDENCE_SELF_REVIEW'); END;
