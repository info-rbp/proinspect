#!/bin/sh
set -eu
umask 077
if [ -f /etc/cloudflare/certs/cloudflare-containers-ca.crt ]; then
 cat /etc/cloudflare/certs/cloudflare-containers-ca.crt >> /etc/ssl/certs/ca-certificates.crt
fi
freshclam --no-dns --daemon --foreground --config-file=/etc/clamav/freshclam.conf >/dev/null 2>&1 &
clamd --foreground=true --config-file=/etc/clamav/clamd.conf >/dev/null 2>&1 &
exec python3 /opt/proinspect/scanner.py
