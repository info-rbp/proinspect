import { redirect, type LoaderFunctionArgs } from 'react-router';
import { leasingResultsUrl } from '../../../../packages/marketing/leasing-presentation';
/** Keep historical category URLs working, but use one directory and filter model. */
export function loader({params,request}:LoaderFunctionArgs){
 if(!['residential','commercial'].includes(params.kind??''))throw new Response('Not found',{status:404});
 return redirect(leasingResultsUrl(params.kind,new URL(request.url).searchParams.get('q')));
}
export default function LeasingSector(){return null;}
