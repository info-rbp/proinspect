import test from 'node:test';
import assert from 'node:assert/strict';
import {encryptOffline,decryptOffline} from '../apps/platform/app/lib/report-offline.ts';
test('offline report fieldwork is encrypted and context bound',async()=>{
 const plain=new TextEncoder().encode('Sensitive property inspection field notes');
 const key='user::staff::operations::report_a',password='a long independent device password 1234';
 const cipher=await encryptOffline(plain,password,key);
 assert.ok(!Buffer.from(cipher.cipher).includes(plain));
 assert.deepEqual(await decryptOffline(cipher,password,key),plain);
 await assert.rejects(decryptOffline(cipher,password,'user::staff::operations::report_b'));
 await assert.rejects(decryptOffline(cipher,'another long unrelated passphrase',key));
});
test('short passwords are rejected without storing any plaintext',async()=>{
 await assert.rejects(encryptOffline(new Uint8Array([1,2,3]),'short','scope'));
});

test('offline acknowledgement only consumes the exact encrypted snapshot',async()=>{
 const {sameOfflineSnapshot}=await import('../apps/platform/app/lib/report-offline.ts');
 const scope='user::staff::operations::report_a';
 const a=await encryptOffline(new TextEncoder().encode('first'), 'independent passphrase 123',scope);
 const b=await encryptOffline(new TextEncoder().encode('second'),'independent passphrase 123',scope);
 assert.equal(sameOfflineSnapshot(structuredClone(a),a),true);
 assert.equal(sameOfflineSnapshot(b,a),false);
 assert.equal(sameOfflineSnapshot(undefined,a),false);
 assert.equal(sameOfflineSnapshot({...a,iv:new Uint8Array(a.iv).fill(0)},a),false);
});
test('offline sync refuses another workspace or remote URL before reading local storage',async()=>{
 const {syncOfflineDraft,syncOfflinePhotos}=await import('../apps/platform/app/lib/report-offline.ts');
 const scope={userId:'u1',kind:'staff',scopeId:'operations',reportId:'report_a'};
 for(const url of ['https://untrusted.example/api/w/staff/operations','/api/w/landlord/other','//untrusted.example']){
  await assert.rejects(syncOfflineDraft(scope,'a long phrase here',url),/original workspace/);
  await assert.rejects(syncOfflinePhotos(scope,'a long phrase here',url),/original workspace/);
 }
});
