// Reproducible deployment build: bundle only reviewed static campaign files.
// Run: node apps/residential-campaign/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
const routeFiles={'/':'index.html','/inclusions':'inclusions.html','/getting-started':'getting-started.html','/savings':'savings.html','/sign-up':'sign-up.html'};
const contents=Object.fromEntries([
 ...Object.entries(routeFiles).map(([route,file])=>[route,readFileSync(join(root,'pages',file),'utf8')]),
 ...['site.css','site.js','savings-calculator.js','savings-model.mjs'].map(file=>['/assets/'+file,readFileSync(join(root,'assets',file),'utf8')]),
]);
for(const [route,html] of Object.entries(contents)){
 if(route.startsWith('/assets/'))continue;
 if(!html.includes('noindex,nofollow') || !html.includes('https://proinspect.systems/signin'))throw Error('Unreviewed launch or signup routing: '+route);
 if(/\$30(?:\b|\.)|\$33(?:\b|\.)/.test(html))throw Error('Stale subscription price: '+route);
}
const code=`const content=${JSON.stringify(contents)};
export default { async fetch(request) {
 const url=new URL(request.url);
 const path=url.pathname.replace(/\\/$/,'')||'/';
 const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','X-Robots-Tag':'noindex,nofollow',
   'Content-Security-Policy':"default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"};
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{...headers,Allow:'GET, HEAD'}});
 if(path==='/api/health')return Response.json({ok:true,application:'residential-subscription-campaign',environment:'preview'},{headers});
 if(path==='/robots.txt')return new Response('User-agent: *\\nDisallow: /\\n',{headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});
 if(!Object.prototype.hasOwnProperty.call(content,path))return new Response('Not found',{status:404,headers});
 const type=path.endsWith('.css')?'text/css':(path.endsWith('.js')||path.endsWith('.mjs'))?'text/javascript':'text/html';
 return new Response(request.method==='HEAD'?null:content[path],{headers:{...headers,'Content-Type':type+'; charset=utf-8','Cache-Control':'public, max-age=300'}});
}};`;
mkdirSync(join(root,'dist'),{recursive:true});
writeFileSync(join(root,'dist','worker.mjs'),code,'utf8');
console.log('Bundled '+Object.keys(contents).length+' campaign routes/assets to dist/worker.mjs');
