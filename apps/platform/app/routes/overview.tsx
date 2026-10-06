import { Link } from 'react-router';
import { useWorkspace } from '../lib/workspace';
import { PageHeading, Metric, Badge, EmptyState } from '../../../../packages/ui/components';
import { displayDate } from '../../../../packages/domain/index';
export default function Overview() {
  const d = useWorkspace();
  const w = d.workspace;
  const active = d.requests.filter((r) => !['closed', 'completed'].includes(r.status));
  const upcoming = d.bookings.filter(
    (b) => b.status === 'confirmed' && b.starts_at > new Date().toISOString(),
  );
  const openOrders = d.workOrders.filter((o) => !['cancelled', 'completed'].includes(o.status));
  if (['strata-manager', 'building', 'council'].includes(w.kind))
    return (
      <>
        <PageHeading
          title={
            w.kind === 'strata-manager'
              ? 'Your strata portfolio'
              : w.kind === 'council'
                ? 'Understand and decide.'
                : 'Your building, connected.'
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
          w.kind === 'staff'
            ? 'Operations at a glance'
            : w.kind === 'tenant'
              ? 'Your tenancy'
              : 'Your property overview'
        }
        title={
          w.kind === 'staff'
            ? 'Keep the work moving.'
            : w.kind === 'property-manager'
              ? 'Your managed portfolio'
              : w.kind === 'commercial'
                ? 'Your commercial portfolio'
                : `Welcome${d.user.display_name ? ', ' + d.user.display_name.split(' ')[0] : ''}.`
        }
        description={
          w.kind === 'tenant'
            ? 'Follow requests, see upcoming inspections and access documents issued to your tenancy.'
            : 'Your properties, upcoming work and latest reports, in one place.'
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
            value={d.propertyTotal}
            detail={w.kind === 'staff' ? 'Within your staff scope' : 'Linked to this workspace'}
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
              <h2>{w.kind === 'staff' ? 'Work requiring attention' : 'Your properties'}</h2>
              <Link
                className="small"
                to={`${w.href}/${w.kind === 'staff' ? 'work-orders' : 'properties'}`}
              >
                {w.kind === 'tenant' ? '' : 'View all →'}
              </Link>
            </div>
            {w.kind === 'staff' ? (
              openOrders.length ? (
                <div className="record-list">
                  {openOrders.slice(0, 6).map((o) => (
                    <div className="record-row" key={o.id}>
                      <div>
                        <Link className="record-title" to={`${w.href}/work-orders#${o.id}`}>
                          {o.title}
                        </Link>
                        <p>
                          {o.address} · {o.reference}
                        </p>
                      </div>
                      <Badge status={o.status} />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No work is waiting"
                  description="New bookings and requests will appear here for your team."
                />
              )
            ) : d.properties.length ? (
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
