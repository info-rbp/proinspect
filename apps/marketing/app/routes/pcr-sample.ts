import {runtimeContext} from '../../../../packages/database/context';
import type {Env} from '../../../../packages/database/types';
import type {LoaderFunctionArgs} from 'react-router';
import {releaseFeatureReady} from '../../../platform/worker/features/release-governance.server';
/** Only approved, exact-hash public sample bytes; an R2 filename is not publication consent. */
export async function loader({context}:LoaderFunctionArgs){
 const env=context.get(runtimeContext).env as Env;
 let approved=false;try{approved=await releaseFeatureReady(env,'pcr_sample');}catch{/* Standalone marketing has no release datastore. */}
 if(!approved||!/^[a-f0-9]{64}$/.test(env.PCR_SAMPLE_SHA256??''))throw new Response('No approved sample is published.',{status:404});
 const file=await env.DOCUMENTS?.get('marketing/approved-samples/property-condition-report.pdf');
 if(!file||file.size>10*1024*1024)throw new Response('No approved sample is published.',{status:404});
 const bytes=await file.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!==env.PCR_SAMPLE_SHA256||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw new Response('No approved sample is published.',{status:404});
 return new Response(bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="ProInspect-Sample-PCR.pdf"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex'}});
}
