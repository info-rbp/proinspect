#!/usr/bin/env bash
# Disposable real-engine fixture; no applicant files, credentials or production connections.
set -euo pipefail
docker run -d --name private-scanner --memory=4g --cpus=1 -e PROINSPECT_SCANNER_CI_DNS=1 -p 127.0.0.1:18080:8080 proinspect-private-scanner
mkdir -p artifacts
python3 scripts/release/private-scanner-smoke.py | tee artifacts/private-scanner-engine.json
docker exec private-scanner python3 -c 'import os; s=dict(p.split(":",1) for p in open("/proc/1/status") if ":" in p); assert all(int(s[k].strip(),16)==0 for k in ["CapInh","CapPrm","CapEff","CapBnd","CapAmb"]); assert s["NoNewPrivs"].strip()=="1"; assert not os.listdir("/dev/shm/clamav")'
