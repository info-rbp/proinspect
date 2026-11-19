import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {finished, pipeline} from 'node:stream/promises';

function objectInfo(key, data) {
  return {key, size: Number(data.size), etag: data.etag, httpEtag: '"' + data.etag + '"',
    version: data.generation, uploaded: new Date(data.timeCreated),
    httpMetadata: {contentType: data.contentType}, customMetadata: data.metadata ?? {}};
}
function metadata(options) {
  return {contentType: options?.httpMetadata?.contentType ?? 'application/octet-stream', metadata: options?.customMetadata ?? {}};
}
async function bytes(value) {
  if (typeof value === 'string') return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof Blob) return Buffer.from(await value.arrayBuffer());
  throw Error('Unsupported document body');
}

export function documentBucket(bucket) {
  async function head(key) {
    try { return objectInfo(key, (await bucket.file(key).getMetadata())[0]); }
    catch (error) { if (error.code === 404) return null; throw error; }
  }
  return {
    head,
    async get(key) {
      const info = await head(key);
      if (!info) return null;
      // Pin the data stream to the same immutable generation as the metadata.
      const file = bucket.file(key, {generation: info.version});
      let body;
      return {...info, get body() { return body ??= Readable.toWeb(file.createReadStream()); },
        async arrayBuffer() { return new Response(this.body).arrayBuffer(); },
        async text() { return new Response(this.body).text(); }};
    },
    async put(key, value, options) {
      const file = bucket.file(key);
      if (value instanceof ReadableStream) {
        await pipeline(Readable.fromWeb(value), file.createWriteStream({metadata: metadata(options), validation: 'crc32c'}));
      } else {
        await file.save(await bytes(value), {metadata: metadata(options), validation: 'crc32c', resumable: false});
      }
      return head(key);
    },
    async delete(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) await bucket.file(key).delete({ignoreNotFound: true});
    },
    async createMultipartUpload(key, options) {
      // The report bridge emits sequential 6 MiB parts. GCS exposes the object only on finalization.
      const stream = bucket.file(key).createWriteStream({resumable: true, chunkSize: 1024 * 1024,
        validation: 'crc32c', metadata: metadata(options), preconditionOpts: {ifGenerationMatch: 0}});
      const done = finished(stream);
      done.catch(() => {}); // await on complete/abort, including asynchronous socket errors
      const parts = [];
      let closed = false;
      return {
        async uploadPart(partNumber, input) {
          if (closed || partNumber !== parts.length + 1) throw Error('Invalid report part order');
          const chunk = await bytes(input);
          await new Promise((resolve, reject) => stream.write(chunk, err => err ? reject(err) : resolve()));
          const part = {partNumber, etag: createHash('sha256').update(chunk).digest('hex')};
          parts.push(part);
          return {...part};
        },
        async complete(submitted) {
          if (closed || !parts.length || submitted.length !== parts.length ||
              parts.some((p,i) => p.partNumber !== submitted[i].partNumber || p.etag !== submitted[i].etag)) {
            throw Error('Incomplete report upload');
          }
          closed = true;
          stream.end();
          await done;
          return head(key);
        },
        async abort() { closed = true; stream.destroy(); await done.catch(() => {}); }
      };
    }
  };
}
