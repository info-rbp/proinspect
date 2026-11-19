import {randomUUID} from 'node:crypto';
import {Storage} from '@google-cloud/storage';
import {CloudTasksClient} from '@google-cloud/tasks';
import {GoogleAuth} from 'google-auth-library';
import {documentBucket} from './storage.mjs';

const project = 'proinspect-property-services', region = 'australia-southeast1';
const stages = new Set(['dev','staging']);
export const eventIdValid = id => typeof id === 'string' && /^[\w:.-]{1,250}$/.test(id);
export function privateScannerBinding(origin, authorization, send = fetch) {
  return {async fetch(input, init) {
    const request = new Request(input, init);
    const health = request.url === 'https://private-scanner/health' && request.method === 'GET';
    const scan = request.url === 'https://private-scanner/scan' && request.method === 'POST';
    if (!health && !scan) throw Error('Invalid scanner target');
    const outbound = new Request(origin + (health ? '/health' : '/scan'), request);
    outbound.headers.set('Authorization', await authorization());
    return send(outbound, {redirect:'error'});
  }};
}
export function cloudBindings(stage) {
  if (!stages.has(stage)) throw Error('Invalid cloud environment');
  const storage = new Storage({projectId:project});
  const tasks = new CloudTasksClient({projectId:project});
  const service = 'proinspect-migration-' + stage;
  const nativeOrigin = 'https://' + service + '-101236528395.' + region + '.run.app';
  const parent = tasks.queuePath(project, region, service + '-events');
  async function enqueue(body) {
    await tasks.createTask({parent, task: {httpRequest: {httpMethod:'POST',
      url: nativeOrigin + '/internal/jobs/events', headers: {'Content-Type':'application/json'},
      body: Buffer.from(JSON.stringify(body))}}});
  }
  const scannerUrl = 'https://' + service + '-scanner-101236528395.' + region + '.run.app';
  const auth = new GoogleAuth();
  return {
    APP_ORIGIN: nativeOrigin,
    DOCUMENTS: documentBucket(storage.bucket(project + '-mig-' + stage + '-documents')),
    RESTRICTED_DOCUMENTS: documentBucket(storage.bucket(project + '-mig-' + stage + '-restricted')),
    EVENTS: {async send({eventId}) {
      if (!eventIdValid(eventId)) throw Error('Invalid outbox event ID');
      await enqueue({eventId});
    }},
    async checkQueue() { await enqueue({probe: 'migration-adapter-v1'}); },
    // Enable this binding only with a separately released scanner and its public verification key.
    privateScanner: privateScannerBinding(scannerUrl, async () => {
      const client = await auth.getIdTokenClient(scannerUrl);
      return (await client.getRequestHeaders()).get('Authorization');
    }),
    async close() { await tasks.close(); }
  };
}

async function checkBucket(bucket) {
  const name = 'migration-checks/' + randomUUID();
  try {
    await bucket.put(name, 'proinspect adapter', {customMetadata:{purpose:'migration-check'}});
    const object = await bucket.get(name);
    if (object?.customMetadata.purpose !== 'migration-check' || await object.text() !== 'proinspect adapter') {
      throw Error('Storage verification failed');
    }
  } finally { await bucket.delete(name); }
  if (await bucket.head(name)) throw Error('Storage cleanup failed');
}

async function checkMultipart(bucket) {
  const name = 'migration-checks/' + randomUUID();
  const upload = await bucket.createMultipartUpload(name, {httpMetadata:{contentType:'application/pdf'}});
  try {
    const a = await upload.uploadPart(1, Buffer.from('%PDF-'));
    const b = await upload.uploadPart(2, Buffer.from('adapter'));
    const completed = await upload.complete([a,b]);
    if (completed.size !== 12 || (await (await bucket.get(name)).text()) !== '%PDF-adapter') {
      throw Error('Multipart verification failed');
    }
  } catch (error) { await upload.abort(); throw error; }
  finally { await bucket.delete(name); }
}

// Limit diagnostic output to a fixed operation name and numeric SDK status. Object names,
// request data, provider errors and keys never enter application logs.
export async function checkBindings(bindings, key) {
  let operation = 'secret';
  try {
    if (Buffer.from(key ?? '', 'base64').length !== 32) throw Error('Missing environment key');
    operation = 'storage';
    await checkBucket(bindings.DOCUMENTS);
    operation = 'restrictedStorage';
    await checkBucket(bindings.RESTRICTED_DOCUMENTS);
    operation = 'multipart';
    await checkMultipart(bindings.DOCUMENTS);
    operation = 'task';
    await bindings.checkQueue();
  } catch (error) {
    const permission = /\b(?:iam\.serviceAccounts|cloudtasks\.tasks|serviceusage\.services)\.[A-Za-z]+\b/
      .exec(String(error?.details ?? error?.message ?? ''))?.[0];
    console.error(JSON.stringify({severity:'ERROR', event:'migration.adapter.failed', operation,
      status:Number.isInteger(error?.code) ? error.code : null, permission}));
    throw error;
  }
}
