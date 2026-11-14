import pathlib
import sqlite3

schema = pathlib.Path('database/migrations/0054_client_service_interests.sql').read_text()
db = sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=ON')
db.executescript("""
CREATE TABLE users(id TEXT PRIMARY KEY);
CREATE TABLE clients(id TEXT PRIMARY KEY);
INSERT INTO users(id) VALUES('u1');
INSERT INTO clients(id) VALUES('c1');
""")
db.executescript(schema)
db.execute("INSERT INTO client_service_interests(client_id,service_area,requested_by,requested_at,updated_at) VALUES ('c1','residential','u1','a','a')")
assert db.execute("SELECT service_area FROM client_service_interests").fetchall() == [('residential',)]
for bad in ['danger','payments','unknown']:
    try:
        db.execute("INSERT INTO client_service_interests VALUES ('c1',?,'u1','a','a')",(bad,))
        assert False, f"accepted forbidden service {bad}"
    except sqlite3.IntegrityError:
        pass
try:
    db.execute("INSERT INTO client_service_interests VALUES ('missing','commercial','u1','a','a')")
    assert False, 'accepted missing client'
except sqlite3.IntegrityError:
    pass
print('Client service-interest migration constraints verified')
