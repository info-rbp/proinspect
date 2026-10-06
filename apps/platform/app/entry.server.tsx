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
  const stream = await renderToReadableStream(
    <ServerRouter context={routerContext} url={request.url} />,
    { nonce: loadContext.get(runtimeContext).nonce, signal: request.signal },
  );
  await stream.allReady;
  headers.set('Content-Type', 'text/html; charset=utf-8');
  return new Response(stream, { status, headers });
}
