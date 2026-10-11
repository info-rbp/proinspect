import type { ActionFunctionArgs } from 'react-router';
import { runtimeContext } from '../../../../packages/database/context';
import type { Env } from '../../../../packages/database/types';
import { submitContact } from '../../../marketing/app/routes/contact';
import { receiveEnquiry } from '../../worker/features/enquiries.server';
import { apiError } from '../../worker/api';

// Preserve the existing public form, validation, idempotency, HMAC gateway,
// Turnstile, encrypted D1 records and Staff review. Delivery is in-process on
// the single Worker rather than a network fetch to a second application.
export { default, loader, meta } from '../../../marketing/app/routes/contact';
export function action(args: ActionFunctionArgs) {
  const env = args.context.get(runtimeContext).env as Env;
  return submitContact(args, async (url, init) => {
    try {
      const result = await receiveEnquiry(env, new Request(url, init));
      return Response.json(result, { status: 201 });
    } catch (error) {
      return apiError(error);
    }
  });
}