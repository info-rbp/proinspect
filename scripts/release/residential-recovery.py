"""Synthetic SQLite recovery rehearsal; never reads or writes hosted/customer data."""
import hashlib, json, pathlib, sqlite3, tempfile, time
root=pathlib.Path(__file__).resolve().parents[2]
files=sorted((root/'database/migrations').glob('*.sql'))
started=time.monotonic()
with tempfile.TemporaryDirectory(prefix='residential-recovery-') as directory:
    database=sqlite3.connect(pathlib.Path(directory)/'source.sqlite')
    for migration in files:
        if migration.name<'0063': database.executescript(migration.read_text())
    database.execute("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES('recovery_fixture','Synthetic home','Perth','6000','recovery-fixture','residential','2026-11-21')")
    database.commit()
    before='\n'.join(database.iterdump())
    backup=sqlite3.connect(pathlib.Path(directory)/'backup.sqlite')
    database.backup(backup)
    for migration in files:
        if migration.name>='0063': database.executescript(migration.read_text())
    assert database.execute("SELECT count(*) FROM residential_subscription_contracts").fetchone()[0]==0
    assert database.execute('PRAGMA foreign_key_check').fetchall()==[]
    database.execute("UPDATE properties SET address='Synthetic damage' WHERE id='recovery_fixture'")
    database.commit()
    backup.backup(database)
    after='\n'.join(database.iterdump())
    assert before==after
    assert database.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    assert database.execute('PRAGMA foreign_key_check').fetchall()==[]
    # Reapply additive pivot after restoring the complete pre-pivot database.
    for migration in files:
        if migration.name>='0063': database.executescript(migration.read_text())
    assert database.execute("SELECT address FROM properties WHERE id='recovery_fixture'").fetchone()[0]=='Synthetic home'
    report={'scope':'local synthetic SQLite; not hosted D1 Time Travel acceptance','baselineMigrations':62,'currentMigrations':len(files),'restoredDumpSha256':hashlib.sha256(after.encode()).hexdigest(),'integrity':'ok','foreignKeyErrors':0,'elapsedSeconds':round(time.monotonic()-started,3)}
    (root/'artifacts').mkdir(exist_ok=True)
    (root/'artifacts/residential-recovery.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))
    backup.close();database.close()
