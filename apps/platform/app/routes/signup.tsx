import type { LoaderFunctionArgs } from 'react-router';
import { loader as signInLoader } from './signin';

// The route determines the mode, including React Router's client data requests.
export function loader(args: LoaderFunctionArgs) {
  return { ...signInLoader(args), signup: true };
}
export { action, meta, default } from './signin';
