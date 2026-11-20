/** Synthetic browser UX only. Real Worker/storage behaviour has a separate runtime suite. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
const folder='artifacts/temporary-document-browser';mkdirSync(folder,{recursive:true});
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{createMemoryRouter,RouterProvider,redirect}from'react-router';import RentalApplication from'../../apps/marketing/app/routes/rental-application';
let docs=[];const fixture={reference:'RNT-SYNTHETIC-ONLY',status:'draft',intakeEnabled:true,role:'primary',ordinal:1,state:'in_progress',version:1,noticeMatches:true,temporaryUploads:true,uploadsEnabled:true,detailsOnly:false,minimalCollection:true,documents:[],property:{title:'Synthetic managed property',address:'1 Fictional Avenue, Perth',agentName:'ProInspect Property Services Pty Ltd'},answers:{identity:{fullName:'Fictional Applicant',email:'applicant@example.invalid',totalOccupants:'1',petsProposed:'No'},rental:{},employment:{},references:{}},household:[{ordinal:1,state:'in_progress',maskedEmail:'a***@example.invalid',name:'Fictional Applicant'}],notice:{mode:'not_used',entries:[]},privacyRequests:[]};
const router=createMemoryRouter([{path:'*',Component:RentalApplication,loader:()=>({...fixture,temporaryDocuments:docs}),action:async({request})=>{const form=await request.formData();if(form.get('intent')==='upload'){const file=form.get('file');if(!(file instanceof File)||!file.size)return{error:'Choose a file'};docs=[{id:'rtd_synthetic_browser',filename:file.name,size_bytes:file.size,category:form.get('category'),state:'quarantined',stored_at:new Date().toISOString()}];}if(form.get('intent')==='delete-document')docs=[];return redirect('?step=documents');}}],{initialEntries:['/rental-application/'+('a'.repeat(64))+'?step=documents']});
createRoot(document.getElementById('app')).render(React.createElement(RouterProvider,{router}));`;
writeFileSync(folder+'/fixture.tsx',entry);
await build({entryPoints:[folder+'/fixture.tsx'],outfile:folder+'/fixture.js',bundle:true,format:'esm',platform:'browser',target:'es2022',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},external:['cloudflare:workers','node:crypto']});
const rootStyles='apps/platform/build/client/assets/'+readdirSync('apps/platform/build/client/assets').find(f=>/^root-.+\.css$/.test(f));
const server=createServer((req,res)=>{
 if(req.url?.startsWith('/api/legal/requirements')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({enabled:false,ready:true,documents:[]}));return;}
 if(req.url==='/root.css'){res.setHeader('Content-Type','text/css');res.end(readFileSync(rootStyles));return;}
 if(req.url==='/fixture.js'||req.url==='/fixture.css'){res.setHeader('Content-Type',req.url.endsWith('.js')?'application/javascript':'text/css');res.end(readFileSync(folder+req.url));return;}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/root.css"><link rel="stylesheet" href="/fixture.css"></head><body><div id="app"></div><script type="module" src="/fixture.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true}),report={synthetic:true,productionDataAccessed:false,networkUploads:false,checks:[],status:'FAIL'};
try{
 for(const viewport of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844}]){
  const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height}}),page=await context.newPage(),errors=[];
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await expect(page.getByRole('heading',{name:'Supporting documents',exact:true})).toBeVisible();
  await expect(page.getByText('Automatic malware scanning is not available',{exact:false})).toBeVisible();
  await page.getByLabel('Add supporting document',{exact:true}).setInputFiles({name:'synthetic-income.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 synthetic browser fixture %%EOF')});
  await page.getByRole('button',{name:'Upload privately',exact:true}).click();await expect(page.getByText('synthetic-income.pdf',{exact:true})).toBeVisible();
  await expect(page.getByText('Awaiting manual antivirus review',{exact:false})).toBeVisible();
  const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));assert(width.scroll<=width.viewport+1,'No horizontal overflow');
  await page.screenshot({path:folder+'/'+viewport.name+'-uploaded.png',fullPage:true});
  await page.getByRole('link',{name:'Review my application →',exact:true}).click();await expect(page.locator('input[name=temporaryEvidenceConsent]')).toBeVisible();
  await page.screenshot({path:folder+'/'+viewport.name+'-declaration.png',fullPage:true});
  assert.deepEqual(errors,[]);report.checks.push({viewport:viewport.name,uploadForm:true,quarantineLabel:true,sharingConsent:true,noOverflow:true});await context.close();
 }
 report.status='PASS';
}catch(error){report.error=String(error.stack??error);process.exitCode=1;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));writeFileSync(folder+'/review.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
