import { loadApi } from '../lib/api.server';
import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { useWorkspace } from '../lib/workspace';
import { PageHeading, Badge, EmptyState } from '../../../../packages/ui/components';
import { displayDate } from '../../../../packages/domain/index';
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  return loadApi(
    request,
    context,
    `/api/w/${params.kind}/${params.scopeId}/properties/${params.propertyId}`,
  );
}
export default function Property() {
  const d = useWorkspace();
  const { property: p } = useLoaderData<typeof loader>();
  if (!p)
    return (
      <EmptyState
        title="Property unavailable"
        description="This property is not available in your current workspace."
      />
    );
  const bookings = d.bookings.filter((b) => b.property_id === p.id);
  const documents = d.documents.filter((doc) => doc.property_id === p.id);
  const requests = d.requests.filter((r) => r.property_id === p.id);
  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to={`${d.workspace.href}/properties`}>Properties</Link>
        <span>/</span>
        <span>{p.address}</span>
      </nav>
      <PageHeading
        eyebrow={`${p.suburb} · ${p.state} ${p.postcode}`}
        title={p.address}
        description={`${p.property_type} · ${p.sector === 'residential' ? 'Residential property' : p.sector}`}
      >
        {['landlord', 'property-manager', 'commercial', 'strata-manager'].includes(
          d.workspace.kind,
        ) &&
          d.workspace.role !== 'viewer' && (
            <Link className="button" to={`${d.workspace.href}/book?property=${p.id}`}>
              Book a service
            </Link>
          )}
      </PageHeading>
      <div className="stack">
        <Link to={`${d.workspace.href}/records/documents?property=${p.id}`}>
          Browse the full document history
        </Link>
        <div className="grid-2">
          <section className="panel">
            <div className="panel-header">
              <h2>Bookings & inspections</h2>
            </div>
            {bookings.length ? (
              bookings.map((b) => (
                <div className="record-row" key={b.id}>
                  <div>
                    <div className="record-title">{b.service_name}</div>
                    <p>{displayDate(b.starts_at)}</p>
                    <p>{b.reference}</p>
                  </div>
                  <Badge status={b.status} />
                </div>
              ))
            ) : (
              <EmptyState
                title="No bookings yet"
                description="Book a service and follow its progress from this property."
              />
            )}
          </section>
          <section className="panel">
            <div className="panel-header">
              <h2>Maintenance & requests</h2>
              <Link className="small" to={`${d.workspace.href}/requests?property=${p.id}`}>
                Open requests →
              </Link>
            </div>
            {requests.length ? (
              requests.map((r) => (
                <div className="record-row" key={r.id}>
                  <div>
                    <div className="record-title">{r.title}</div>
                    <p>{r.reference}</p>
                  </div>
                  <Badge status={r.status} />
                </div>
              ))
            ) : (
              <EmptyState
                title="No open matters"
                description="Requests linked to this property will be shown here."
              />
            )}
          </section>
        </div>
        <section className="panel">
          <div className="panel-header">
            <h2>Documents & reports</h2>
          </div>
          {documents.length ? (
            documents.map((doc) => (
              <div className="record-row" key={doc.id}>
                <div>
                  <div className="record-title">{doc.title}</div>
                  <p>
                    PDF · Version {doc.version} · {displayDate(doc.issued_at || doc.created_at)}
                  </p>
                </div>
                <a
                  className="button secondary"
                  href={`/api${d.workspace.href}/documents/${doc.id}/download`}
                >
                  Download
                </a>
              </div>
            ))
          ) : (
            <EmptyState
              title="Your property history is taking shape"
              description="Issued reports will remain linked to this property and your authorised account."
            />
          )}
        </section>
      </div>
    </>
  );
}
