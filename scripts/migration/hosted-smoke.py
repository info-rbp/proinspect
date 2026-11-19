"""Check the configured stage using IAM. Output only fixed outcomes and service metadata."""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

stage, sha = sys.argv[1:]
assert stage in ('dev', 'staging') and len(sha) == 40
project = 'proinspect-property-services'
service = 'proinspect-migration-' + stage
spec = json.loads(subprocess.check_output(['gcloud','run','services','describe',service,'--project='+project,
                                           '--region=australia-southeast1','--format=json'], text=True))
base = spec['status']['url']
settings = {item['name']: item.get('value') for item in spec['spec']['template']['spec']['containers'][0]['env']
            if item['name'] in ('GCP_ADAPTERS_ENABLED', 'GCP_SQL_ENABLED')}
sql = settings.get('GCP_SQL_ENABLED') == 'true'
adapters = settings.get('GCP_ADAPTERS_ENABLED') == 'true'
token = os.environ.get('HOSTED_ID_TOKEN') or subprocess.check_output(['gcloud','auth','print-identity-token'],text=True).strip()

def request(path, auth=True, method='GET'):
    req = urllib.request.Request(base + path, headers={'Authorization':'Bearer '+token} if auth else {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=50) as response:
            return response.status, response.read(), response.headers
    except urllib.error.HTTPError as error:
        return error.code, error.read(), error.headers

assert request('/health', False)[0] in (401, 403)
status, body, _ = request('/health')
assert status == 200, (stage, status)
health = json.loads(body)
assert (health['source'],health['environment'],health['operationalRoutes']) == (sha,stage,sql), health
assert bool(health.get('cloudAdapters')) == adapters
for path in ('/about','/how-it-works','/why-proinspect'):
    status, body, headers = request(path)
    assert status == 200 and b'ProInspect' in body and headers['X-Robots-Tag'] == 'noindex, nofollow', (path,status)
if sql:
    status, body, _ = request('/api/catalogue')
    assert status == 200 and isinstance(json.loads(body)['services'], list)
    assert request('/api/health')[0] == 200
    assert request('/api/me')[0] in (401,403,404)
    assert request('/internal/jobs/events', method='POST')[0] == 400
else:
    for path in ('/signin','/api/health','/w/staff/operations'):
        assert request(path)[0] == 503
    assert request('/about',method='POST')[0] == 405
assert request('/internal/proof',method='POST')[0] == 204
if adapters:
    status, body, _ = request('/internal/adapters/check',method='POST')
    assert status == 200, ('adapter round trip', stage, status)
    assert all(value is True for value in json.loads(body).values())
print(json.dumps({'environment':stage,'url':base,'source':sha,'checks':10+int(adapters),
                  'passed':True,'anonymousDenied':True,'adapters':adapters,'sql':sql}))
