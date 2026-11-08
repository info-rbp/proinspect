import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace } from '../lib/workspace';
import { Badge, EmptyState, PageHeading, PortalPanel, PortalStat } from '../../../../packages/ui/components';
import { displayDate } from '../../../../packages/domain/index';

type StaffReport = {id:string; status:string; updated_at:string; work_order_reference:string; report_type:string};
export async function loader({request, context, params}:LoaderFunctionArgs) {
  // The Staff register applies its own assignment and role restrictions.
  // Do not obtain the organisation-wide report list for a customer dashboard.
  if(params.kind !== 'staff') return {staffReports: [] as StaffReport[]};
  const result = await loadApi(request, context, '/api/w/staff/' + params.scopeId + '/reports') as {reports?:StaffReport[]};
  return {staffReports:result.reports ?? []};
}
const finished = (status:string) => ['closed','completed','cancelled','archived'].includes(status);
const pending = (status:string) => status === 'pending';
const localDate = (date:Date) => {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone:'Australia/Perth', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(date);
  const value = (name:string) => parts.find(part=>part.type===name)?.value ?? '';
  return value('year') + '-' + value('month') + '-' + value('day');
};
const isDueToday = (iso:string, today:string) => {
  if (!iso || Number.isNaN(Date.parse(iso))) return false;
  return localDate(new Date(iso)) === today;
};
type DashboardTile = {label:string;value:number|string;detail:string;path:string};
const copy:Record<string,{eyebrow:string;title:string;description:string}> = {
  staff:{eyebrow:'Operations',title:'Today',description:'Priority actions, scheduled visits and work requiring review.'},
  landlord:{eyebrow:'Residential',title:'Property overview',description:'Your properties, booked visits and outstanding requests.'},
  'property-manager':{eyebrow:'Agency',title:'Portfolio overview',description:'Managed properties, service delivery and decisions within your authority.'},
  commercial:{eyebrow:'Commercial',title:'Commercial portfolio',description:'Your commercial properties, service visits and open work.'},
  'strata-manager':{eyebrow:'Strata',title:'Scheme operations',description:'Schemes, resident issues and work across your appointed portfolio.'},
  tenant:{eyebrow:'Tenancy',title:'My tenancy',description:'Follow inspections, requests and documents shared with you.'},
  building:{eyebrow:'Building',title:'Building overview',description:'Shared-property requests, operational updates and authorised documents.'},
  council:{eyebrow:'Council',title:'Council oversight',description:'Review scheme activity and decisions within your council membership.'},
  'building-manager':{eyebrow:'Site operations',title:'Building operations',description:'Site work, notice drafts and documents within your assigned buildings.'},
};
export default function Overview() {
  const d = useWorkspace();
  const w = d.workspace;
  const reports = useLoaderData<typeof loader>().staffReports;
  const activeRequests = d.requests.filter(r => !finished(r.status));
  const openOrders = d.workOrders.filter(r => !finished(r.status));
  const upcoming = d.bookings.filter(b => b.status === 'confirmed' && b.starts_at > new Date().toISOString());
  const pendingApprovals = d.approvals.filter(a => pending(a.status));
  const issuedDocuments = d.documents.filter(x => x.status === 'issued');
  const needsReview = reports.filter(r => r.status === 'submitted');
  const exceptions = openOrders.filter(r => r.priority === 'emergency').length +
    d.payments.filter(p => ['failed','payment_required'].includes(p.status)).length;
  const today = localDate(new Date());
  const due = d.bookings.filter(b => b.status === 'confirmed' && isDueToday(b.starts_at,today));
  const path = (segment:string) => w.href + '/' + segment;
  const tile = (label:string,value:number|string,detail:string,segment:string):DashboardTile => ({label,value,detail,path:segment});
  const stats:Record<string,DashboardTile[]> = {
    staff:[
      tile('Bookings due',due.length,'Confirmed visits today','bookings'),
      tile('Reports to review',needsReview.length,'Submitted for independent review','reports'),
      tile('Open work',openOrders.length,'Active Work Orders','work-orders'),
      tile('Exceptions',exceptions,'Urgent work and payment exceptions','finance'),
    ],
    landlord:[
      tile('Properties',d.properties.length,'Linked to your account','properties'),
      tile('Upcoming bookings',upcoming.length,'Confirmed visits','bookings'),
      tile('Open requests',activeRequests.length,'Being actioned','requests'),
      tile('Issued reports',issuedDocuments.length,'Authorised documents','documents'),
    ],
    'property-manager':[
      tile('Managed properties',d.properties.length,'Within your approved portfolio','properties'),
      tile('Scheduled visits',upcoming.length,'Confirmed appointments','bookings'),
      tile('Open work',openOrders.length,'Work Orders','work-orders'),
      tile('Approvals due',pendingApprovals.length,'Awaiting a decision','finance'),
    ],
    commercial:[
      tile('Properties',d.properties.length,'Commercial portfolio','properties'),
      tile('Scheduled visits',upcoming.length,'Confirmed appointments','bookings'),
      tile('Open work',openOrders.length,'Operational Work Orders','work-orders'),
      tile('Issued reports',issuedDocuments.length,'Authorised documents','reports'),
    ],
    'strata-manager':[
      tile('Schemes',d.schemes.length,'Within your appointment','schemes'),
      tile('Open issues',activeRequests.length,'Assigned resident or scheme issues','requests'),
      tile('Active work',openOrders.length,'Shared-property work','work-orders'),
      tile('Decisions',pendingApprovals.length,'Pending approvals','finance'),
    ],
    tenant:[
      tile('Tenancies',d.tenancies.length,'Within your access scope','tenancies'),
      tile('Inspections',d.inspections.length,'Linked to your tenancy','inspections'),
      tile('Open requests',activeRequests.length,'Your requests','requests'),
      tile('Documents',d.documents.length,'Available to you','documents'),
    ],
    building:[
      tile('My buildings',d.schemes.length,'Within your membership','schemes'),
      tile('My requests',activeRequests.length,'Reported issues','requests'),
      tile('Shared work',openOrders.length,'Visible operational work','facilities'),
      tile('Documents',d.documents.length,'Building information','documents'),
    ],
    council:[
      tile('Schemes',d.schemes.length,'Within your appointment','schemes'),
      tile('Decisions',pendingApprovals.length,'Proposals for review','finance'),
      tile('Shared works',openOrders.length,'Visible Work Orders','facilities'),
      tile('Documents',d.documents.length,'Authorised records','documents'),
    ],
    'building-manager':[
      tile('Building operations','Open','Assigned operational tools','facilities'),
      tile('Notice drafts','Review','Prepared building communications','building-communications'),
      tile('Authorised reports',d.documents.length,'Shared with your assignment','documents'),
    ],
  };
  const messages = copy[w.kind] ?? copy.landlord;
  const activity = [
    ...d.workOrders.map(o => ({
      key:'wo-'+o.id, title:o.title || o.reference, supporting:o.reference || 'Work order',
      status:o.status, at:o.updated_at || o.created_at, href:path('work-orders/'+o.id),
    })),
    ...(w.kind==='council' ? [] : d.requests.map(r => ({
      key:'rq-'+r.id, title:r.title || r.reference, supporting:r.reference || 'Request',
      status:r.status, at:r.updated_at || r.created_at, href:path('requests/'+r.id),
    }))),
  ].sort((a,b)=>String(b.at??'').localeCompare(String(a.at??''))).slice(0,5);

  if(w.kind==='staff') return (
    <div className="pi-home">
      <PageHeading eyebrow={messages.eyebrow} title={messages.title} description={messages.description} />
      <section className="pi-stat-grid" aria-label="Today's work">
        {stats.staff.map(t=><PortalStat key={t.label} label={t.label} value={t.value} detail={t.detail} to={path(t.path)} />)}
      </section>
      <div className="pi-home-columns">
        <PortalPanel title="Priority actions" description="Your authorised operational queue" to={path('work-orders')} action="View Work Orders">
          {needsReview.length || openOrders.length || due.length ? (
            <div className="pi-task-list">
              {needsReview.slice(0,3).map(r=><Link className="pi-task-row" to={path('reports/'+r.id)} key={r.id}><span><strong>{r.work_order_reference || 'Inspection report'}</strong><small>Report submitted for review</small></span><Badge status={r.status}/></Link>)}
              {openOrders.slice(0,4).map(o=><Link className="pi-task-row" to={path('work-orders/'+o.id)} key={o.id}><span><strong>{o.title || o.reference}</strong><small>{o.address || o.reference || 'Work Order'}</small></span><Badge status={o.status}/></Link>)}
              {due.slice(0,3).map(b=><Link className="pi-task-row" to={path('bookings')} key={b.id}><span><strong>{b.service_name || b.reference}</strong><small>{b.address || 'Scheduled property visit'}</small></span><Badge status={b.status}/></Link>)}
            </div>
          ) : <EmptyState title="No priority items" description="Confirmed visits, submitted reports and open Work Orders will appear here." />}
        </PortalPanel>
        <PortalPanel title="Schedule" description="Upcoming confirmed property visits" to={path('bookings')}>
          {upcoming.length ? upcoming.slice(0,5).map(b=><div className="pi-task-row" key={b.id}><span><strong>{b.service_name || b.reference}</strong><small>{b.address} · {displayDate(b.starts_at)}</small></span><Badge status={b.status}/></div>)
            :<EmptyState title="No upcoming bookings" description="Confirmed appointments appear here."/>}
        </PortalPanel>
      </div>
      <PortalPanel title="Recent activity" description="Recently updated Work Orders and requests within your access scope" to={path('records')} action="Browse records">
        {activity.length ? <div className="pi-activity-list">{activity.map(a=><Link className="pi-task-row" to={a.href} key={a.key}><span><strong>{a.title}</strong><small>{a.supporting} · {a.at ? displayDate(a.at):'Recent record'}</small></span><Badge status={a.status}/></Link>)}</div>
          : <EmptyState title="No recent activity" description="Work Orders and requests will be listed as they are recorded."/>}
      </PortalPanel>
    </div>
  );

  const schemeKind=['strata-manager','building','council'].includes(w.kind);
  const buildingManager=w.kind==='building-manager';
  const propertyDestination=buildingManager?'facilities':schemeKind?'schemes':w.kind==='tenant'?'tenancies':'properties';
  const entityRows:Array<{id:string;name?:string;address?:string;suburb?:string;state?:string;scheme_number?:string}>=buildingManager?[]:schemeKind?d.schemes:w.kind==='tenant'?d.tenancies:d.properties;
  const entityTitle=buildingManager?'Assigned buildings':schemeKind?'Schemes and buildings':w.kind==='tenant'?'My tenancy':'Your properties';
  const actions= w.kind==='council' ? pendingApprovals : activeRequests;
  const actionDestination=w.kind==='council'?'finance':'requests';
  return <div className="pi-home">
    <PageHeading eyebrow={messages.eyebrow} title={messages.title} description={messages.description}>
      {['landlord','property-manager','commercial'].includes(w.kind) && <Link className="button" to={path('book')}>Book a service</Link>}
    </PageHeading>
    <section className="pi-stat-grid" aria-label="Workspace summary">
      {(stats[w.kind] ?? stats.landlord).map(t=><PortalStat key={t.label} label={t.label} value={t.value} detail={t.detail} to={path(t.path)}/>)}
    </section>
    {buildingManager ? (
      <PortalPanel title="Your assigned site" description="Building access does not include private tenancies or other owners' records.">
        <div className="pi-task-list">
          <Link className="pi-task-row" to={path('facilities')}><span><strong>Building operations</strong><small>Site incidents, maintenance and access records</small></span></Link>
          <Link className="pi-task-row" to={path('building-communications')}><span><strong>Notice drafts</strong><small>Prepare notices for independent review</small></span></Link>
          <Link className="pi-task-row" to={path('documents')}><span><strong>Authorised reports</strong><small>Documents shared with this assignment</small></span></Link>
        </div>
      </PortalPanel>
    ) : <div className="pi-home-columns">
      <PortalPanel title={entityTitle} description="Records within this workspace" to={path(propertyDestination)}>
        {entityRows.length ? <div className="pi-task-list">{entityRows.slice(0,5).map(p=>{
          const name=p.name || p.address || 'Tenancy record';
          const href=schemeKind?path('schemes/'+p.id):w.kind==='tenant'?path('tenancies'):path('properties/'+p.id);
          return <Link className="pi-task-row" to={href} key={p.id}><span><strong>{name}</strong><small>{p.suburb ? p.suburb+' '+(p.state||'') : p.scheme_number ? 'Scheme '+p.scheme_number : 'View record'}</small></span></Link>;
        })}</div> : <EmptyState title={w.kind==='landlord'||w.kind==='commercial'?'No properties added':'No records yet'} description="Authorised properties, schemes or tenancy records will appear here.">
          {['landlord','commercial'].includes(w.kind)&&<Link className="button" to={path('properties')}>Add property</Link>}
        </EmptyState>}
      </PortalPanel>
      <PortalPanel title={w.kind==='council'?'Decisions to review':'Requests and follow-up'} description="Items within your authorised workspace" to={path(actionDestination)}>
        {actions.length ? <div className="pi-task-list">{actions.slice(0,5).map(a=>{
          const href=w.kind==='council'?path('finance'):path('requests/'+a.id);
          return <Link className="pi-task-row" to={href} key={a.id}><span><strong>{a.title || a.summary || 'Decision'}</strong><small>{a.reference || 'View details'}</small></span><Badge status={a.status}/></Link>;
        })}</div> : <EmptyState title="Nothing needs attention" description="Open requests and pending decisions will appear here." />}
      </PortalPanel>
    </div>}
    <PortalPanel title="Recent documents" description="Only documents shared with this workspace" to={path('documents')}>
      {d.documents.length ? <div className="pi-task-list">{d.documents.slice(0,4).map(doc=>
        <div className="pi-task-row" key={doc.id}><span><strong>{doc.title}</strong><small>{doc.issued_at || doc.created_at ? displayDate(doc.issued_at || doc.created_at):'Available document'}</small></span>
          {doc.status==='issued'&&<a className="pi-panel-action" href={'/api'+w.href+'/documents/'+doc.id+'/download'}>Download</a>}
        </div>)}</div> : <EmptyState title="No documents shared yet" description="Issued reports and authorised documents will be listed here."/>}
    </PortalPanel>
  </div>;
}
