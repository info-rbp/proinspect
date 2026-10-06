import {redirect,type RouterContextProvider} from 'react-router';
import {platformEnv,runtimeContext} from '../../../../packages/database/context';
import {handleApi} from '../../worker/api';
export async function callApi(request:Request,context:Readonly<RouterContextProvider>,path:string,options?:{method?:string;body?:unknown;form?:FormData}){
 const env=platformEnv(context);const headers=new Headers();for(const key of ['cookie','origin','cf-connecting-ip']){const value=request.headers.get(key);if(value)headers.set(key,value);}let body:BodyInit|undefined;
 if(options?.form)body=options.form;else if(options?.body!==undefined){headers.set('Content-Type','application/json');body=JSON.stringify(options.body);}
 const target=new URL(path,request.url);const response=await handleApi(new Request(target,{method:options?.method??'GET',headers,body}),env,context.get(runtimeContext).ctx);
 if(response.status===401)throw redirect(`/signin?returnTo=${encodeURIComponent(new URL(request.url).pathname+new URL(request.url).search)}`);
 return response;
}
export async function loadApi(request:Request,context:Readonly<RouterContextProvider>,path:string){const response=await callApi(request,context,path);if(!response.ok)throw response;return response.json() as Promise<Record<string,any>>;}
