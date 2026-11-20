/** Deploys ONLY the separate private engine. Never deploys the platform or D1. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const environment=process.argv[2];
assert(['staging','production'].includes(environment),'Choose staging or production explicitly');
assert.equal(process.env.PRIVATE_SCANNER_DEPLOY,'1','Private scanner deployment must be explicitly selected');
assert(!process.env.CLOUDFLARE_ENV,'A platform environment must not override this isolated target');
const root=resolve(import.meta.dirname,'../..'),directory=resolve(root,'apps/private-document-scanner');
const base=JSON.parse(readFileSync(resolve(directory,'wrangler.jsonc'),'utf8'));
const config={...base,...(environment==='staging'?base.env.staging:{})};delete config.env;delete config.$schema;
const name='proinspect-private-document-scanner'+(environment==='staging'?'-staging':'');
assert.equal(config.name,name);assert.equal(config.workers_dev,false);assert.equal(config.preview_urls,false);
assert(!config.d1_databases&&!config.r2_buckets&&!config.routes&&!config.services,'The engine must have no document/database bindings or public routes');
assert.equal(config.containers.length,1);assert.equal(config.containers[0].max_instances,1);
assert.equal(process.env.WRANGLER_CI_OVERRIDE_NAME??name,name,'CI attempted to change the Worker target');
assert.equal(process.env.WRANGLER_CI_MATCH_TAG??(environment==='staging'?'1f94a186651a4b2884ee113722ba24d1':'e84f0ab5f64c4669b334fdaea0531696'),environment==='staging'?'1f94a186651a4b2884ee113722ba24d1':'e84f0ab5f64c4669b334fdaea0531696');
const source=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();assert.match(source,/^[a-f0-9]{40}$/);
config.main=resolve(directory,'src/index.ts');
config.containers[0].images.base=resolve(directory,'container/Dockerfile');
config.containers[0].image_build_context=resolve(directory,'container');
config.vars={SCANNER_SOURCE_SHA:source};
const artifacts=resolve(root,'artifacts/private-document-scanning');mkdirSync(artifacts,{recursive:true});
const path=resolve(artifacts,'scanner-'+environment+'.json');writeFileSync(path,JSON.stringify(config,null,2)+'\n');
execFileSync('pnpm',['exec','wrangler','deploy','--config',path],{cwd:root,stdio:'inherit'});
