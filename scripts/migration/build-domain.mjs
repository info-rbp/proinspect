// Bundle the same Worker entry and reuse the exact runtimeContext from the React Router build.
import {build} from 'esbuild';
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
