import {Link} from 'react-router';
import {useWorkspace} from '../lib/workspace';
import {PageHeading} from '../../../../packages/ui/components';

/** Read-only, relationship-scoped view of existing notification deliveries.
 * Never exposes member directories, unreviewed posts, or scheme-wide private records.
 */
export default function CommunityUpdates(){
  const d=useWorkspace(),w=d.workspace;
  const permitted=['building','council','strata-manager','building-manager'].includes(w.kind);
  const notices=d.notifications??[];
  if(!permitted)return <section className="panel stack">
    <h1>Community access unavailable</h1>
    <p>Only a verified building, council or strata relationship can access this notice area.</p>
    <Link to={w.href}>Return to your workspace</Link>
  </section>;
  return <>
    <PageHeading eyebrow="Strata and Resident" title="Community & building updates"
      description="Your own authorised notices, building updates and relevant account messages. Recipients are checked through current membership and notice-targeting rules; private tenancy records are not shared."/>
    <div className="stack">
      <div className="actions">
        {w.kind==='building'&&<Link className="button secondary" to={w.href+'/requests'}>Report a common-property issue</Link>}
        {w.kind==='strata-manager'&&<Link className="button secondary" to={w.href+'/building-communications'}>Manage reviewed building notices</Link>}
        {w.kind==='building-manager'&&<Link className="button secondary" to={w.href+'/building-communications'}>Review notice drafts</Link>}
      </div>
      {notices.length?notices.map(n=><section className="panel stack" key={n.id}>
        <div><h2>{n.title}</h2>
          <p className="small">{new Date(n.created_at).toLocaleDateString('en-AU')}</p>
        </div>
        <p>{n.message}</p>
        {typeof n.href==='string'&&n.href.startsWith('/')&&!n.href.startsWith('//')&&
          <Link className="button secondary" to={n.href}>Open authorised record</Link>}
      </section>):<section className="panel stack">
        <h2>No current updates</h2>
        <p>New manager-reviewed notices will appear only if your current building or council membership permits delivery.</p>
      </section>}
      <p className="small">Community chat, member directories, event payments and amenity charging are not enabled. Published notices are not a substitute for statutory service or a formal scheme resolution.</p>
    </div>
  </>;
}
