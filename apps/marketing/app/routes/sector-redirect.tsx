import { redirect, type LoaderFunctionArgs } from 'react-router';

const canonical: Record<string,string> = {
  residential: '/residential',
  commercial: '/commercial',
  'strata-building': '/strata',
};
/** Preserve inbound legacy sector URLs while preventing duplicate marketing content. */
export function loader({ params }: LoaderFunctionArgs) {
  const destination = canonical[params.sector ?? ''];
  if (!destination) throw new Response('Not found', { status: 404 });
  return redirect(destination, 301);
}
