import {data,Link,useLoaderData,type LoaderFunctionArgs} from 'react-router';
import {runtimeContext} from '../../../../packages/database/context';
import {AppError,type Env} from '../../../../packages/database/types';
import {temporaryPackageAccess} from '../../../platform/worker/features/rental-temporary-documents.server';
import {ANSWER_STEPS,FIELDS,type Form18Answers} from '../../../../packages/marketing/form18';
import {repeaterSummary} from '../../../../packages/marketing/rental-repeaters';
import '../../../../packages/ui/rental-application.css';
export const meta=()=>[{title:'Private rental application package | ProInspect'},{name:'robots',content:'noindex, nofollow, noarchive'},{name:'referrer',content:'no-referrer'}];
export async function loader({context,params}:LoaderFunctionArgs){
 const env=context.get(runtimeContext).env as Env;
 try{const result=await temporaryPackageAccess(env,params.token??'');if(result instanceof Response)throw new Error('Unexpected document response');return data({...result,token:params.token!},{headers:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow, noarchive','Referrer-Policy':'no-referrer'}});}
 catch(error){if(error instanceof AppError)throw new Response(error.message,{status:error.status,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});throw error;}
}
export default function RentalPackage(){
 const d=useLoaderData<typeof loader>(),snapshot=d.snapshot as {reference:string;property:string;submittedAt:string;applicants:{ordinal:number;answers:Form18Answers}[]};
 return <main className="rental-shell"><div className="rental-intro"><p className="eyebrow">Private rental application</p><h1>{snapshot.reference}</h1><p>{snapshot.property}</p><p>For the authorised landlord or representative and ProInspect only. Do not forward this link. Access ends {new Date(d.expiresAt).toLocaleString('en-AU')}.</p></div>
  {snapshot.applicants.map(person=><section className="rental-card" key={person.ordinal}><h2>Applicant {person.ordinal}: {person.answers.identity.fullName}</h2>
   {ANSWER_STEPS.map(step=><section key={step}><h3>{step.replaceAll('_',' ')}</h3><dl>{FIELDS[step].filter(field=>person.answers[step]?.[field.key]).map(field=><div key={field.key}><dt>{field.label}</dt><dd>{person.answers[step][field.key]}</dd></div>)}{(['additionalHistory','additionalReferences'] as const).flatMap(key=>repeaterSummary(key,person.answers[step]?.[key])).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>)}
  </section>)}
  <section className="rental-card"><h2>Approved supporting documents</h2><p>These files have recorded manual antivirus review. Download only for this application and retain them under your own lawful privacy and retention arrangements.</p><ul>{d.documents.map(doc=><li key={doc.id}><a href={'/api/public/rental-package/'+d.token+'/documents/'+doc.id}>{doc.filename}</a></li>)}</ul>{d.documents.length===0&&<p>No supporting files were included.</p>}<p>Submitting this application does not create a tenancy agreement or approve a tenant.</p><Link to="/privacy">Privacy policy</Link></section>
 </main>;
}
