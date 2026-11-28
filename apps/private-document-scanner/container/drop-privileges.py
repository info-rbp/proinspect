"""Drop Linux capability sets and privilege escalation before starting services."""
import ctypes
import errno
import os
import pwd
import subprocess
import time
from pathlib import Path

libc=ctypes.CDLL(None,use_errno=True)
# Drop the full bounding set while setup still has CAP_SETPCAP. A later exec
# cannot regain capabilities, even on a host that starts containers privileged.
for capability in range(64):
    if libc.prctl(24,capability,0,0,0)!=0 and ctypes.get_errno()!=errno.EINVAL:
        raise RuntimeError('CAPABILITY_DROP_FAILED')
if libc.prctl(38,1,0,0,0)!=0:
    raise RuntimeError('NO_NEW_PRIVILEGES_FAILED')
account=pwd.getpwnam('clamav')
os.setgroups([])
os.setgid(account.pw_gid)
os.setuid(account.pw_uid)
status=dict(line.split(':',1) for line in open('/proc/self/status') if ':' in line)
if any(int(status[name].strip(),16)!=0 for name in ['CapInh','CapPrm','CapEff','CapBnd','CapAmb']) or status['NoNewPrivs'].strip()!='1':
    raise RuntimeError('PRIVILEGE_DROP_NOT_EFFECTIVE')
# Refresh BEFORE clamd loads its databases. The initial refresh must not
# try to notify a socket that does not yet exist. Subsequent refreshes keep
# NotifyClamd enabled and run only after the engine socket is available.
# Hosted containers retain the fixed-host HTTP updater (no external DNS
# version lookup). Disposable CI can use FreshClam's normal DNS-assisted
# incremental updates and show signature-download diagnostics. Neither mode
# changes the real VERSION freshness check or the engine's scan safeguards.
ci_dns = os.environ.get('PROINSPECT_SCANNER_CI_DNS') == '1'
config = Path('/etc/clamav/freshclam.conf')
startup = Path('/run/clamav/freshclam-startup.conf')
startup.write_text('\n'.join(line for line in config.read_text().splitlines()
                             if not line.lstrip().startswith('NotifyClamd ')) + '\n')
flags = ['--verbose'] if ci_dns else ['--no-dns']
output = None if ci_dns else subprocess.DEVNULL
try:
    refresh = subprocess.run(['freshclam', '--config-file='+str(startup), *flags],
                             stdout=output, stderr=subprocess.STDOUT, check=False)
    # A failed refresh never makes stale signatures acceptable; /health
    # independently validates the database timestamp loaded by clamd.
    print('FreshClam initial update exit code:', refresh.returncode, flush=True)
finally:
    startup.unlink(missing_ok=True)
engine = subprocess.Popen(['clamd', '--foreground=true', '--config-file=/etc/clamav/clamd.conf'],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
deadline = time.monotonic() + 60
while not Path('/run/clamav/clamd.sock').is_socket():
    if engine.poll() is not None or time.monotonic() >= deadline:
        raise RuntimeError('SCANNER_ENGINE_START_FAILED')
    time.sleep(0.25)
subprocess.Popen(['freshclam', '--daemon', '--foreground', '--config-file='+str(config), *flags],
                 stdout=output, stderr=subprocess.STDOUT)
os.execlp('python3', 'python3', '/opt/proinspect/scanner.py')
