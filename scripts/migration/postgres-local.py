"""Verify against a disposable loopback PostgreSQL cluster. Requires local PostgreSQL tools and Node."""
import argparse
import getpass
import os
from pathlib import Path
import shlex
import socket
import subprocess
import tempfile
from urllib.parse import quote

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--full', action='store_true', help='also build Node and run the full schema and application suite')
args = parser.parse_args()
repo = Path(__file__).resolve().parents[2]
os.chdir(repo)
bindir = Path(subprocess.check_output(['pg_config', '--bindir'], text=True).strip())


def run(command, **kwargs):
    subprocess.run(command, check=True, **kwargs)


if args.full:
    run(['python3', 'scripts/migration/postgres-schema.py', '--check'])
    run(['pnpm', '--dir', 'apps/platform', 'exec', 'react-router', 'build'],
        env={**os.environ, 'PROINSPECT_RUNTIME': 'node-proof'})
    run(['node', 'scripts/migration/build-domain.mjs'])

with tempfile.TemporaryDirectory(prefix='proinspect-spike-') as tmp:
    data = Path(tmp) / 'data'
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = str(sock.getsockname()[1])
    user = getpass.getuser()
    # Pass the user and target explicitly, including for createdb. An inherited PGHOST or PGUSER
    # must never redirect the fixture into another database.
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
    run([bindir / 'initdb', '-D', data, '-U', user, '-A', 'trust', '--no-locale', '-E', 'UTF8'],
        env=env, stdout=subprocess.DEVNULL)
    opts = shlex.join(['-h', '127.0.0.1', '-p', port, '-k', tmp])
    run([bindir / 'pg_ctl', '-D', data, '-l', Path(tmp) / 'postgres.log', '-o', opts, '-w', 'start'],
        env=env, stdout=subprocess.DEVNULL)
    try:
        url = 'postgresql://' + quote(user, safe='') + '@127.0.0.1:' + port + '/'
        suites = [('proinspect_spike', 'SPIKE_DATABASE_URL', 'tests/migration/postgres.test.mjs')]
        if args.full:
            suites.append(('proinspect_phase2', 'PHASE2_DATABASE_URL', 'tests/migration/phase2.test.mjs'))
        for name, variable, suite in suites:
            run([bindir / 'createdb', '-U', user, '-h', '127.0.0.1', '-p', port, name], env=env)
            run(['node', '--test', suite], env={**env, variable: url + name})
    finally:
        run([bindir / 'pg_ctl', '-D', data, '-m', 'fast', '-w', 'stop'], stdout=subprocess.DEVNULL)
