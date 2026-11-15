import type { Env } from '../../../../packages/database/types';
export function commercialCookieName(env:Env){return env.APP_ENV==='local'?'pi_commercial_local':'__Host-pi_commercial';}
export function commercialSession(request:Request,env:Env){
 const name=commercialCookieName(env)+'=';
 return (request.headers.get('Cookie')??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name))?.slice(name.length)??'';
}
export function commercialSessionCookie(env:Env,value:string){
 return commercialCookieName(env)+'='+value+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800'+(env.APP_ENV==='local'?'':'; Secure');
}
