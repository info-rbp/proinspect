/**
 * Encrypted, opt-in offline inspection drafts and JPEG queue.
 * Keys are derived from an explicit device passphrase and NEVER persisted.
 * Server permission, evidence review and optimistic revision checks remain authoritative.
 */
export interface OfflineScope {
  userId: string;
  kind: string;
  scopeId: string;
  reportId: string;
}
export interface OfflineDraft {
  revision: number;
  content: unknown;
  operationId: string;
}
export interface CipherRecord {
  id: string;
  salt: Uint8Array;
  iv: Uint8Array;
  cipher: Uint8Array;
  savedAt: string;
}
interface PhotoRecord extends CipherRecord {
  format?: 2;
  areaId?: string;
  componentId?: string;
  fileName?: string;
}
export interface OfflinePhotoMetadata {
  areaId: string;
  componentId: string;
  fileName: string;
}
const encoder = new TextEncoder(),
  decoder = new TextDecoder();
const keyFor = (scope: OfflineScope) => {
  const parts = [scope.userId, scope.kind, scope.scopeId, scope.reportId];
  if (parts.some((value) => typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value)))
    throw new Error('Invalid offline workspace.');
  return parts.join('::');
};
/** A response for an old upload must never consume a newly saved encrypted copy. */
export function sameOfflineSnapshot(a: CipherRecord | undefined, b: CipherRecord): boolean {
  return (
    !!a &&
    a.id === b.id &&
    a.savedAt === b.savedAt &&
    ['salt', 'iv', 'cipher'].every((key) => {
      const x = a[key as 'salt' | 'iv' | 'cipher'],
        y = b[key as 'salt' | 'iv' | 'cipher'];
      return x.length === y.length && x.every((byte, index) => byte === y[index]);
    })
  );
}
function syncTarget(scope: OfflineScope, apiBase: string): string {
  keyFor(scope);
  const expected =
    '/api/w/' + encodeURIComponent(scope.kind) + '/' + encodeURIComponent(scope.scopeId);
  if (apiBase !== expected)
    throw new Error('Offline data can only be sent to its original workspace.');
  return expected + '/reports/' + encodeURIComponent(scope.reportId);
}
function validDraft(value: unknown): value is OfflineDraft {
  const d = value as Partial<OfflineDraft> | null;
  return (
    !!d &&
    Number.isSafeInteger(d.revision) &&
    Number(d.revision) > 0 &&
    typeof d.operationId === 'string' &&
    /^[A-Za-z0-9_-]{8,100}$/.test(d.operationId) &&
    !!d.content &&
    typeof d.content === 'object'
  );
}

/** All evidence metadata is encrypted with the image, not persisted beside its ciphertext. */
export function packOfflinePhoto(raw: Uint8Array, metadata: OfflinePhotoMetadata): Uint8Array {
  validatePhotoMetadata(metadata);
  if (
    raw.length > 5 * 1024 * 1024 ||
    raw.length < 3 ||
    raw[0] !== 255 ||
    raw[1] !== 216 ||
    raw[2] !== 255
  )
    throw new Error('Offline evidence must contain JPEG bytes smaller than 5 MB.');
  const header = encoder.encode(JSON.stringify(metadata)),
    packed = new Uint8Array(8 + header.length + raw.length);
  packed.set([80, 73, 80, 50]);
  new DataView(packed.buffer).setUint32(4, header.length);
  packed.set(header, 8);
  packed.set(raw, 8 + header.length);
  return packed;
}
function validatePhotoMetadata(value: unknown): asserts value is OfflinePhotoMetadata {
  const m = value as Partial<OfflinePhotoMetadata> | null;
  if (
    !m ||
    typeof m.areaId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(m.areaId) ||
    typeof m.componentId !== 'string' ||
    (m.componentId !== '' && !/^[A-Za-z0-9_-]{1,100}$/.test(m.componentId)) ||
    typeof m.fileName !== 'string' ||
    !m.fileName ||
    m.fileName.length > 250 ||
    /[\x00-\x1f\x7f]/.test(m.fileName)
  )
    throw new Error('Offline evidence metadata is invalid.');
}
export function unpackOfflinePhoto(packed: Uint8Array): {
  raw: Uint8Array;
  metadata: OfflinePhotoMetadata;
} {
  if (
    packed.length < 11 ||
    packed[0] !== 80 ||
    packed[1] !== 73 ||
    packed[2] !== 80 ||
    packed[3] !== 50
  )
    throw new Error('Unsupported encrypted photo format.');
  const length = new DataView(packed.buffer, packed.byteOffset, packed.byteLength).getUint32(4);
  if (length < 2 || length > 8192 || length + 11 > packed.length)
    throw new Error('Encrypted evidence metadata is incomplete.');
  const metadata: unknown = JSON.parse(decoder.decode(packed.slice(8, 8 + length)));
  validatePhotoMetadata(metadata);
  const raw = packed.slice(8 + length);
  if (raw[0] !== 255 || raw[1] !== 216 || raw[2] !== 255 || raw.length > 5 * 1024 * 1024)
    throw new Error('Encrypted evidence does not contain a supported JPEG.');
  return { raw, metadata };
}
export async function photoAcknowledgementMatches(
  value: unknown,
  raw: Uint8Array,
): Promise<boolean> {
  const result = value as { id?: unknown; status?: unknown; sha256?: unknown } | null;
  if (
    !result ||
    typeof result.id !== 'string' ||
    !result.id ||
    !['pending', 'accepted'].includes(String(result.status)) ||
    typeof result.sha256 !== 'string'
  )
    return false;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', raw as BufferSource));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('') === result.sha256;
}
async function derive(passphrase: string, salt: Uint8Array) {
  if (passphrase.length < 12) throw new Error('Use a device passphrase of at least 12 characters.');
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 180000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function encryptOffline(
  payload: Uint8Array,
  passphrase: string,
  aad: string,
): Promise<CipherRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12)),
    key = await derive(passphrase, salt);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: encoder.encode(aad) },
    key,
    payload as BufferSource,
  );
  return { id: aad, salt, iv, cipher: new Uint8Array(cipher), savedAt: new Date().toISOString() };
}
export async function decryptOffline(
  record: CipherRecord,
  passphrase: string,
  aad: string,
): Promise<Uint8Array> {
  if (record.id !== aad)
    throw new Error('This offline record belongs to another reporting context.');
  const key = await derive(passphrase, record.salt);
  const result = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: record.iv as BufferSource, additionalData: encoder.encode(aad) },
    key,
    record.cipher as BufferSource,
  );
  return new Uint8Array(result);
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined')
      return reject(new Error('Offline storage is not available in this browser.'));
    const req = indexedDB.open('proinspect-encrypted-report-drafts', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('drafts'))
        db.createObjectStore('drafts', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('photos'))
        db.createObjectStore('photos', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx<T>(
  name: 'drafts' | 'photos',
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore, done: (v: T) => void) => void,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tr = db.transaction(name, mode),
      store = tr.objectStore(name);
    let value: T;
    tr.oncomplete = () => {
      db.close();
      resolve(value);
    };
    tr.onerror = () => {
      db.close();
      reject(tr.error);
    };
    tr.onabort = () => {
      db.close();
      reject(tr.error);
    };
    try {
      fn(store, (v) => {
        value = v;
      });
    } catch (e) {
      tr.abort();
      reject(e);
    }
  });
}
export async function saveOfflineDraft(
  scope: OfflineScope,
  passphrase: string,
  draft: OfflineDraft,
) {
  if (!validDraft(draft)) throw new Error('Invalid offline draft revision or operation identity.');
  const key = keyFor(scope),
    sealed = await encryptOffline(encoder.encode(JSON.stringify(draft)), passphrase, key);
  await tx<void>('drafts', 'readwrite', (store) => {
    store.put(sealed);
  });
  return sealed.savedAt;
}
export async function restoreOfflineDraft(
  scope: OfflineScope,
  passphrase: string,
): Promise<OfflineDraft | null> {
  const key = keyFor(scope),
    record = await tx<CipherRecord | undefined>('drafts', 'readonly', (store, done) => {
      const req = store.get(key);
      req.onsuccess = () => done(req.result as CipherRecord | undefined);
    });
  if (!record) return null;
  const draft: unknown = JSON.parse(decoder.decode(await decryptOffline(record, passphrase, key)));
  if (!validDraft(draft)) throw new Error('The encrypted draft has an unsupported format.');
  return draft;
}
export async function removeOfflineDraft(scope: OfflineScope) {
  await tx<void>('drafts', 'readwrite', (store) => {
    store.delete(keyFor(scope));
  });
}
export async function queueOfflinePhoto(
  scope: OfflineScope,
  passphrase: string,
  file: File,
  areaId: string,
  componentId = '',
) {
  if (file.type !== 'image/jpeg' || file.size > 5 * 1024 * 1024)
    throw new Error('Offline evidence must be a JPEG smaller than 5 MB.');
  const id = 'photo_' + crypto.randomUUID(),
    key = keyFor(scope) + '::' + id;
  const payload = packOfflinePhoto(new Uint8Array(await file.arrayBuffer()), {
    areaId,
    componentId,
    fileName: file.name,
  });
  const sealed = await encryptOffline(payload, passphrase, key);
  const record: PhotoRecord = { ...sealed, format: 2 };
  await tx<void>('photos', 'readwrite', (store) => {
    store.put(record);
  });
  return id;
}
export async function syncOfflineDraft(
  scope: OfflineScope,
  passphrase: string,
  apiBase: string,
): Promise<{ revision: number; replayed?: boolean; retainedNewerDraft?: boolean } | null> {
  const url = syncTarget(scope, apiBase),
    key = keyFor(scope);
  const snapshot = await tx<CipherRecord | undefined>('drafts', 'readonly', (store, done) => {
    const r = store.get(key);
    r.onsuccess = () => done(r.result as CipherRecord | undefined);
  });
  if (!snapshot) return null;
  const draft: unknown = JSON.parse(
    decoder.decode(await decryptOffline(snapshot, passphrase, key)),
  );
  if (!validDraft(draft)) throw new Error('The encrypted draft has an unsupported format.');
  const response = await fetch(url + '/sync', {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });
  if (response.status === 409)
    throw new Error(
      'The report changed on the server. Keep your encrypted copy and reconcile before submitting.',
    );
  if (!response.ok)
    throw new Error(
      'Offline draft could not be synchronised. It remains encrypted on this device.',
    );
  const result = (await response.json()) as { revision: number; replayed?: boolean };
  if (!Number.isSafeInteger(result.revision) || result.revision !== draft.revision + 1)
    throw new Error(
      'The server acknowledgement did not match this draft. The encrypted copy has been retained.',
    );
  const consumed = await tx<boolean>('drafts', 'readwrite', (store, done) => {
    const r = store.get(key);
    r.onsuccess = () => {
      if (sameOfflineSnapshot(r.result as CipherRecord | undefined, snapshot)) {
        store.delete(key);
        done(true);
      } else done(false);
    };
  });
  return { ...result, retainedNewerDraft: !consumed };
}
export async function syncOfflinePhotos(
  scope: OfflineScope,
  passphrase: string,
  apiBase: string,
): Promise<number> {
  const url = syncTarget(scope, apiBase),
    prefix = keyFor(scope) + '::';
  // Read identities only, then decrypt/upload one image at a time. Never materialise every photo in memory.
  const keys = await tx<IDBValidKey[]>('photos', 'readonly', (store, done) => {
    const r = store.getAllKeys(IDBKeyRange.bound(prefix, prefix + '\uffff'));
    r.onsuccess = () => done(r.result);
  });
  let saved = 0;
  for (const key of keys) {
    let photo = await tx<PhotoRecord | undefined>('photos', 'readonly', (store, done) => {
      const r = store.get(key);
      r.onsuccess = () => done(r.result as PhotoRecord | undefined);
    });
    if (!photo) continue;
    const decrypted = await decryptOffline(photo, passphrase, photo.id);
    let decoded: { raw: Uint8Array; metadata: OfflinePhotoMetadata };
    if (photo.format === 2) decoded = unpackOfflinePhoto(decrypted);
    else {
      // Upgrade legacy records only after successful decryption, without losing an unsent image.
      const metadata = {
        areaId: photo.areaId,
        componentId: photo.componentId ?? '',
        fileName: photo.fileName,
      };
      validatePhotoMetadata(metadata);
      decoded = { raw: decrypted, metadata };
      const old = photo;
      const upgraded: PhotoRecord = {
        ...(await encryptOffline(packOfflinePhoto(decrypted, metadata), passphrase, photo.id)),
        format: 2,
      };
      const replaced = await tx<boolean>('photos', 'readwrite', (store, done) => {
        const r = store.get(key);
        r.onsuccess = () => {
          if (sameOfflineSnapshot(r.result as PhotoRecord | undefined, old)) {
            store.put(upgraded);
            done(true);
          } else done(false);
        };
      });
      if (!replaced)
        throw new Error(
          'The local evidence changed during recovery. Its encrypted copy has been retained.',
        );
      photo = upgraded;
    }
    const { raw, metadata } = decoded;
    const form = new FormData();
    form.set('areaId', metadata.areaId);
    if (metadata.componentId) form.set('componentId', metadata.componentId);
    form.set('file', new File([raw as BlobPart], metadata.fileName, { type: 'image/jpeg' }));
    const response = await fetch(url + '/evidence', {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      body: form,
    });
    if (!response.ok)
      throw new Error(
        'Evidence sync stopped. Remaining photos stay encrypted and pending; check report permissions and revision.',
      );
    const result: unknown = await response.json();
    if (!(await photoAcknowledgementMatches(result, raw)))
      throw new Error(
        'Evidence acknowledgement requires review. The local encrypted photo has been retained.',
      );
    const acknowledged = photo;
    await tx<void>('photos', 'readwrite', (store) => {
      const r = store.get(key);
      r.onsuccess = () => {
        if (sameOfflineSnapshot(r.result as PhotoRecord | undefined, acknowledged))
          store.delete(key);
      };
    });
    saved++;
  }
  return saved;
}

/** Explicit local erasure, including queued photos, for an opt-in offline report. */
export async function purgeOfflineWorkspace(scope: OfflineScope): Promise<void> {
  await removeOfflineDraft(scope);
  const prefix = keyFor(scope) + '::';
  const keys = await tx<IDBValidKey[]>('photos', 'readonly', (store, done) => {
    const request = store.getAllKeys(IDBKeyRange.bound(prefix, prefix + '\uffff'));
    request.onsuccess = () => done(request.result);
  });
  await tx<void>('photos', 'readwrite', (store) => {
    for (const key of keys) store.delete(key);
  });
}
