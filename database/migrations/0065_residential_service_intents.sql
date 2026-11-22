CREATE TABLE booking_service_addon_intents (
 booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
 addon_code TEXT NOT NULL CHECK(addon_code IN(
  'inventory_with_pcr','form19_service','tenant_attendance_coordination')),
 source_fee_candidate_ex_gst_cents INTEGER NOT NULL CHECK(source_fee_candidate_ex_gst_cents>=0),
 status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN('requested','declined','scope_accepted')),
 created_at TEXT NOT NULL,
 reviewed_by TEXT REFERENCES users(id),
 reviewed_at TEXT,
 PRIMARY KEY(booking_id,addon_code),
 CHECK((status='requested' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status!='requested' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
) STRICT;
CREATE TABLE request_service_intakes (
 request_id TEXT PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
 service_kind TEXT NOT NULL,
 encrypted_envelope TEXT NOT NULL,
 created_at TEXT NOT NULL
) STRICT;
CREATE INDEX request_service_intakes_kind ON request_service_intakes(service_kind,created_at);

-- Seed discoverable residential service identities without activating checkout or pricing.
INSERT INTO services(id,name,family,sectors_json,summary,duration_minutes,buffer_before,buffer_after,notice_hours,horizon_days,price_ex_gst_cents,booking_mode,active) VALUES('follow-up-routine-inspection','Follow-Up Routine Inspections','inspections','["residential"]','Return inspection linked to the previous routine report and outstanding findings.',45,15,15,24,60,NULL,'request',1) ON CONFLICT(id) DO NOTHING;
INSERT INTO services(id,name,family,sectors_json,summary,duration_minutes,buffer_before,buffer_after,notice_hours,horizon_days,price_ex_gst_cents,booking_mode,active) VALUES('property-inventory-report','Property Inventory Report','inspections','["residential"]','Document the included inventory at the property; can also be requested with a PCR.',90,15,15,48,60,NULL,'request',1) ON CONFLICT(id) DO NOTHING;
INSERT INTO services(id,name,family,sectors_json,summary,duration_minutes,buffer_before,buffer_after,notice_hours,horizon_days,price_ex_gst_cents,booking_mode,active) VALUES('vacant-property-check','Vacant Property Check','inspections','["residential"]','Check a vacant property and provide room photographs and a summary report.',45,15,15,24,60,NULL,'request',1) ON CONFLICT(id) DO NOTHING;
INSERT INTO services(id,name,family,sectors_json,summary,duration_minutes,buffer_before,buffer_after,notice_hours,horizon_days,price_ex_gst_cents,booking_mode,active) VALUES('maintenance-inspection','Maintenance Inspection','inspections','["residential"]','Inspect defects, follow up on observable repair completion or capture updated photographs.',60,15,15,24,60,NULL,'request',1) ON CONFLICT(id) DO NOTHING;
INSERT INTO services(id,name,family,sectors_json,summary,duration_minutes,buffer_before,buffer_after,notice_hours,horizon_days,price_ex_gst_cents,booking_mode,active) VALUES('open-home','Open Home','leasing','["residential"]','Grouped vacant-property viewing; request a date and morning, afternoon or evening window.',15,15,15,72,60,NULL,'request',1) ON CONFLICT(id) DO NOTHING;
INSERT INTO services(id,name,family,sectors_json,summary,duration_minutes,buffer_before,buffer_after,notice_hours,horizon_days,price_ex_gst_cents,booking_mode,active) VALUES('private-open-home','Open Home (Private)','leasing','["residential"]','Private viewing for an identified attendee; appointment confirmation remains subject to availability.',15,15,15,72,60,NULL,'request',1) ON CONFLICT(id) DO NOTHING;
INSERT INTO services(id,name,family,sectors_json,summary,duration_minutes,buffer_before,buffer_after,notice_hours,horizon_days,price_ex_gst_cents,booking_mode,active) VALUES('video-walkthrough-property','Video Walkthrough of Property','leasing','["residential"]','Record a property walkthrough and securely share with authorised recipients.',90,15,15,48,60,NULL,'request',1) ON CONFLICT(id) DO NOTHING;
INSERT INTO services(id,name,family,sectors_json,summary,duration_minutes,buffer_before,buffer_after,notice_hours,horizon_days,price_ex_gst_cents,booking_mode,active) VALUES('tenant-move-in-handover','Tenant Move-In and Handover Support','leasing','["residential"]','Arrange practical move-in tasks, keys and handover for an approved tenancy.',60,15,15,24,60,NULL,'request',1) ON CONFLICT(id) DO NOTHING;
INSERT INTO services(id,name,family,sectors_json,summary,duration_minutes,buffer_before,buffer_after,notice_hours,horizon_days,price_ex_gst_cents,booking_mode,active) VALUES('off-site-key-storage','Off-Site Key Storage','access','["residential"]','Arrange secure ongoing key custody with a monthly status record.',30,15,15,24,60,NULL,'request',1) ON CONFLICT(id) DO NOTHING;
INSERT INTO services(id,name,family,sectors_json,summary,duration_minutes,buffer_before,buffer_after,notice_hours,horizon_days,price_ex_gst_cents,booking_mode,active) VALUES('key-collection','Key Collection','access','["residential"]','Collect authorised keys from a named person or collection location.',45,15,15,24,60,NULL,'request',1) ON CONFLICT(id) DO NOTHING;
INSERT INTO services(id,name,family,sectors_json,summary,duration_minutes,buffer_before,buffer_after,notice_hours,horizon_days,price_ex_gst_cents,booking_mode,active) VALUES('key-safe-installation','Key Safe Installation','access','["residential"]','Install a key safe at an approved location and provide installation evidence.',60,15,15,24,60,NULL,'request',1) ON CONFLICT(id) DO NOTHING;
INSERT INTO services(id,name,family,sectors_json,summary,duration_minutes,buffer_before,buffer_after,notice_hours,horizon_days,price_ex_gst_cents,booking_mode,active) VALUES('key-safe-removal-relocation','Key Safe Removal or Relocation','access','["residential"]','Remove or relocate an existing safe as instructed.',60,15,15,24,60,NULL,'request',1) ON CONFLICT(id) DO NOTHING;
INSERT INTO services(id,name,family,sectors_json,summary,duration_minutes,buffer_before,buffer_after,notice_hours,horizon_days,price_ex_gst_cents,booking_mode,active) VALUES('key-audit-register-update','Key Audit and Register Update','access','["residential"]','Scope a property key audit and reconcile custody records.',60,15,15,24,60,NULL,'request',1) ON CONFLICT(id) DO NOTHING;
INSERT INTO services(id,name,family,sectors_json,summary,duration_minutes,buffer_before,buffer_after,notice_hours,horizon_days,price_ex_gst_cents,booking_mode,active) VALUES('key-cutting-tagging','Key Cutting and Tagging','access','["residential"]','Arrange authorised duplicate keys and identifying tags.',30,15,15,24,60,NULL,'request',1) ON CONFLICT(id) DO NOTHING;
INSERT INTO services(id,name,family,sectors_json,summary,duration_minutes,buffer_before,buffer_after,notice_hours,horizon_days,price_ex_gst_cents,booking_mode,active) VALUES('locksmith-services','Locksmith Services','access','["residential"]','Arrange and coordinate locksmith access and authorised works.',60,15,15,24,60,NULL,'request',1) ON CONFLICT(id) DO NOTHING;
INSERT INTO services(id,name,family,sectors_json,summary,duration_minutes,buffer_before,buffer_after,notice_hours,horizon_days,price_ex_gst_cents,booking_mode,active) VALUES('urgent-maintenance-make-good','Urgent Maintenance / Make Good Works','maintenance','["residential"]','Urgent attendance request requiring safety triage and availability confirmation.',60,15,15,0,60,NULL,'request',1) ON CONFLICT(id) DO NOTHING;
