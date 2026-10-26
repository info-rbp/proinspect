import { runtimeContext } from '../../../../packages/database/context';
import type { Env } from '../../../../packages/database/types';
import type { LoaderFunctionArgs } from 'react-router';
/** The public PDF is deliberately fixed to a reviewed R2 key, not user input. */
export async function loader({ context }: LoaderFunctionArgs) {
  const env = context.get(runtimeContext).env as Env;
  const pdf = await env.DOCUMENTS?.get('marketing/approved-samples/property-condition-report.pdf');
  if (!pdf) throw new Response('An approved sample PCR has not yet been published.', {status:404});
  return new Response(pdf.body,{
    headers:{
      'Content-Type':'application/pdf',
      'Content-Disposition':'attachment; filename="ProInspect-Sample-PCR.pdf"',
      'Cache-Control':'public, max-age=3600',
      'X-Content-Type-Options':'nosniff',
    },
  });
}
