/** Non-mutating HTTP smoke tests against the dedicated V3 staging Worker only. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const ORIGIN='https://proinspect-v3-staging.delicate-dream-e4c9.workers.dev';
if(process.env.GITHUB_REF!=='refs/heads/version-3-enhancements')
 throw new Error('Staging smoke must run on version-3-enhancements.');
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const results=[];
async function inspect(path,expectStatus=200,expectNoIndex=false){
  const response=await fetch(ORIGIN+path,{redirect:'manual',headers:{Accept:'application/json'},
   signal:AbortSignal.timeout(20000)});
  const robots=response.headers.get('x-robots-tag')??'';
  const ok=response.status===expectStatus&&(!expectNoIndex||/noindex/i.test(robots));
  results.push({path,status:response.status,expectedStatus:expectStatus,noindex:robots,ok});
  if(!ok){
    // All staging fixtures are synthetic. Capture bounded diagnostic headers,
    // not response bodies, authentication cookies or user data.
    console.error('Staging route diagnostic',JSON.stringify({
      path,expectedStatus:expectStatus,actualStatus:response.status,
      contentType:response.headers.get('content-type'),
      workerHeader:response.headers.get('x-frame-options')??null,
      cfRayPresent:Boolean(response.headers.get('cf-ray')),
      robots,
    }));
    throw new Error('Staging HTTP gate failed for '+path+' status '+response.status);
  }
  return response;
}
try{
 const health=await inspect('/api/health');
 const json=await health.json();
 if(!json.ok||!json.bindings?.database||!json.bindings?.documents||!json.bindings?.scheduler||
    !json.bindings?.queue)throw new Error('Staging Worker health lacks required bindings.');
 const sourceCheck=json.source??null;
 if(sourceCheck&&sourceCheck!==source)throw new Error('Hosted Worker source not exact workflow commit.');
 await inspect('/',200,true);
 await inspect('/services',200,true);
 await inspect('/properties-for-lease',200,true);
 await inspect('/open-home/check-in',200,true);
 await inspect('/api/public/open-home/sessions',200);
 await inspect('/api/guest/report?token='+('f'.repeat(64)),404);
 mkdirSync('artifacts',{recursive:true});
 const report={status:'PASS',sourceSha:source,hostedSource:sourceCheck,origin:ORIGIN,
  containsCustomerData:false,productionWorkerNotTargeted:true,results,at:new Date().toISOString()};
 writeFileSync('artifacts/v3-staging-smoke.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}catch(error){
 mkdirSync('artifacts',{recursive:true});
 const report={status:'FAIL',sourceSha:source,origin:ORIGIN,
  failure:error instanceof Error?error.message:'Unknown smoke failure',
  results,at:new Date().toISOString()};
 writeFileSync('artifacts/v3-staging-smoke.json',JSON.stringify(report,null,2)+'\n');
 console.error(report.failure);
 process.exitCode=1;
}
