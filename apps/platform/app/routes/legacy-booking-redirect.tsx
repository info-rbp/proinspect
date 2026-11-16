import { redirect, type LoaderFunctionArgs } from 'react-router';
import { bookingIntent } from '../../../../packages/domain/booking-intent';

/** Deprecated guest purchase entry points now lead to authenticated booking. */
export function loader({ params }: LoaderFunctionArgs) {
  const service = bookingIntent(params.serviceId);
  throw redirect(service ? '/book/' + encodeURIComponent(service) : '/book');
}
export default function LegacyBookingRedirect() { return null; }
