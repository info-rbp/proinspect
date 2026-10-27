import { test, expect } from '@playwright/test';
// Isolated browser fixtures exercise real IndexedDB/WebCrypto, not hosted identities.
// Intercept only the intended report POST; router manifests and other fetches remain real.
test('an in-flight acknowledgement cannot erase a newer encrypted draft', async ({ page }) => {
  await page.goto('/signin');
  const result = await page.evaluate(async () => {
    const modulePath = '/app/lib/report-offline.ts';
    const offline = await import(/* @vite-ignore */ modulePath);
    const scope = {
      userId: 'offline_qa',
      kind: 'staff',
      scopeId: 'operations',
      reportId: 'report_race',
    };
    const phrase = 'synthetic browser passphrase';
    const originalFetch = window.fetch;
    let release!: (r: Response) => void, started!: () => void;
    const ready = new Promise<void>((r) => {
      started = r;
    });
    window.fetch = async (input, init) => {
      const request = new Request(
        new URL(input instanceof Request ? input.url : String(input), location.origin),
        init,
      );
      const url = new URL(request.url);
      if (
        request.method !== 'POST' ||
        url.origin !== location.origin ||
        url.pathname !== '/api/w/staff/operations/reports/report_race/sync'
      )
        return originalFetch.call(window, input, init);
      return new Promise<Response>((resolve) => {
        release = resolve;
        started();
      });
    };
    try {
      await offline.purgeOfflineWorkspace(scope);
      await offline.saveOfflineDraft(scope, phrase, {
        revision: 5,
        content: { areas: [], summary: 'first' },
        operationId: 'offline_first',
      });
      const background = await fetch('/robots.txt');
      if (!background.ok)
        throw new Error('Unrelated page fetch must remain independent of the report fixture.');
      const sending = offline.syncOfflineDraft(scope, phrase, '/api/w/staff/operations');
      // An early implementation failure must reject, not leave the request latch pending.
      await Promise.race([
        ready,
        sending.then(() => {
          throw new Error('Sync finished before its request was intercepted.');
        }),
      ]);
      await offline.saveOfflineDraft(scope, phrase, {
        revision: 5,
        content: { areas: [], summary: 'newer' },
        operationId: 'offline_second',
      });
      release(Response.json({ revision: 6 }));
      const ack = await sending;
      const saved = await offline.restoreOfflineDraft(scope, phrase);
      return {
        retained: ack.retainedNewerDraft,
        summary: saved.content.summary,
        backgroundStatus: background.status,
      };
    } finally {
      window.fetch = originalFetch;
      await offline.purgeOfflineWorkspace(scope);
    }
  });
  expect(result).toEqual({ retained: true, summary: 'newer', backgroundStatus: 200 });
});
test('invalid server acknowledgements retain encrypted draft and queued evidence', async ({
  page,
}) => {
  await page.goto('/signin');
  const result = await page.evaluate(async () => {
    const modulePath = '/app/lib/report-offline.ts';
    const offline = await import(/* @vite-ignore */ modulePath);
    const scope = {
      userId: 'offline_qa',
      kind: 'staff',
      scopeId: 'operations',
      reportId: 'report_ack',
    };
    const phrase = 'synthetic browser passphrase';
    const originalFetch = window.fetch;
    let draftRejected = false,
      photoRejected = false;
    const intercept = (reply: (sha256: string) => Response) => {
      window.fetch = async (input, init) => {
        const request = new Request(
          new URL(input instanceof Request ? input.url : String(input), location.origin),
          init,
        );
        const url = new URL(request.url);
        if (
          request.method === 'POST' &&
          url.origin === location.origin &&
          [
            '/api/w/staff/operations/reports/report_ack/sync',
            '/api/w/staff/operations/reports/report_ack/evidence',
          ].includes(url.pathname)
        ) {
          let sha256 = '';
          if (url.pathname.endsWith('/evidence')) {
            const f = (await request.formData()).get('file') as File;
            sha256 = Array.from(
              new Uint8Array(await crypto.subtle.digest('SHA-256', await f.arrayBuffer())),
              (b) => b.toString(16).padStart(2, '0'),
            ).join('');
          }
          return reply(sha256);
        }
        return originalFetch.call(window, input, init);
      };
    };
    try {
      await offline.saveOfflineDraft(scope, phrase, {
        revision: 3,
        content: { areas: [] },
        operationId: 'offline_invalid_ack',
      });
      intercept(() => Response.json({ revision: 99 }));
      try {
        await offline.syncOfflineDraft(scope, phrase, '/api/w/staff/operations');
      } catch {
        draftRejected = true;
      }
      const draft = await offline.restoreOfflineDraft(scope, phrase);
      await offline.queueOfflinePhoto(
        scope,
        phrase,
        new File([new Uint8Array([255, 216, 255, 0])], 'synthetic.jpg', { type: 'image/jpeg' }),
        'area_general',
      );
      intercept(() => Response.json({ id: 'evidence_qa', status: 'rejected' }));
      try {
        await offline.syncOfflinePhotos(scope, phrase, '/api/w/staff/operations');
      } catch {
        photoRejected = true;
      }
      intercept((sha256) => Response.json({ id: 'evidence_qa', status: 'pending', sha256 }));
      const recovered = await offline.syncOfflinePhotos(scope, phrase, '/api/w/staff/operations');
      return { draftRejected, revision: draft.revision, photoRejected, recovered };
    } finally {
      window.fetch = originalFetch;
      await offline.purgeOfflineWorkspace(scope);
    }
  });
  expect(result).toEqual({ draftRejected: true, revision: 3, photoRejected: true, recovered: 1 });
});
test('interrupted photo queue retries only the unacknowledged encrypted evidence', async ({
  page,
}) => {
  await page.goto('/signin');
  const result = await page.evaluate(async () => {
    const modulePath = '/app/lib/report-offline.ts';
    const offline = await import(/* @vite-ignore */ modulePath);
    const scope = {
      userId: 'offline_qa',
      kind: 'staff',
      scopeId: 'operations',
      reportId: 'report_photos',
    };
    const phrase = 'synthetic browser passphrase';
    const originalFetch = window.fetch;
    let calls = 0,
      interrupted = false;
    const intercept = (reply: (sha256: string) => Response) => {
      window.fetch = async (input, init) => {
        const request = new Request(
          new URL(input instanceof Request ? input.url : String(input), location.origin),
          init,
        );
        const url = new URL(request.url);
        if (
          request.method === 'POST' &&
          url.origin === location.origin &&
          url.pathname === '/api/w/staff/operations/reports/report_photos/evidence'
        ) {
          const f = (await request.formData()).get('file') as File;
          const sha256 = Array.from(
            new Uint8Array(await crypto.subtle.digest('SHA-256', await f.arrayBuffer())),
            (b) => b.toString(16).padStart(2, '0'),
          ).join('');
          return reply(sha256);
        }
        return originalFetch.call(window, input, init);
      };
    };
    try {
      for (let i = 0; i < 3; i++)
        await offline.queueOfflinePhoto(
          scope,
          phrase,
          new File([new Uint8Array([255, 216, 255, i])], 'synthetic-' + i + '.jpg', {
            type: 'image/jpeg',
          }),
          'area_general',
        );
      intercept((sha256) =>
        ++calls === 2
          ? new Response('Unavailable', { status: 503 })
          : Response.json({ id: 'evidence_' + calls, status: 'pending', sha256 }),
      );
      try {
        await offline.syncOfflinePhotos(scope, phrase, '/api/w/staff/operations');
      } catch {
        interrupted = true;
      }
      let retries = 0;
      intercept((sha256) => {
        retries++;
        return Response.json({ id: 'retry_' + retries, status: 'pending', sha256 });
      });
      const recovered = await offline.syncOfflinePhotos(scope, phrase, '/api/w/staff/operations');
      return { interrupted, calls, retries, recovered };
    } finally {
      window.fetch = originalFetch;
      await offline.purgeOfflineWorkspace(scope);
    }
  });
  expect(result).toEqual({ interrupted: true, calls: 2, retries: 2, recovered: 2 });
});

test('legacy queued evidence upgrades its plaintext metadata without losing a pending photo', async ({
  page,
}) => {
  await page.goto('/signin');
  const result = await page.evaluate(async () => {
    const modulePath = '/app/lib/report-offline.ts';
    const offline = await import(/* @vite-ignore */ modulePath);
    const scope = {
      userId: 'legacy_qa',
      kind: 'staff',
      scopeId: 'operations',
      reportId: 'report_legacy',
    };
    const phrase = 'legacy synthetic fieldwork passphrase';
    const key = 'legacy_qa::staff::operations::report_legacy::legacy_photo';
    const raw = new Uint8Array([255, 216, 255, 0]);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('proinspect-encrypted-report-drafts', 1);
      request.onupgradeneeded = () => {
        for (const name of ['drafts', 'photos'])
          if (!request.result.objectStoreNames.contains(name))
            request.result.createObjectStore(name, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const access = (
      mode: IDBTransactionMode,
      run: (store: IDBObjectStore, done: (value: any) => void) => void,
    ) =>
      new Promise<any>((resolve, reject) => {
        const tx = db.transaction('photos', mode);
        let value: any;
        run(tx.objectStore('photos'), (result) => {
          value = result;
        });
        tx.oncomplete = () => resolve(value);
        tx.onerror = () => reject(tx.error);
      });
    const oldFetch = window.fetch;
    try {
      const sealed = await offline.encryptOffline(raw, phrase, key);
      await access('readwrite', (store) =>
        store.put({
          ...sealed,
          areaId: 'private_area',
          componentId: 'private_component',
          fileName: 'private-name.jpg',
        }),
      );
      window.fetch = async (input, init) => {
        const request = new Request(
          new URL(input instanceof Request ? input.url : String(input), location.origin),
          init,
        );
        if (
          request.method === 'POST' &&
          new URL(request.url).pathname === '/api/w/staff/operations/reports/report_legacy/evidence'
        )
          return new Response('Access revoked', { status: 403 });
        return oldFetch.call(window, input, init);
      };
      let rejected = false;
      try {
        await offline.syncOfflinePhotos(scope, phrase, '/api/w/staff/operations');
      } catch {
        rejected = true;
      }
      const saved = await access('readonly', (store, done) => {
        const r = store.get(key);
        r.onsuccess = () => done(r.result);
      });
      const recovered = offline.unpackOfflinePhoto(
        await offline.decryptOffline(saved, phrase, key),
      );
      return {
        rejected,
        format: saved.format,
        metadataVisible: JSON.stringify(saved).includes('private'),
        filename: recovered.metadata.fileName,
        bytes: Array.from(recovered.raw),
      };
    } finally {
      window.fetch = oldFetch;
      db.close();
      await offline.purgeOfflineWorkspace(scope);
    }
  });
  expect(result).toEqual({
    rejected: true,
    format: 2,
    metadataVisible: false,
    filename: 'private-name.jpg',
    bytes: [255, 216, 255, 0],
  });
});
