import { Link } from 'react-router';
import { useWorkspace } from '../lib/workspace';
import { PageHeading } from '../../../../packages/ui/components';
export default function OccupantPremises() {
  const data=useWorkspace(), o=data.occupancy;
  if(!o || data.workspace.kind!=='commercial-occupant')return null;
  return <>
    <PageHeading eyebrow="Resident & Member · Commercial" title="My commercial premises"
      description="Only the property and premises linked to your verified invitation are visible."/>
    <section className="panel stack">
      <h2>{o.address}</h2>
      <p><strong>Premises:</strong> {o.premises_label}</p>
      <p><strong>Relationship:</strong> {o.relationship_kind.replaceAll('_',' ')}</p>
      <p><strong>Effective from:</strong> {o.starts_at}</p>
      <p><strong>Valid until:</strong> {o.ends_at ?? 'Until ended by the authorised manager'}</p>
      <p className="small">This access does not grant lease management, building administration, residential tenancy, financial approvals or documents issued to other people.</p>
      <Link className="button secondary" to={data.workspace.href+'/occupant-requests'}>My requests</Link>
    </section>
  </>;
}
