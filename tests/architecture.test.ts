import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('two distinct Workers, no legacy runtime',()=>{const a=JSON.parse(readFileSync('apps/platform/wrangler.jsonc','utf8'));const b=JSON.parse(readFileSync('apps/marketing/wrangler.jsonc','utf8'));assert.notEqual(a.name,b.name);const p=JSON.parse(readFileSync('package.json','utf8'));for(const forbidden of ['firebase','firebase-admin','express','googleapis']) assert.equal(p.dependencies[forbidden],undefined);});
