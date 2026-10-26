import {Link,useLoaderData,useSearchParams,type LoaderFunctionArgs} from 'react-router';
import {platformEnv} from '../../../../packages/database/context';
import {publicCatalogue} from '../../worker/features/v4-service-requests.server';
export const meta=()=>[{title:'Property service requests | ProInspect'},{name:'robots',content:'noindex,nofollow'}];
export async function loader({request,context}:LoaderFunctionArgs){
 const sector=new URL(request.url).searchParams.get('sector')||undefined;
 return publicCatalogue(platformEnv(context),sector);
}
export default function V4Services(){
 const {services,enabled,disclaimer}=useLoaderData<typeof loader>();const [params,setParams]=useSearchParams();
 const sector=params.get('sector')||'all';const categories=[...new Set(services.map(x=>x.category))];
 return <div className="site section"><div className="site-container stack">
  <p className="eyebrow">Pay as you go · Property services</p><h1>Request a ProInspect service</h1>
  <p>Select an inspection, document, lease administration, maintenance, records or reporting service. You do not need to subscribe to enquire.</p>
  {!enabled&&<div className="notice" role="status"><strong>New service-request checkout is not yet activated.</strong>
   <p>Listed fees and specialist workflows require final operating and legal approval. Existing booking arrangements remain available.</p>
   <Link to="/contact">Request assistance</Link></div>}
  <label>Property sector <select value={sector} onChange={e=>setParams(e.target.value==='all'?{}:{sector:e.target.value})}>
   <option value="all">Residential and Commercial</option><option value="residential">Residential</option><option value="commercial">Commercial</option>
  </select></label>
  <p className="small">{disclaimer}</p>
  {categories.map(c=><section key={c} className="stack"><h2>{c}</h2><div className="grid-2">
   {services.filter(s=>s.category===c).map(s=><article className="panel stack" key={s.id}>
    <p className="eyebrow">{s.id} · {s.sector}</p><h3>{s.name}</h3><p>{s.description}</p>
    <p><strong>{s.feeText}</strong> · {s.pricing.unit}</p><p className="small">{s.pricing.note}</p>
    <Link className="button secondary" to={'/guest/request/'+s.id}>{s.requestStatus==='quotation'?'Request a quotation':'Request this service'}</Link>
   </article>)}
  </div></section>)}
  {!services.length&&<p>Services will appear here once the catalogue and public intake are approved.</p>}
  <p>Existing property subscribers should continue to request included services through their authorised portal.</p>
 </div></div>;
}
