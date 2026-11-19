"""Read keys, constraints and built-in data from an independent, empty SQLite replay."""
import json
from pathlib import Path
import re
import sqlite3

db = sqlite3.connect(':memory:')
clock = sqlite3.connect(':memory:')
fixed = '2111-03-17T12:34:56.789Z'
def strftime(fmt, *args):
    values = [fmt] + [fixed if arg == 'now' else arg for arg in args]
    return clock.execute('SELECT strftime(' + ','.join('?' for _ in values) + ')', values).fetchone()[0]
db.create_function('strftime', -1, strftime)
db.create_function('current_timestamp', 0, lambda: '2111-03-17 12:34:56')
for p in sorted(Path('database/migrations').glob('*.sql')):
    db.executescript(p.read_text())
catalog = {}
for name, sql in db.execute("SELECT name,sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'"):
    cols=list(db.execute('PRAGMA table_info('+name+')'))
    unique=[]
    for index in db.execute('PRAGMA index_list('+name+')'):
        if index[3]=='u':
            unique.append([item[2] for item in db.execute('PRAGMA index_info('+index[1]+')')])
    catalog[name]={
        'pk':[c[1] for c in sorted(cols,key=lambda c:c[5]) if c[5]],
        'unique':unique,
        'checks':len(re.findall(r'\bCHECK\s*\(',sql,re.I)),
        'required':[c[1] for c in cols if c[3] or c[5]],
        'rows':[list(row) for row in db.execute('SELECT * FROM '+name)]
    }
print(json.dumps(catalog))
