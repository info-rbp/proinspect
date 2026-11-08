import { Link, useSearchParams } from 'react-router';
import { useWorkspace } from '../lib/workspace';
import { PageHeading, Badge, EmptyState } from '../../../../packages/ui/components';
import { displayDate, money } from '../../../../packages/domain/index';
export default function Bookings() {
  const d = useWorkspace();
  const [search]=useSearchParams(),propertyId=search.get('propertyId');
  const records=propertyId?d.bookings.filter(b=>b.property_id===propertyId):d.bookings;
  return (
    <>
      <PageHeading
        eyebrow="Property visits"
        title="Bookings"
        description="Confirmed appointments and your service history."
      >
        {['landlord', 'property-manager', 'commercial', 'strata-manager'].includes(
          d.workspace.kind,
        ) && (
          <Link className="button" to={`${d.workspace.href}/book`}>
            + Book a service
          </Link>
        )}
      </PageHeading>
      {propertyId&&<p><Link to={d.workspace.href+'/properties/'+encodeURIComponent(propertyId)}>Return to selected property</Link> · {records.length} bookings</p>}
      {records.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Booking</th>
                <th>Property</th>
                <th>Appointment</th>
                <th>Price ex GST</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((b) => (
                <tr key={b.id}>
                  <td>
                    <strong>{b.service_name}</strong>
                    <p>{b.reference}</p>
                  </td>
                  <td>{b.address}</td>
                  <td>{displayDate(b.starts_at)}</td>
                  <td>{money(b.price_ex_gst_cents)}</td>
                  <td>
                    <Badge status={b.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <section className="panel">
          <EmptyState
            title="No bookings yet"
            description="Book your first service and track the appointment here."
          />
        </section>
      )}
    </>
  );
}
