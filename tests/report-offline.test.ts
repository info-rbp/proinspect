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
