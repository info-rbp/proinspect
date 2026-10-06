import json, pathlib, sqlite3

statements=[]
for path in sorted(pathlib.Path('database/migrations').glob('*.sql')):
    current=''
    for char in path.read_text():
        current+=char
        if char==';' and sqlite3.complete_statement(current):
            statements.append(current.strip())
            current=''
    if current.strip():
        raise SystemExit(f'Incomplete SQL statement in {path}')
print(json.dumps(statements))
