import { Form, Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace, workspaceApi } from '../lib/workspace';
import { PageHeading, Badge, EmptyState } from '../../../../packages/ui/components';
import { displayDate } from '../../../../packages/domain/index';
const names: Record<string, string> = {
  properties: 'Properties',
  bookings: 'Bookings',
  'work-orders': 'Work orders',
  requests: 'Requests',
  documents: 'Documents & reports',
  schemes: 'Schemes',
};
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const u = new URL(request.url);
  u.searchParams.set('type', params.collection ?? 'documents');
  return loadApi(
    request,
    context,
    `${workspaceApi(params.kind!, params.scopeId!)}/records?${u.searchParams}`,
  );
}
export default function Records() {
  const r = useLoaderData<typeof loader>(),
    { workspace: w, user } = useWorkspace();
  const types = ['documents', 'requests'];
  if (['landlord', 'property-manager', 'commercial', 'strata-manager', 'staff'].includes(w.kind))
    types.unshift('properties');
  if (['landlord', 'property-manager', 'commercial', 'strata-manager', 'staff'].includes(w.kind))
    types.push('bookings', 'work-orders');
  if (
    ['strata-manager', 'building', 'council'].includes(w.kind) ||
    (w.kind === 'staff' && user.staffRole !== 'inspector')
  )
    types.push('schemes');
  const next = new URLSearchParams({
    q: r.q,
    ...(r.property ? { property: r.property } : {}),
    after: r.next ?? '',
  });
  function href(x: any) {
    switch (r.type) {
      case 'properties':
        return `${w.href}/properties/${x.id}`;
      case 'documents':
        return `/api${w.href}/documents/${x.id}/download`;
      case 'schemes':
        return `${w.href}/schemes/${x.id}`;
      case 'requests':
        return w.kind === 'council' ? null : `${w.href}/requests/${x.id}`;
      case 'work-orders':
        return `${w.href}/work-orders/${x.id}`;
      case 'bookings':
        return `${w.href}/booking-changes?booking=${x.id}`;
      default:
        return null;
    }
  }
  return (
    <>
      <PageHeading
        title={names[r.type] ?? 'Records'}
        description="Search the complete authorised record set, 25 records per page."
      />
      <nav className="pill-links" aria-label="Record collections">
        {types.map((t) => (
          <Link
            key={t}
            to={`${w.href}/records/${t}`}
            aria-current={r.type === t ? 'page' : undefined}
          >
            {names[t]}
          </Link>
        ))}
      </nav>
      <section className="panel stack">
        <Form method="get" className="actions">
          <label htmlFor="record-search">Search</label>
          <input id="record-search" name="q" defaultValue={r.q} maxLength={100} />
          {r.property && <input type="hidden" name="property" value={r.property} />}
          <button className="button">Search records</button>
          <Link to={`${w.href}/records/${r.type}`}>Clear filters</Link>
        </Form>
        <p role="status">{r.total} matching authorised records.</p>
        {r.items.length ? (
          r.items.map((x: any) => (
            <article className="record-row" key={x.id}>
              <div>
                <h2>{x.title}</h2>
                <p className="small">
                  {x.reference ?? x.suburb ?? x.category}{' '}
                  {x.version ? ` | Version ${x.version}` : ''}
                </p>
                <p className="small">{displayDate(x.created_at)}</p>
              </div>
              <div className="stack-sm">
                {x.status && <Badge status={x.status} />}{' '}
                {href(x) &&
                  (r.type === 'documents' ? (
                    <a className="button secondary" href={href(x)!}>
                      Download PDF
                    </a>
                  ) : (
                    <Link className="button secondary" to={href(x)!}>
                      Open record
                    </Link>
                  ))}
              </div>
            </article>
          ))
        ) : (
          <EmptyState
            title="No matching records"
            description="Try another search or clear the filters."
          />
        )}
        <nav className="actions" aria-label="Record pages">
          <Link
            to={`${w.href}/records/${r.type}?${new URLSearchParams({ q: r.q, ...(r.property ? { property: r.property } : {}) })}`}
          >
            First page
          </Link>
          {r.next && (
            <Link className="button secondary" to={`?${next}`}>
              Next page
            </Link>
          )}
        </nav>
      </section>
    </>
  );
}
