"""Synthetic real-engine checks only. Never receives applicant files or secrets."""
import hashlib
import http.client
import json
import time

def request(method,path,body=None,headers=None):
    connection=http.client.HTTPConnection('127.0.0.1',18080,timeout=40)
    try:
        connection.request(method,path,body=body,headers=headers or {})
        response=connection.getresponse()
        raw=response.read(8193)
        assert len(raw)<=8192
        return response.status,json.loads(raw)
    finally:
        connection.close()

deadline=time.monotonic()+300
last={'error':'ENGINE_NOT_STARTED'}
while True:
    try:
        status,engine=request('GET','/health')
        last=engine
        if status==200: break
    except (OSError,ValueError): pass
    if time.monotonic()>deadline: raise RuntimeError('Real ClamAV engine not ready: '+json.dumps(last))
    time.sleep(2)

# The standard harmless EICAR antivirus test string; never a real malware sample.
eicar=b'X5O!P%@AP[4'+b'\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
clean=b'%PDF-1.4\nSynthetic ProInspect scanner acceptance fixture.\n%%EOF\n'
for body,verdict in [(clean,'clean'),(eicar,'unsafe')]:
    status,result=request('POST','/scan',body,{'X-Expected-SHA256':hashlib.sha256(body).hexdigest()})
    assert status==200 and result['complete'] is True and result['verdict']==verdict
    assert result['sha256']==hashlib.sha256(body).hexdigest()
    assert result['engine']==engine
    assert set(result)=={'engine','verdict','complete','sha256'}
status,result=request('POST','/scan',clean,{'X-Expected-SHA256':'0'*64})
assert status==503 and result=={'error':'SCAN_FAILED'}
connection=http.client.HTTPConnection('127.0.0.1',18080,timeout=10)
connection.putrequest('POST','/scan')
connection.putheader('Content-Length',str(8*1024*1024+1))
connection.putheader('X-Expected-SHA256','0'*64)
connection.endheaders()
response=connection.getresponse()
assert response.status==413
response.read();connection.close()
status,result=request('GET','/unknown')
assert status==404
print(json.dumps({'synthetic':True,'actualClamAV':True,'engine':engine,'clean':True,'eicarBlocked':True,'digestMismatchBlocked':True,'oversizeBlocked':True,'applicantDataUsed':False}))
