-- Residential entry-notice links are invalidated on booking changes;
-- advisory reminders are idempotent and do not auto-issue legal notices.
ALTER TABLE wa_residential_form_cases ADD COLUMN notice_purpose TEXT CHECK(notice_purpose IS NULL OR notice_purpose IN('routine','repairs','other'));
ALTER TABLE wa_residential_form_cases ADD COLUMN notice_booking_starts_at TEXT;
ALTER TABLE wa_residential_form_cases ADD COLUMN notice_invalidated_at TEXT;
ALTER TABLE wa_residential_form_cases ADD COLUMN notice_invalidated_reason TEXT;
CREATE INDEX wa_form_entry_booking ON wa_residential_form_cases(form_code,booking_id,notice_invalidated_at);

CREATE TABLE wa_residential_form_reminders (
 case_id TEXT NOT NULL REFERENCES wa_residential_form_cases(id),
 phase TEXT NOT NULL CHECK(phase IN('due_soon','overdue')),
 user_id TEXT NOT NULL REFERENCES users(id),
 sent_at TEXT NOT NULL,
 PRIMARY KEY(case_id,phase,user_id)
) STRICT;
CREATE TRIGGER wa_form_reminder_no_update BEFORE UPDATE ON wa_residential_form_reminders
BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER wa_form_reminder_no_delete BEFORE DELETE ON wa_residential_form_reminders
BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
