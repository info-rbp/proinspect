"""Recognize complete statements against only the pristine repository schema."""
import json
import re
import sqlite3
import sys
from pathlib import Path

connection = sqlite3.connect(':memory:')
for migration in sorted(Path('database/migrations').glob('*.sql')):
    connection.executescript(migration.read_text())
valid = []
for sql in json.load(sys.stdin):
    try:
        connection.execute('EXPLAIN ' + sql)
        n = 0
    except sqlite3.ProgrammingError as error:
        count = re.search(r'uses (\d+),', str(error))
        if not count:
            continue
        n = int(count[1])
    except sqlite3.OperationalError:
        continue
    valid.append([sql, n])
json.dump(valid, sys.stdout)
