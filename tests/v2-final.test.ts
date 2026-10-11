import {test} from 'node:test';
import assert from 'node:assert/strict';
import {V2_MARKETS,V2_SERVICE_SEEDS} from '../packages/v2/catalogue.ts';
import {V2_SECTOR_PACKS,SECTOR_RELEASE_CHECKS,validSectorFacts} from '../packages/v2/sectors.ts';
test('V2 specialist sector packs match all eleven operational markets and 55 controlled modules',()=>{
 assert.equal(V2_MARKETS.length,11);
 assert.equal(V2_SERVICE_SEEDS.length,69);
 assert.equal(V2_SECTOR_PACKS.length,11);
 assert.deepEqual(V2_SECTOR_PACKS.map(x=>x.marketCode).sort(),V2_MARKETS.map(x=>x.code).sort());
 assert.equal(V2_SECTOR_PACKS.flatMap(x=>x.modules).length,55);
 assert.equal(new Set(V2_SECTOR_PACKS.flatMap(x=>x.modules.map(m=>m.code))).size,55);
 assert.equal(SECTOR_RELEASE_CHECKS.length,7);
});
test('specialist fields allow only approved evidence references and non-sensitive notes',()=>{
 const required=['scopeReference','evidenceReference'];
 assert.equal(validSectorFacts(required,{scopeReference:'SIGNED-WORK-SCOPE',evidenceReference:'INDEPENDENT-CHECK'}),true);
 assert.equal(validSectorFacts(required,{scopeReference:'SIGNED-WORK-SCOPE',evidenceReference:'INDEPENDENT-CHECK',notes:'Site attendance'}),true);
 assert.equal(validSectorFacts(required,{scopeReference:'SIGNED-WORK-SCOPE',evidenceReference:'INDEPENDENT-CHECK',patientDiagnosis:'private'}),false);
 assert.equal(validSectorFacts(required,{scopeReference:'SIGNED-WORK-SCOPE'}),false);
 assert.equal(validSectorFacts(required,{scopeReference:12,evidenceReference:'REFERENCE'}),false);
 assert.equal(validSectorFacts(required,{}),false);
});
