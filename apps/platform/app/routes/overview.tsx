import { Link } from 'react-router';
import { ClientDashboard } from '../components/ClientDashboard';
import { useWorkspace, type WorkspaceData, type RecordRow } from '../lib/workspace';
import { PageHeading, Metric, Badge, EmptyState } from '../../../../packages/ui/components';
import { displayDate } from '../../../../packages/domain/index';
/** Staff-specific action centre. Counts are derived from the authorised workspace response. */
function StaffToday({ data }: { data: WorkspaceData }) {
  const base = data.workspace.href;
  const localDay = (value: Date) => new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Perth', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value);
  const today = localDay(new Date());
  const dueBookings = data.bookings.filter(b =>
    ['confirmed', 'scheduled'].includes(b.status) &&
    Number.isFinite(Date.parse(String(b.starts_at ?? ''))) &&
    localDay(new Date(b.starts_at)) === today);
  const reviewOrders = data.workOrders.filter(o => ['report_pending', 'under_review', 'awaiting_review'].includes(o.status));
  const openOrders = data.workOrders.filter(o => !['completed', 'cancelled', 'closed'].includes(o.status));
  const exceptions = data.payments.filter(p => ['failed', 'payment_required'].includes(p.status)).length
    + data.approvals.filter(a => a.status === 'pending').length;
  const recent: Array<RecordRow & {category: string; path: string}> = [...data.workOrders.map((row): RecordRow & {category: string; path: string} => ({...row, category: 'Work order', path: `${base}/work-orders/${row.id}` })),
    ...data.bookings.map((row): RecordRow & {category: string; path: string} => ({...row, category: 'Booking', path: `${base}/bookings` }))]
    .sort((a, b) => String(b.updated_at ?? b.created_at ?? b.starts_at ?? '').localeCompare(String(a.updated_at ?? a.created_at ?? a.starts_at ?? '')))
    .slice(0, 6);
  return <>
    <PageHeading eyebrow="Operations / Today" title="Today's work" description="Priority actions, upcoming bookings and the work that needs a decision.">
      <Link className="button" to={base+'/bookings'}>View schedule</Link>
    </PageHeading>
    <section className="grid-4 portal-summary" aria-label="Staff work summary">
      <Link className="portal-summary-link" to={base+'/bookings'}><Metric label="Bookings due" value={dueBookings.length} detail="Scheduled for today" /></Link>
      <Link className="portal-summary-link" to={base+'/reports'}><Metric label="Reports to review" value={reviewOrders.length} detail="Awaiting review" /></Link>
      <Link className="portal-summary-link" to={base+'/work-orders'}><Metric label="Open work" value={openOrders.length} detail="Active work orders" /></Link>
      <Link className="portal-summary-link" to={base+'/finance'}><Metric label="Exceptions" value={exceptions} detail="Financial and approval items" /></Link>
    </section>
    <div className="detail-grid portal-today-grid">
      <section className="panel">
        <div className="panel-header"><h2>Work requiring attention</h2><Link className="small" to={base+'/work-orders'}>View all work</Link></div>
        {openOrders.length ? <div className="record-list">
          {openOrders.slice(0, 6).map(o => <div className="record-row" key={o.id}>
            <div><Link className="record-title" to={base+'/work-orders/'+o.id}>{o.title || o.reference || 'Work order'}</Link>
              <p>{[o.address, o.reference].filter(Boolean).join(' · ')}</p></div><Badge status={o.status}/></div>)}
        </div> : <EmptyState title="No active work orders" description="Assigned work will appear here when it requires action." />}
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Today's schedule</h2><Link className="small" to={base+'/bookings'}>Open schedule</Link></div>
        {dueBookings.length ? <div className="record-list">{dueBookings.slice(0, 6).map(b =>
          <div className="record-row" key={b.id}><div><div className="record-title">{b.service_name || b.reference || 'Inspection booking'}</div>
            <p>{[b.address, b.starts_at ? displayDate(b.starts_at) : null].filter(Boolean).join(' · ')}</p></div>
            <Badge status={b.status}/></div>)}</div>
          : <EmptyState title="No bookings due today" description="The schedule will show confirmed visits due today." />}
      </section>
    </div>
    <section className="panel portal-recent-activity">
      <div className="panel-header"><h2>Recent activity</h2><Link className="small" to={base+'/records'}>Browse records</Link></div>
      {recent.length ? <div className="record-list">{recent.map(r => <div className="record-row" key={r.category+':'+r.id}>
        <div><Link className="record-title" to={r.path}>{r.title || r.service_name || r.reference || r.category}</Link>
          <p>{r.category}{r.reference ? ' · '+r.reference : ''}</p></div><Badge status={r.status || 'pending'}/></div>)}</div>
        : <EmptyState title="No recent activity" description="Bookings and work updates will be listed when records are available." />}
    </section>
  </>;
}

export default function Overview() {
  const d = useWorkspace();
  const w = d.workspace;
  if (w.kind === 'staff') return <StaffToday data={d} />;
  if (['landlord','property-manager','commercial','strata-manager'].includes(w.kind)) return <ClientDashboard data={d} />;
  if (w.kind === 'building-manager') return <>
    <PageHeading eyebrow="Building operations" title="Today's building work" description="Manage assigned facilities, resident moves and authorised operational records.">
      <Link className="button" to={w.href+'/facilities'}>Open operations</Link>
    </PageHeading>
    <div className="grid-4 portal-summary">
      <Metric label="Assigned buildings" value={d.schemes.length} detail="Within your assignment" />
      <Metric label="Open issues" value={d.requests.filter(r => !['closed','completed'].includes(r.status)).length} detail="Operational follow-up" />
      <Metric label="Active work" value={d.workOrders.filter(o => !['cancelled','completed'].includes(o.status)).length} detail="Building work orders" />
      <Metric label="Documents" value={d.documents.length} detail="Authorised records" />
    </div>
    <section className="panel"><div className="panel-header"><h2>Building operations</h2><Link to={w.href+'/documents'}>View reports</Link></div>
      <p>Coordinate incidents, daily logs, asset maintenance, site access and resident moves within your delegated authority.</p></section>
  </>;
  const active = d.requests.filter((r) => !['closed', 'completed'].includes(r.status));
  const upcoming = d.bookings.filter(
    (b) => b.status === 'confirmed' && b.starts_at > new Date().toISOString(),
  );
  const openOrders = d.workOrders.filter(o => !['cancelled', 'completed'].includes(o.status));
  if (['strata-manager', 'building', 'council'].includes(w.kind))
    return (
      <>
        <PageHeading
          title={
            w.kind === 'strata-manager'
              ? 'Schemes overview'
              : w.kind === 'council'
                ? 'Council overview'
                : 'Building overview'
          }
          description={
            w.kind === 'strata-manager'
              ? 'Review schemes, resident issues and operational delivery.'
              : w.kind === 'council'
                ? 'Review proposals and building activity without exposing private tenancy records.'
                : 'Read notices, report building issues and follow shared works.'
          }
        />
        <div className="stack">
          <div className="grid-4">
            <Metric label="Schemes" value={d.schemes.length} detail="Within your membership" />
            <Metric label="Open issues" value={active.length} detail="Within your access scope" />
            <Metric label="Active work" value={openOrders.length} detail="Operational updates" />
            <Metric
              label="Decisions"
              value={d.approvals.filter((a) => a.status === 'pending').length}
              detail="Awaiting the authorised party"
            />
          </div>
          {d.schemes.map((s) => (
            <section className="panel" key={s.id}>
              <h2>{s.name}</h2>
              <p>Scheme {s.scheme_number}</p>
              <div className="actions">
                <Link className="button" to={`${w.href}/schemes/${s.id}`}>
                  Open building workspace
                </Link>
                {w.kind !== 'building' && (
                  <Link className="button secondary" to={`${w.href}/finance`}>
                    Review decisions
                  </Link>
                )}
              </div>
            </section>
          ))}
          {!d.schemes.length && w.kind === 'strata-manager' && (
            <Link className="button" to={`${w.href}/schemes`}>
              Set up your first scheme
            </Link>
          )}
        </div>
      </>
    );
  return (
    <>
      <PageHeading
        eyebrow={
          w.kind === 'tenant' ? 'Your tenancy'
            : w.kind === 'property-manager' ? 'Property management'
            : w.kind === 'commercial' ? 'Commercial operations'
            : 'Residential property operations'
        }
        title={
          w.kind === 'property-manager' ? 'Managed portfolio'
            : w.kind === 'commercial' ? 'Commercial portfolio'
            : w.kind === 'tenant' ? 'Tenancy overview'
            : 'Property overview'
        }
        description={
          w.kind === 'tenant'
            ? 'Review maintenance requests, scheduled inspections and documents issued to your tenancy.'
            : w.kind === 'property-manager'
              ? 'Monitor assigned properties, client requests, scheduled work and operational decisions.'
              : w.kind === 'commercial'
                ? 'Track your commercial properties, inspections, lease obligations and related work.'
                : 'Review your residential properties, upcoming inspections, requests and issued reports.'
        }
      >
        {['landlord', 'property-manager', 'commercial'].includes(w.kind) && (
          <Link className="button" to={`${w.href}/book`}>
            + Book a service
          </Link>
        )}
      </PageHeading>
      <div className="stack">
        <section className="grid-4" aria-label="Workspace summary">
          <Metric
            label="Properties"
            value={d.properties.length}
            detail="Linked to this workspace"
          />
          <Metric
            label="Upcoming"
            value={w.kind === 'tenant' ? d.inspections.length : upcoming.length}
            detail="Scheduled property visits"
          />
          <Metric label="Open requests" value={active.length} detail="Being reviewed or actioned" />
          <Metric
            label="Reports & documents"
            value={d.documents.length}
            detail="Available in your workspace"
          />
        </section>
        {(d.approvals.some((a) => a.status === 'pending') ||
          d.payments.some((p) => ['pending', 'payment_required', 'failed'].includes(p.status)) ||
          d.plans.some(
            (p) => p.status === 'active' && p.next_due <= new Date().toISOString().slice(0, 10),
          )) && (
          <section className="panel">
            <div className="panel-header">
              <h2>Decisions and due work</h2>
            </div>
            <div className="actions">
              {d.approvals.some((a) => a.status === 'pending') && (
                <Link className="button" to={`${w.href}/finance`}>
                  {d.approvals.filter((a) => a.status === 'pending').length} approvals requiring a
                  decision
                </Link>
              )}
              {d.payments.some((p) =>
                ['pending', 'payment_required', 'failed'].includes(p.status),
              ) && (
                <Link className="button secondary" to={`${w.href}/finance`}>
                  Review payment requests
                </Link>
              )}
              {d.plans.some(
                (p) => p.status === 'active' && p.next_due <= new Date().toISOString().slice(0, 10),
              ) && (
                <Link className="button secondary" to={`${w.href}/portfolio`}>
                  Schedule due inspections
                </Link>
              )}
            </div>
          </section>
        )}
        <div className="detail-grid">
          <section className="panel">
            <div className="panel-header">
              <h2>Your properties</h2>
              <Link
                className="small"
                to={`${w.href}/properties`}
              >
                {w.kind === 'tenant' ? '' : 'View all →'}
              </Link>
            </div>
            {d.properties.length ? (
              d.properties.slice(0, 5).map((p) => (
                <div className="record-row" key={p.id}>
                  <div>
                    <Link
                      className="record-title"
                      to={
                        w.kind === 'tenant' ? `${w.href}/tenancies` : `${w.href}/properties/${p.id}`
                      }
                    >
                      {p.address}
                    </Link>
                    <p>
                      {p.suburb} {p.state} {p.postcode}
                    </p>
                  </div>
                  <span className="badge">{p.property_type}</span>
                </div>
              ))
            ) : (
              <EmptyState
                title="Add your first property"
                description="Your bookings and issued reports will be organised under the property."
              >
                <Link className="button" to={`${w.href}/properties`}>
                  Add property
                </Link>
              </EmptyState>
            )}
          </section>
          <section className="panel">
            <div className="panel-header">
              <h2>What happens next</h2>
            </div>
            {active.length ? (
              <div className="record-list">
                {active.slice(0, 4).map((r) => (
                  <div key={r.id} className="record-row">
                    <div>
                      <Link className="record-title" to={`${w.href}/requests/${r.id}`}>
                        {r.title}
                      </Link>
                      <p>
                        {r.status === 'submitted'
                          ? 'ProInspect will review this request.'
                          : 'Follow the latest request status.'}
                      </p>
                      <div style={{ marginTop: 8 }}>
                        <Badge status={r.status} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Nothing needs your attention"
                description="Requests and work needing a next step will appear here."
              />
            )}
          </section>
        </div>
        <section className="panel">
          <div className="panel-header">
            <h2>Latest documents</h2>
            <Link className="small" to={`${w.href}/documents`}>
              All documents →
            </Link>
          </div>
          {d.documents.length ? (
            d.documents.slice(0, 3).map((doc) => (
              <div className="record-row" key={doc.id}>
                <div>
                  <div className="record-title">{doc.title}</div>
                  <p>
                    {doc.address} · {displayDate(doc.issued_at || doc.created_at)}
                  </p>
                </div>
                <a
                  className="button secondary small"
                  href={`/api${d.workspace.href}/documents/${doc.id}/download`}
                >
                  Download PDF
                </a>
              </div>
            ))
          ) : (
            <EmptyState
              title="Your property record starts here"
              description="When ProInspect issues a report to you, it will be available here and under your property."
            />
          )}
        </section>
      </div>
    </>
  );
}
