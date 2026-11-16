import { redirect, type LoaderFunctionArgs } from 'react-router';
import { bookingIntent } from '../../../../packages/domain/booking-intent';

/** All new service purchases require a verified account. */
export async function loader({params}:LoaderFunctionArgs) {
  const serviceId=bookingIntent(params.serviceId);
  throw redirect('/book/subscriber'+(serviceId?'/'+serviceId:''));
}
export default function BookService() {
  return null;
}
