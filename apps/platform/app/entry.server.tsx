import { renderToReadableStream } from 'react-dom/server';
import { ServerRouter, type EntryContext, type RouterContextProvider } from 'react-router';
import { runtimeContext } from '../../../packages/database/context';
export default async function handleRequest(
  request: Request,
  status: number,
  headers: Headers,
  routerContext: EntryContext,
  loadContext: Readonly<RouterContextProvider>,
) {
  // Both React Router's streamed transfer scripts and React's own streaming
  // instructions must receive the same request nonce as the Worker's CSP.
  const nonce = loadContext.get(runtimeContext).nonce;
  const stream = await renderToReadableStream(
    <ServerRouter context={routerContext} url={request.url} nonce={nonce} />,
    { nonce, signal: request.signal },
  );
  await stream.allReady;
  headers.set('Content-Type', 'text/html; charset=utf-8');
  return new Response(stream, { status, headers });
}
