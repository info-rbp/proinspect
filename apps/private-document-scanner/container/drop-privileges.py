"""Drop Linux capability sets and privilege escalation before starting services."""
import ctypes
import errno
import os
import pwd

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
os.execl('/bin/sh','sh','-c','freshclam --no-dns --daemon --foreground --config-file=/etc/clamav/freshclam.conf >/dev/null 2>&1 & clamd --foreground=true --config-file=/etc/clamav/clamd.conf >/dev/null 2>&1 & exec python3 /opt/proinspect/scanner.py')
