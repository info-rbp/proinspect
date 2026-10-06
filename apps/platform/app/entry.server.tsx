import { ServerRouter, type EntryContext } from 'react-router';
import { renderToReadableStream } from 'react-dom/server';
export default async function handle(request:Request,status:number,headers:Headers,context:EntryContext){const stream=await renderToReadableStream(<ServerRouter context={context} url={request.url}/>,{signal:request.signal,onError(){status=500;}});headers.set('Content-Type','text/html; charset=utf-8');return new Response(stream,{status,headers});}
