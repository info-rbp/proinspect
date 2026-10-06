"""One-use, hash-checked source transport. Does not execute transported code."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import lzma
import re
import subprocess

root = Path.cwd().resolve()
manifest = json.loads(Path('.source-transfer/ready.json').read_text())
assert manifest['version'] == 1
assert subprocess.check_output(['git','ls-remote','origin','refs/heads/main'], text=True).split()[0] == manifest['baseMain'], 'Main changed; reconcile before applying'
assert manifest['partCount'] == 13 and manifest['fileCount'] == 65
packet = b''.join(Path(f'.source-transfer/part-{i:02}.xz').read_bytes() for i in range(13))
assert len(packet) == manifest['packageBytes'] == 77788
assert hashlib.sha256(packet).hexdigest() == manifest['packageSHA256']
decoder = lzma.LZMADecompressor(memlimit=512 * 1024 * 1024)
raw = decoder.decompress(packet, max_length=manifest['decodedBytes'] + 1)
assert decoder.eof and not decoder.unused_data
assert len(raw) == manifest['decodedBytes'] == 428646
assert hashlib.sha256(raw).hexdigest() == manifest['decodedSHA256']
changes = json.loads(raw)
assert len(changes) == 65
outputs = {}
for name, change in changes.items():
    p = PurePosixPath(name)
    assert not p.is_absolute() and '..' not in p.parts and str(p) == name
    assert re.fullmatch(r'[A-Za-z0-9_./-]+', name)
    assert name in ('README.md','package.json') or name.startswith(('apps/platform/','packages/','database/','docs/','tests/','integrations/'))
    assert not any(part.startswith('.') for part in p.parts)
    target = root / name
    assert target.resolve().is_relative_to(root)
    assert not any(parent.is_symlink() for parent in [target, *target.parents] if parent.is_relative_to(root))
    old = target.read_bytes() if target.exists() else b''
    assert hashlib.sha256(old).hexdigest() == change['base'], f'Baseline changed: {name}'
    lines = old.decode('utf-8').splitlines(keepends=True)
    last_end = 0
    for start, end, replacement in change['edits']:
        assert type(start) is int and type(end) is int and type(replacement) is str
        assert last_end <= start <= end <= len(lines)
        last_end = end
    for start, end, replacement in reversed(change['edits']):
        lines[start:end] = [replacement]
    data = ''.join(lines).encode('utf-8')
    assert hashlib.sha256(data).hexdigest() == change['sha256'], f'Output mismatch: {name}'
    outputs[name] = data
# Write only after every input and output has passed validation.
for name, data in outputs.items():
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
print(json.dumps({'validatedFiles':len(outputs),'decodedSHA256':manifest['decodedSHA256'],'deployment':False}))
