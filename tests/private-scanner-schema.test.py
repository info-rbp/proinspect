"""0056 -> 0057 rehearsal using only an isolated local database and recovery copy."""
import json
import pathlib
import sqlite3
import tempfile

with tempfile.TemporaryDirectory(prefix='private-scan-rehearsal-') as directory:
    db=sqlite3.connect(pathlib.Path(directory)/'rehearsal.sqlite')
    db.execute('PRAGMA foreign_keys=ON')
    # Rehearse the historical 0056 -> 0057 boundary, not any later additive migration.
    files=sorted(f for f in pathlib.Path('database/migrations').glob('*.sql') if f.name<='0057_private_document_scanning.sql')
    assert files[-1].name=='0057_private_document_scanning.sql'
    for file in files[:-1]: db.executescript(file.read_text())
    before=db.execute("SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").fetchall()
    counts={name:db.execute('SELECT COUNT(*) FROM "'+name+'"').fetchone()[0] for kind,name,_ in before if kind=='table'}
    recovery=sqlite3.connect(pathlib.Path(directory)/'recovery.sqlite')
    db.backup(recovery)
    db.executescript(files[-1].read_text())
    for original in before:
        assert db.execute('SELECT type,name,sql FROM sqlite_schema WHERE type=? AND name=?',original[:2]).fetchone()==original
    for name,count in counts.items(): assert db.execute('SELECT COUNT(*) FROM "'+name+'"').fetchone()[0]==count
    assert db.execute('SELECT COUNT(*) FROM managed_rental_document_releases').fetchone()[0]==0
    values=['synthetic-release','production','a'*40,'synthetic-policy','b'*64,'scanned_documents','proinspect-private-document-scanner','c'*40,'d'*64,'e'*64,json.dumps({'kty':'EC','crv':'P-256','x':'synthetic-only','y':'synthetic-only'}),'f'*64,'2026-11-15T00:00:00.000Z','synthetic-owner','SYNTHETIC-NOT-LIVE-AUTHORITY',0,'2026-11-15T00:00:00.000Z']
    db.execute('INSERT INTO managed_rental_document_releases VALUES('+','.join('?' for _ in values)+')',values)
    try:
        db.execute("UPDATE managed_rental_document_releases SET scanner_key_id=?",('f'*64,))
        raise AssertionError('Verification key changed within a release')
    except sqlite3.IntegrityError: pass
    private=list(values);private[0]='private-key-rejected';private[2]='9'*40;private[10]=json.dumps({'kty':'EC','crv':'P-256','d':'must-not-store-private-keys'})
    try:
        db.execute('INSERT INTO managed_rental_document_releases VALUES('+','.join('?' for _ in private)+')',private)
        raise AssertionError('Private signing key was accepted')
    except sqlite3.IntegrityError: pass
    db.execute('UPDATE managed_rental_document_releases SET enabled=1');db.execute('UPDATE managed_rental_document_releases SET enabled=0')
    assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
    assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    assert recovery.execute("SELECT name FROM sqlite_schema WHERE name='managed_rental_document_releases'").fetchall()==[]
    for name,count in counts.items(): assert recovery.execute('SELECT COUNT(*) FROM "'+name+'"').fetchone()[0]==count
    recovery.close();db.close()
print('Private scanner 0057 rehearsal: existing schema/data unchanged; no activation seeded; immutable public-key release; isolated recovery passed')
