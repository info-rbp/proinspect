#!/usr/bin/env python3
"""Offline V3 upgrade/recovery rehearsal. Synthetic records only; never connects to D1."""
import hashlib
import json
import pathlib
import sqlite3
import subprocess
import tempfile
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "database" / "migrations"
ARTIFACT = ROOT / "artifacts" / "v3-upgrade-rehearsal.json"
BASELINE_COUNT = 6
TARGET_COUNT = 19
EXPECTED_BASELINE = [
    "0001_core.sql",
    "0002_guards.sql",
    "0003_connected_operations.sql",
    "0004_enquiries_notices.sql",
    "0005_account.sql",
    "0006_all_inclusive_subscription.sql",
]


def validate_files():
    files = sorted(MIGRATIONS.glob("*.sql"))
    assert len(files) == TARGET_COUNT, f"Expected {TARGET_COUNT} migrations; found {len(files)}"
    assert [p.name for p in files[:BASELINE_COUNT]] == EXPECTED_BASELINE, "Production baseline filenames changed"
    actual_versions = [int(p.name[:4]) for p in files]
    assert actual_versions == list(range(1, TARGET_COUNT + 1)), f"Duplicate/gap in V3 migrations: {actual_versions}"
    assert len({p.name for p in files}) == len(files), "Duplicate migration filenames"
    return files


def apply(conn, files):
    for path in files:
        conn.executescript(path.read_text(encoding="utf-8"))


def check_integrity(conn):
    assert conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok", "SQLite integrity failure"
    violations = conn.execute("PRAGMA foreign_key_check").fetchall()
    assert not violations, f"Foreign-key violations: {violations[:5]}"


def seed_baseline(conn):
    # Realistic, completely synthetic, core production-schema relationships.
    conn.execute(
        "INSERT INTO users(id,email,created_at) VALUES(?,?,?)",
        ("usr_v3_upgrade", "v3-rehearsal@example.invalid", "2026-10-21T00:00:00Z"),
    )
    conn.execute(
        "INSERT INTO clients(id,name,client_type,created_at) VALUES(?,?,?,?)",
        ("cli_v3_upgrade", "Synthetic Migration Customer", "landlord", "2026-10-21T00:00:00Z"),
    )
    conn.execute(
        "INSERT INTO client_memberships(id,client_id,user_id,role,created_at) VALUES(?,?,?,?,?)",
        ("mem_v3_upgrade", "cli_v3_upgrade", "usr_v3_upgrade", "owner", "2026-10-21T00:00:00Z"),
    )
    conn.execute(
        "INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES(?,?,?,?,?,?,?)",
        ("prop_v3_upgrade", "1 Synthetic Lane", "Perth", "6000", "synthetic|perth|6000",
         "residential", "2026-10-21T00:00:00Z"),
    )
    conn.execute(
        "INSERT INTO client_property_links(id,client_id,property_id,role,starts_at) VALUES(?,?,?,?,?)",
        ("link_v3_upgrade", "cli_v3_upgrade", "prop_v3_upgrade", "owner", "2026-10-21T00:00:00Z"),
    )
    conn.commit()


def snapshot(conn):
    # Stable baseline fields only: additive migrations may introduce extra columns.
    queries = {
        "user": "SELECT id,email FROM users WHERE id='usr_v3_upgrade'",
        "client": "SELECT id,name,client_type FROM clients WHERE id='cli_v3_upgrade'",
        "membership": "SELECT id,client_id,user_id,role FROM client_memberships WHERE id='mem_v3_upgrade'",
        "property": "SELECT id,address,suburb,postcode FROM properties WHERE id='prop_v3_upgrade'",
        "link": "SELECT id,client_id,property_id,role FROM client_property_links WHERE id='link_v3_upgrade'",
        "subscription": "SELECT client_id,plan_code,status FROM subscriptions WHERE client_id='cli_v3_upgrade'",
    }
    value = {k: conn.execute(q).fetchall() for k, q in queries.items()}
    assert all(value.values()), f"Missing baseline fixture after migration: {value}"
    return value


def has_table(conn, table):
    return conn.execute(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()[0] == 1


def hash_snapshot(snap):
    return hashlib.sha256(json.dumps(snap, sort_keys=True).encode("utf-8")).hexdigest()


def main():
    ARTIFACT.parent.mkdir(parents=True, exist_ok=True)
    evidence = {
        "source_sha": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "run_at_utc": datetime.now(timezone.utc).isoformat(),
        "environment": "offline SQLite synthetic migration replay",
        "production_d1_touched": False,
        "contains_customer_data": False,
        "status": "FAIL",
        "steps": [],
    }
    try:
        files = validate_files()
        evidence["steps"].append("migration prefix 0001..0019 validated")
        with tempfile.TemporaryDirectory(prefix="proinspect-v3-rehearsal-") as tmp:
            db_file = pathlib.Path(tmp) / "rehearsal.sqlite"
            baseline_backup = pathlib.Path(tmp) / "baseline-backup.sqlite"
            upgraded_backup = pathlib.Path(tmp) / "upgraded-backup.sqlite"
            conn = sqlite3.connect(db_file)
            try:
                conn.execute("PRAGMA foreign_keys=ON")
                apply(conn, files[:BASELINE_COUNT])
                seed_baseline(conn)
                check_integrity(conn)
                before = snapshot(conn)
                assert not has_table(conn, "booking_calendar_sync"), "Unexpected calendar table before V3"
                with sqlite3.connect(baseline_backup) as backup:
                    conn.backup(backup)
                evidence["steps"].append("0001..0006 baseline and synthetic customer backed up")
                apply(conn, files[BASELINE_COUNT:])
                check_integrity(conn)
                after = snapshot(conn)
                assert before == after, "Canonical user/client/property/membership/subscription data changed"
                assert has_table(conn, "booking_calendar_sync"), "Calendar schema absent after upgrade"
                assert has_table(conn, "open_home_inspection_reports"), "Open Home report schema absent"
                with sqlite3.connect(upgraded_backup) as backup:
                    conn.backup(backup)
                evidence["steps"].append("0007..0019 additive upgrade preserved synthetic records")
                evidence["synthetic_baseline_sha256"] = hash_snapshot(before)
                evidence["synthetic_upgraded_sha256"] = hash_snapshot(after)
                evidence["table_count_after_upgrade"] = conn.execute(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table'"
                ).fetchone()[0]
            finally:
                conn.close()

            restored = sqlite3.connect(pathlib.Path(tmp) / "restored.sqlite")
            try:
                with sqlite3.connect(baseline_backup) as baseline:
                    baseline.backup(restored)
                check_integrity(restored)
                assert snapshot(restored) == before, "Backup restore changed synthetic baseline records"
                assert not has_table(restored, "booking_calendar_sync"), "Backup restore retained V3 schema"
                evidence["steps"].append("baseline backup restored and records/foreign keys verified")
            finally:
                restored.close()
        evidence["status"] = "PASS"
    except Exception as ex:
        evidence["failure"] = f"{type(ex).__name__}: {ex}"
        raise
    finally:
        ARTIFACT.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(evidence, indent=2))


if __name__ == "__main__":
    main()
