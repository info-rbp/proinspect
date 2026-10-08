import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { workspaceApi } from '../lib/workspace';
import { PageHeading, Badge } from '../../../../packages/ui/components';
import { displayDate } from '../../../../packages/domain/index';
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  return loadApi(request, context, `${workspaceApi(params.kind!, params.scopeId!)}/reporting`);
}
export default function Reporting() {
  const r = useLoaderData<typeof loader>();
  return (
    <>
      <PageHeading title="Operational reporting" description={r.basis} />
      <p className="small">
        {r.scope} | Generated {displayDate(r.generatedAt)} | All-time records
      </p>
      <div className="grid-3">
        {Object.entries(r.counts).map(([name, rows]) => (
          <section className="panel stack" key={name}>
            <h2>{name.replaceAll('-', ' ')}</h2>
            {(rows as any[]).length ? (
              (rows as any[]).map((x) => (
                <div className="record-row" key={x.status}>
                  <Badge status={x.status} />
                  <strong>{x.count}</strong>
                </div>
              ))
            ) : (
              <p>No records.</p>
            )}
          </section>
        ))}
      </div>
      {r.payments.length > 0 && (
        <section className="panel stack" style={{ marginTop: 24 }}>
          <h2>Recorded service payments</h2>
          <p>These figures do not represent rent, levies or complete property accounting.</p>
          {r.payments.map((p: any) => (
            <div className="record-row" key={p.status}>
              <Badge status={p.status} />
              <span>{p.count} records</span>
              <strong>
                {new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(
                  p.total_cents / 100,
                )}
              </strong>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
