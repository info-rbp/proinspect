import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace } from '../lib/workspace';
import { PageHeading } from '../../../../packages/ui/components';

export async function loader({request,context,params}:LoaderFunctionArgs){
  return loadApi(request,context,`/api/w/${params.kind}/${params.scopeId}/my-room`);
}
export default function MyRoom(){
  const d=useWorkspace();
  const data=useLoaderData<typeof loader>() as {
    space:{label:string;space_type:string;address:string}|null;
    sharedAreas:{label:string}[];
    terms?:{rent_cents:number|null;rent_period:string;expected_bond_cents:number|null;
      utility_basis:string;agreement_document_id:string|null}|null;
    sharedInspections?:{id:string;inspected_at:string;public_summary:string;area:string}[];
  };
  return <>
    <PageHeading title="My residence" eyebrow="Resident Portal"
      description="Your private occupancy and shared living areas. Other occupants' tenancy and private records are not visible."/>
    <div className="stack">
      {data.space?<section className="panel stack">
        <h2>{data.space.address}</h2>
        <p><strong>Assigned {data.space.space_type}:</strong> {data.space.label}</p>
        <h3>Shared areas</h3>
        {data.sharedAreas.length?data.sharedAreas.map((area,i)=><p key={i}>{area.label}</p>):<p>No shared areas recorded.</p>}
      </section>:<section className="panel"><h2>No separate room or bed recorded</h2>
        <p>Your invitation gives access to your tenancy information and documents; not every residential property uses co-living allocations.</p>
      </section>}
      {data.terms&&<section className="panel stack">
        <h2>My reviewed occupancy terms</h2>
        <p>These are operational figures from your verified tenancy record, not proof of a signed agreement or lodged bond.</p>
        <p>Rent: <strong>{data.terms.rent_cents===null?'Not recorded':
          (data.terms.rent_cents/100).toLocaleString('en-AU',{style:'currency',currency:'AUD'})+' / '+data.terms.rent_period}</strong></p>
        <p>Expected bond: <strong>{data.terms.expected_bond_cents===null?'Not recorded':
          (data.terms.expected_bond_cents/100).toLocaleString('en-AU',{style:'currency',currency:'AUD'})}</strong></p>
        <p>Utilities: {data.terms.utility_basis.replaceAll('_',' ')}</p>
      </section>}
      {(data.sharedInspections?.length??0)>0&&<section className="panel stack">
        <h2>Shared-area condition updates</h2>
        {data.sharedInspections?.map(i=><article className="record-row" key={i.id}>
          <div><strong>{i.area}</strong>
            <p className="small">{new Date(i.inspected_at).toLocaleDateString('en-AU')}</p>
            <p>{i.public_summary}</p>
          </div>
        </article>)}
      </section>}
      <div className="actions">
        <Link className="button secondary" to={d.workspace.href+'/tenancies/'+encodeURIComponent(d.workspace.scopeId)}>My tenancy</Link>
        <Link className="button secondary" to={d.workspace.href+'/requests'}>My requests</Link>
      </div>
    </div>
  </>;
}
