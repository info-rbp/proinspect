import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';

// Executes the actual checked-in Google Apps Script receiver against simulated
// Workspace services. No provider credentials, network requests or real emails.
const source = readFileSync('integrations/apps-script/rental-application-handoff.gs', 'utf8');
const secret = 'isolated-lighthouse-handoff-test-secret-2026-11';

function signedValues(bytes: Uint8Array): number[] {
 return Array.from(bytes).map(value => value > 127 ? value - 256 : value);
}
function mockReceiver(config: { allowCc?: boolean } = {}) {
 const values = new Map<string, string>([
  ['PROINSPECT_HANDOFF_SECRET', secret],
  ['PROINSPECT_ALLOWED_RECIPIENTS', 'Lighthousepropertygroup@mail.com, agency@example.invalid'],
  ['PROINSPECT_ALLOWED_CC', config.allowCc === false ? '' : 'info@proinspect.systems'],
 ]);
 const sent: Record<string, string>[] = [];
 const properties = {
  getProperty: (name: string) => values.get(name) ?? null,
  setProperty: (name: string, value: string) => { values.set(name, value); },
 };
 const sandbox: Record<string, any> = {
  PropertiesService: { getScriptProperties: () => properties },
  Utilities: {
   DigestAlgorithm: { SHA_256: 'SHA_256' },
   computeHmacSha256Signature: (message: string, key: string) =>
    signedValues(createHmac('sha256', key).update(message).digest()),
   computeDigest: (_algorithm: string, message: string) =>
    signedValues(createHash('sha256').update(message).digest()),
   base64EncodeWebSafe: (bytes: number[]) =>
    Buffer.from(bytes.map(value => value & 255)).toString('base64url'),
   getUuid: () => randomUUID(),
  },
  LockService: { getScriptLock: () => ({
   tryLock: (_timeout: number) => true, releaseLock: () => undefined,
  }) },
  MailApp: { sendEmail: (options: Record<string,string>) => { sent.push(options); } },
  ContentService: {
   MimeType: { JSON: 'application/json' },
   createTextOutput: (value: string) => ({
    content: value, setMimeType(_type: string) { return this; },
   }),
  },
 };
 runInNewContext(source, sandbox, { timeout: 5000, filename: 'rental-application-handoff.gs' });
 const submit = (payload: Record<string, any>, opts: { tamperSignature?: boolean } = {}) => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const data = JSON.stringify(payload);
  const sig = createHmac('sha256', secret).update(timestamp + '.' + data).digest('hex');
  const envelope = {
   timestamp, data, signature: 'sha256=' + (opts.tamperSignature ? '0'.repeat(64) : sig),
  };
  return JSON.parse(sandbox.doPost({postData: {contents: JSON.stringify(envelope)}}).content);
 };
 return { submit, sent, values };
}
function examplePayload(client = 'cli_lighthouse_property_group_pty_ltd') {
 return {
  contractVersion: 'proinspect-rental-email-v1',
  handoffId: 'rhf_synthetic_lighthouse_6',
  idempotencyKey: 'rental-email-v1:rapp_synthetic_lighthouse_6:1',
  recipient: client === 'cli_lighthouse_property_group_pty_ltd'
   ? 'Lighthousepropertygroup@mail.com' : 'agency@example.invalid',
  instructingClientId: client,
  cc: client === 'cli_lighthouse_property_group_pty_ltd' ? 'info@proinspect.systems' : null,
  reference: 'RNT-SYNTHETIC-UNIT6',
  property: 'Unit 6, 273 Fulham Street, Cloverdale WA 6105',
  submittedAt: '2026-11-08T00:00:00Z',
  applicants: [{ answers: {
   identity: { fullName: 'Fictional Applicant <script>', email: 'applicant@example.invalid' },
   rental: { previousAddress: '123 Test Street' }, employment: {}, references: {},
  } }],
  documents: [{reference: 'test-only', filename: 'fixture.pdf', category: 'identity', sha256: 'fixture'}],
 };
}
test('signed Lighthouse application invokes the real Apps Script email path with the exact CC', () => {
 const receiver=mockReceiver();
 const payload=examplePayload();
 const receipt=receiver.submit(payload);
 assert.equal(receipt.accepted,true);
 assert.equal(receipt.idempotencyKey,payload.idempotencyKey);
 assert.equal(receipt.signature,
  'sha256='+createHmac('sha256',secret).update(
   payload.idempotencyKey+'.'+receipt.messageReference+'.accepted').digest('hex'));
 assert.equal(receiver.sent.length,1);
 const email=receiver.sent[0];
 assert.equal(email.to,'lighthousepropertygroup@mail.com');
 assert.equal(email.cc,'info@proinspect.systems');
 assert.match(email.subject,/RNT-SYNTHETIC-UNIT6/);
 assert.match(email.html,/Unit 6, 273 Fulham Street/);
 assert.match(email.html,/&lt;script&gt;/);
 assert.doesNotMatch(email.html,/name="fixture.pdf"/);
 assert.match(email.body,/Supporting documents remain restricted/);
 const replay=receiver.submit(payload);
 assert.deepEqual(replay,receipt);
 assert.equal(receiver.sent.length,1,'replay must not send a second email');
});
test('the signed handoff rejects forged signatures, unapproved CC and changed recipient', () => {
 const forged=mockReceiver();
 assert.equal(forged.submit(examplePayload(),{tamperSignature:true}).code,'AUTH_FAILED');
 assert.equal(forged.sent.length,0);
 const blocked=mockReceiver({allowCc:false});
 assert.equal(blocked.submit(examplePayload()).code,'CC_NOT_ALLOWED');
 assert.equal(blocked.sent.length,0);
 const changed=mockReceiver();
 assert.equal(changed.submit({...examplePayload(),cc:'outside@example.invalid'}).code,'CC_MISMATCH');
 assert.equal(changed.submit({...examplePayload(),recipient:'not-approved@example.invalid'}).code,'RECIPIENT_NOT_ALLOWED');
 assert.equal(changed.sent.length,0);
});
test('other landlords do not inherit Lighthouse application CC',()=>{
 const receiver=mockReceiver();
 const payload=examplePayload('cli_unrelated_landlord');
 const receipt=receiver.submit(payload);
 assert.equal(receipt.accepted,true);
 assert.equal(receiver.sent[0].to,'agency@example.invalid');
 assert.equal('cc' in receiver.sent[0],false);
 assert.equal(receiver.submit({...payload,idempotencyKey:'rental-email-v1:rapp_other:1',cc:'info@proinspect.systems'}).code,'CC_MISMATCH');
 assert.equal(receiver.sent.length,1);
});
