import { redirect, type LoaderFunctionArgs } from 'react-router';
import { bookingIntent } from '../../../../packages/domain/booking-intent';

/** Existing request verification/management pages remain separate and accessible. */
export async function loader({params}:LoaderFunctionArgs) {
  const serviceId=bookingIntent(params.serviceCode);
  throw redirect('/book'+(serviceId?'/'+serviceId:''));
}
export default function RetiredGuestRequest() { return null; }
