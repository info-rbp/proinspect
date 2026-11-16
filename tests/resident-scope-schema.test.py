"""Rehearse 0059 on an isolated D1-compatible SQLite copy without changing legacy records."""
import pathlib
import sqlite3
import tempfile

migrations = pathlib.Path('database/migrations')
target = migrations / '0060_resident_occupancies_and_council_appointments.sql'
with tempfile.TemporaryDirectory(prefix='resident-scope-0058-') as folder:
    db = sqlite3.connect(pathlib.Path(folder) / 'resident.sqlite')
    db.execute('PRAGMA foreign_keys=ON')
    for file in sorted(migrations.glob('*.sql')):
        if file.name >= target.name:
            break
        db.executescript(file.read_text())
    before = {name: (kind, ddl) for kind, name, ddl in db.execute(
        "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"
    )}
    counts = {name: db.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
              for name, (kind, _) in before.items() if kind == 'table'}
    recovery = sqlite3.connect(pathlib.Path(folder) / 'before.sqlite')
    db.backup(recovery)
    db.executescript(target.read_text())
    after = {name: (kind, ddl) for kind, name, ddl in db.execute(
        "SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"
    )}
    for name, value in before.items():
        assert name in after, name
        # Only the deliberate additive FK column changes the existing table schema.
        if name != 'portal_invitations':
            assert after[name] == value, name
    for name, value in counts.items():
        assert db.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0] == value, name
    for name in (
        'commercial_occupancies', 'commercial_occupant_invitations',
        'commercial_occupant_memberships', 'commercial_occupant_requests',
        'council_appointment_reviews',
    ):
        assert name in after, name
        assert db.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0] == 0
    columns = [column[1] for column in db.execute('PRAGMA table_info(portal_invitations)')]
    assert 'council_review_id' in columns
    assert db.execute('PRAGMA foreign_key_check').fetchall() == []
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    assert 'commercial_occupancies' not in {row[0] for row in recovery.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    )}
    assert 'council_review_id' not in {
        column[1] for column in recovery.execute('PRAGMA table_info(portal_invitations)')
    }
    recovery.close()
    db.close()
print('Resident scope 0059: additive schema, preserved records, FK integrity and isolated recovery verified')
