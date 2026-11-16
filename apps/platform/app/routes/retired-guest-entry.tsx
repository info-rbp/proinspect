import { redirect, type LoaderFunctionArgs } from 'react-router';
import { bookingIntent } from '../../../../packages/domain/booking-intent';

/** Legacy guest entry points remain as redirects; existing historic token URLs are preserved. */
export async function loader({params}:LoaderFunctionArgs) {
  const serviceId=bookingIntent(params.serviceId);
  throw redirect('/book'+(serviceId?'/'+serviceId:''));
}
export default function RetiredGuestEntry() { return null; }
