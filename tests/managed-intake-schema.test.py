import pathlib
import sqlite3
import tempfile

with tempfile.TemporaryDirectory(prefix='proinspect-managed-migration-') as directory:
    db = sqlite3.connect(pathlib.Path(directory) / 'source.sqlite')
    db.execute('PRAGMA foreign_keys=ON')
    files = sorted(p for p in pathlib.Path('database/migrations').glob('*.sql') if p.name[:4] <= '0056')
    assert files[-1].name == '0056_managed_property_intake.sql'
    for path in files[:-1]:
        db.executescript(path.read_text())
    db.execute("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES('synthetic-property','1 Fictional Street','Perth','6000','synthetic-managed','residential','2026-11-15')")
    db.commit()
    schema = db.execute("SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").fetchall()
    count = db.execute('SELECT COUNT(*) FROM properties').fetchone()
    recovery = sqlite3.connect(pathlib.Path(directory) / 'recovery.sqlite')
    db.backup(recovery)
    db.executescript(files[-1].read_text())
    for original in schema:
        assert db.execute('SELECT type,name,sql FROM sqlite_schema WHERE type=? AND name=?', original[:2]).fetchone() == original
    assert db.execute('SELECT COUNT(*) FROM properties').fetchone() == count
    db.execute("INSERT INTO property_application_management VALUES('synthetic-property','proinspect','SYNTHETIC-OWNER-CONFIRMATION',1,'synthetic-owner','2026-11-15')")
    try:
        db.execute("INSERT INTO property_application_management VALUES('missing-property','proinspect','SYNTHETIC-OWNER-CONFIRMATION',1,'synthetic-owner','2026-11-15')")
        raise AssertionError('Missing property accepted')
    except sqlite3.IntegrityError:
        pass
    db.execute("INSERT INTO managed_rental_intake_releases VALUES('synthetic-release','production',?, 'synthetic-policy',?,'details_only','synthetic-owner','SYNTHETIC-OWNER-AUTHORIZATION',1,'2026-11-15')", ('a'*40,'b'*64))
    try:
        db.execute("UPDATE managed_rental_intake_releases SET source_sha=?", ('c'*40,))
        raise AssertionError('Immutable release source changed')
    except sqlite3.IntegrityError:
        pass
    assert db.execute('PRAGMA foreign_key_check').fetchall() == []
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    assert recovery.execute('SELECT COUNT(*) FROM properties').fetchone() == count
    assert recovery.execute("SELECT name FROM sqlite_schema WHERE name IN('property_application_management','managed_rental_intake_releases')").fetchall() == []
    recovery.close()
    db.close()
print('Managed intake 0055 to 0056 migration, authority constraints and recovery verified')
