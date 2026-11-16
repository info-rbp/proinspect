"""Rehearse the two additive migrations from the live 0056 baseline, locally."""
import pathlib
import sqlite3
import tempfile

with tempfile.TemporaryDirectory(prefix='temporary-rental-rehearsal-') as directory:
    db=sqlite3.connect(pathlib.Path(directory)/'rehearsal.sqlite')
    db.execute('PRAGMA foreign_keys=ON')
    files=sorted(p for p in pathlib.Path('database/migrations').glob('*.sql') if p.name<='0058_temporary_rental_documents.sql')
    assert files[-1].name=='0058_temporary_rental_documents.sql'
    for p in files:
        if p.name[:4]<='0056': db.executescript(p.read_text())
    before=db.execute("SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").fetchall()
    counts={name:db.execute('SELECT COUNT(*) FROM "'+name+'"').fetchone()[0] for kind,name,_ in before if kind=='table'}
    recovery=sqlite3.connect(pathlib.Path(directory)/'recovery.sqlite');db.backup(recovery)
    for p in files:
        if p.name[:4]>'0056': db.executescript(p.read_text())
    for original in before:
        assert db.execute('SELECT type,name,sql FROM sqlite_schema WHERE type=? AND name=?',original[:2]).fetchone()==original
    for name,count in counts.items(): assert db.execute('SELECT COUNT(*) FROM "'+name+'"').fetchone()[0]==count
    for table in ['managed_rental_temporary_releases','rental_temporary_documents','rental_temporary_packages','managed_rental_document_releases']:
        assert db.execute('SELECT COUNT(*) FROM '+table).fetchone()[0]==0
    db.execute("INSERT INTO managed_rental_temporary_releases VALUES('synthetic','production',?,'synthetic-policy',?,'temporary_documents','synthetic-owner','SYNTHETIC-AUTHORITY',0,'2026-11-16')",('a'*40,'b'*64))
    try:
        db.execute("UPDATE managed_rental_temporary_releases SET source_sha=?",('c'*40,))
        raise AssertionError('Release source changed')
    except sqlite3.IntegrityError as error: assert 'TEMPORARY_RELEASE_IMMUTABLE' in str(error)
    assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
    assert recovery.execute("SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").fetchall()==before
print('Temporary-document 0056 to 0058 rehearsal passed: existing schema/data preserved, release disabled by default, isolated recovery verified')
