-- Preferences do not grant roles or change the verified email identity.
CREATE TABLE user_preferences (
 user_id TEXT PRIMARY KEY REFERENCES users(id),
 report_email INTEGER NOT NULL DEFAULT 1 CHECK(report_email IN(0,1)),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 updated_at TEXT NOT NULL
) STRICT;
