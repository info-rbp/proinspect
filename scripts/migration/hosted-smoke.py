"""IAM token is held in memory only; output contains fixed check results, never headers."""
import json,os,subprocess,sys,urllib.request,urllib.error
stage,sha=sys.argv[1:]
assert stage in ('dev','staging') and len(sha)==40
project='proinspect-property-services';region='australia-southeast1'
base=subprocess.check_output(['gcloud','run','services','describe','proinspect-migration-'+stage,'--project='+project,'--region='+region,'--format=value(status.url)'],text=True).strip()
# gcloud user tokens work for local smoke; CI's federated SA must impersonate itself with audience.
account=subprocess.check_output(['gcloud','config','get-value','account'],text=True,stderr=subprocess.DEVNULL).strip()
args=['gcloud','auth','print-identity-token']
if account.endswith('.gserviceaccount.com'): args += ['--audiences='+base]
token=os.environ.get('HOSTED_ID_TOKEN') or subprocess.check_output(args,text=True).strip()
def request(path,auth=True,method='GET'):
 req=urllib.request.Request(base+path,headers={'Authorization':'Bearer '+token} if auth else {},method=method)
 try:
  with urllib.request.urlopen(req,timeout=30) as r:return r.status,r.read(),r.headers
 except urllib.error.HTTPError as e:return e.code,e.read(),e.headers
status,_,_=request('/healthz',False);assert status in (401,403),status
status,body,_=request('/healthz');assert status==200,(stage,status)
health=json.loads(body);assert health['source']==sha and health['operationalRoutes'] is False
for path in ('/about','/how-it-works','/why-proinspect'):
 status,body,headers=request(path);assert status==200 and b'ProInspect' in body and headers['X-Robots-Tag']=='noindex, nofollow'
for path in ('/signin','/api/health','/w/staff/operations'):
 assert request(path)[0]==503
assert request('/about',method='POST')[0]==405
assert request('/internal/proof',method='POST')[0]==204
print(json.dumps({'environment':stage,'url':base,'source':sha,'checks':10,'passed':True,'anonymousDenied':True}))
