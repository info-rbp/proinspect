"""Read resource metadata only; never access secret versions, objects or database rows."""
import concurrent.futures,json,subprocess,sys
project='proinspect-property-services'
checks={
 'project':['projects','describe',project,'--format=json(projectId,projectNumber,lifecycleState)'],
 'services':['services','list','--enabled','--format=json(config.name)'],
 'assets':['asset','search-all-resources','--scope=projects/'+project,'--format=json(name,assetType,location,createTime)'],
 'run':['run','services','list','--platform=managed','--format=json(metadata.name,status.url,status.latestReadyRevisionName)'],
 'sql':['sql','instances','list','--format=json(name,region,databaseVersion,settings.tier)'],
 'buckets':['storage','buckets','list','--format=json(name,location,uniform_bucket_level_access,public_access_prevention)'],
 'secrets':['secrets','list','--format=json(name,replication,labels)'],
 'accounts':['iam','service-accounts','list','--format=json(email,disabled)'],
 'registry':['artifacts','repositories','list','--location=all','--format=json(name,format)'],
 'tasks':['tasks','queues','list','--location=australia-southeast1','--format=json(name,state,rateLimits,retryConfig)'],
 'scheduler':['scheduler','jobs','list','--location=australia-southeast1','--format=json(name,schedule,timeZone,state)'],
 'pools':['iam','workload-identity-pools','list','--location=global','--format=json(name,state)'],
}
def run(item):
 key,args=item
 p=subprocess.run(['gcloud',*args,'--project='+project,'--quiet'],text=True,capture_output=True)
 return key,{'ok':p.returncode==0,'data':json.loads(p.stdout) if p.returncode==0 else None,'error':p.stderr.strip() if p.returncode else None}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:result=dict(ex.map(run,checks.items()))
json.dump(result,sys.stdout,indent=2);print()
if any(not v['ok'] for v in result.values()):sys.exit(1)
