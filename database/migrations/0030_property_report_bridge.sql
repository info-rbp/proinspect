-- Additive Report Tool bridge. Source PDFs enter review, never automatically acquire client grants.
CREATE TABLE property_report_bridge_handoffs (
 id TEXT PRIMARY KEY, work_order_id TEXT NOT NULL REFERENCES work_orders(id),
 staff_user_id TEXT NOT NULL REFERENCES users(id), staff_email TEXT NOT NULL,
 source_report_id TEXT, document_id TEXT UNIQUE REFERENCES documents(id),
 created_at TEXT NOT NULL, launch_expires_at TEXT NOT NULL,
 publish_expires_at TEXT NOT NULL, received_at TEXT,
 status TEXT NOT NULL CHECK(status IN('pending','received','revoked')),
 CHECK(document_id IS NULL OR (status='received' AND source_report_id IS NOT NULL))
) STRICT;
CREATE UNIQUE INDEX bridge_report_source_unique ON property_report_bridge_handoffs(source_report_id) WHERE source_report_id IS NOT NULL;
CREATE INDEX bridge_work_order_idx ON property_report_bridge_handoffs(work_order_id,created_at);
