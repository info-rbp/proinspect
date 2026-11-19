// Bundle the same Worker entry and reuse the exact runtimeContext from the React Router build.
import {build} from 'esbuild';
import {readFile, writeFile} from 'node:fs/promises';
import ts from 'typescript';
const compiled = '../server/index.js';
await build({
  entryPoints: ['apps/platform/node/domain-entry.ts'], bundle:true, platform:'node', format:'esm',
  target:'node22', packages:'external', outfile:'apps/platform/build/google/domain.mjs',
  define:{'import.meta.env.MODE':'"production"'},
  plugins:[{name:'cloud-run-bindings', setup(builder) {
    builder.onResolve({filter:/^cloudflare:workers$/}, () => ({path:'cf',namespace:'node-host'}));
    builder.onLoad({filter:/.*/,namespace:'node-host'}, () => ({contents:'export class DurableObject { constructor() { throw Error("Use the PostgreSQL booking scheduler"); } }'}));
    builder.onResolve({filter:/^virtual:react-router\/server-build$/}, () => ({path:compiled,external:true}));
    builder.onResolve({filter:/\/database\/context$/}, () => ({path:'context',namespace:'node-context'}));
    builder.onLoad({filter:/.*/,namespace:'node-context'}, () => ({contents:'import {entry} from "platform:built-context"; export const {runtimeContext, platformEnv} = entry.module;'}));
    builder.onResolve({filter:/^platform:built-context$/}, () => ({path:compiled,external:true}));
  }}]
});
// Carry only the checked-in staging boolean gates into either Google environment.
// Provider credentials, identifiers and Cloudflare origins never enter this binding.
const wranglerPath = 'apps/platform/wrangler.jsonc';
const {config, error} = ts.parseConfigFileTextToJson(wranglerPath, await readFile(wranglerPath, 'utf8'));
if (error) throw Error('Cannot read staged release gates from the platform configuration');
const gates = Object.fromEntries(Object.entries(config.env.staging.vars)
  .filter(([name, value]) => /_(ENABLED|READY|APPROVED)$/.test(name) && ['true','false'].includes(value)));
await writeFile('apps/platform/build/google/staging-flags.json', JSON.stringify(gates));
