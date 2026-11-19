import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import { seal, unseal } from '../../packages/auth/crypto.ts';
test('Node preserves v1 AES-256-GCM envelope and AAD; wrong context/key/tampering fail',async()=>{
 const key=Buffer.alloc(32,7),iv=Buffer.alloc(12,9),aad='booking:synthetic',value={instructions:'synthetic only'};
 const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad));
 const bytes=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final(),cipher.getAuthTag()]);
 const envelope=JSON.stringify({v:1,iv:iv.toString('base64'),ciphertext:bytes.toString('base64')});
 assert.deepEqual(await unseal(key.toString('base64'),aad,envelope),value);
 const own=await seal(key.toString('base64'),aad,value);assert.deepEqual(await unseal(key.toString('base64'),aad,own),value);
 await assert.rejects(unseal(key.toString('base64'),'booking:wrong',envelope));
 await assert.rejects(unseal(Buffer.alloc(32,8).toString('base64'),aad,envelope));
 const broken=JSON.parse(envelope);bytes[0]^=1;broken.ciphertext=bytes.toString('base64');
 await assert.rejects(unseal(key.toString('base64'),aad,JSON.stringify(broken)));
});
