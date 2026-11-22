import { Link } from 'react-router';
import { useWorkspace } from '../lib/workspace';
import { PageHeading, EmptyState } from '../../../../packages/ui/components';
export default function CoLivingDirectory(){
  const d=useWorkspace();
  const properties=d.properties.filter(p=>p.sector==='residential');
  return <>
    <PageHeading eyebrow="Residential" title="Co-living & shared residences"
      description="Manage individual private rooms or beds within one authorised residential property, with resident-specific invitations and shared-area maintenance."/>
    <div className="stack">
      {d.workspace.kind==='landlord'&&<section className="panel">
        <h2>Property onboarding and establishment</h2>
        <p>Request a Co-Living assessment, review investment proposals and follow the six-stage property setup.</p>
        <Link className="button" to={d.workspace.href+'/co-living-onboardings'}>Co-Living onboarding</Link>
      </section>}
      {properties.length?<section className="workspace-grid">
        {properties.map(p=><article className="workspace-card" key={p.id}>
          <h2>{p.address}</h2><p>{p.suburb} · {p.property_type}</p>
          <Link className="button secondary" to={d.workspace.href+'/properties/'+encodeURIComponent(p.id)+'/co-living'}>Manage rooms & shared areas</Link>
        </article>)}
      </section>:<EmptyState title="No residential properties available" description="Add or obtain authorised access to a residential property before configuring co-living."/>}
    </div>
  </>;
}
