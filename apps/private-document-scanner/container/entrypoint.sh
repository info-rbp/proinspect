#!/bin/sh
set -eu
umask 077
mkdir -p /dev/shm/clamav
chmod 0700 /dev/shm/clamav
chown clamav:clamav /dev/shm/clamav
# ClamAV may spool INSTREAM data internally: all temporary file processing
# must use the RAM filesystem, never the container's ordinary disk.
python3 -c 'import sys; sys.exit(0 if any(p.split()[1:3]==["/dev/shm","tmpfs"] for p in open("/proc/mounts")) else 1)'
if [ -f /etc/cloudflare/certs/cloudflare-containers-ca.crt ]; then
 cat /etc/cloudflare/certs/cloudflare-containers-ca.crt >> /etc/ssl/certs/ca-certificates.crt
fi
exec python3 /opt/proinspect/drop-privileges.py
