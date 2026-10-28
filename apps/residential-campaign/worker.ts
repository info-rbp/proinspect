// Production-isolated residential subscription marketing Worker.
// Keep payment/auth and property records within the existing ProInspect platform.
import home from './pages/index.html';
import inclusions from './pages/inclusions.html';
import gettingStarted from './pages/getting-started.html';
import savings from './pages/savings.html';
import signUp from './pages/sign-up.html';
import stylesheet from './assets/site.css';
import behaviour from './assets/site.js';
const pages = new Map([['/',home],['/inclusions',inclusions],['/getting-started',gettingStarted],['/savings',savings],['/sign-up',signUp]]);
const assetHeaders = {'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY'};
const pageHeaders = {...assetHeaders,'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=300','X-Robots-Tag':'noindex,nofollow','Content-Security-Policy':"default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"};
export default { async fetch(request) {
 const url=new URL(request.url), path=url.pathname.replace(/\\/$/,'')||'/';
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
 if(url.pathname==='/api/health')return Response.json({ok:true,application:'residential-subscription-microsite',environment:'preview'},{headers:assetHeaders});
 if(url.pathname==='/robots.txt')return new Response('User-agent: *\\nDisallow: /\\n',{headers:{...assetHeaders,'Content-Type':'text/plain; charset=utf-8'}});
 let body,headers;
 if(path==='/assets/site.css'){body=stylesheet;headers={...assetHeaders,'Content-Type':'text/css; charset=utf-8','Cache-Control':'public, max-age=3600'}}
 else if(path==='/assets/site.js'){body=behaviour;headers={...assetHeaders,'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'public, max-age=3600'}}
 else if(pages.has(path)){body=pages.get(path);headers=pageHeaders}
 else return new Response('Page not found',{status:404,headers:{...assetHeaders,'Content-Type':'text/plain; charset=utf-8'}});
 return new Response(request.method==='HEAD'?null:body,{headers});
}};