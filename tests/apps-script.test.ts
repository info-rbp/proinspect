import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { runInNewContext } from 'node:vm';

// Executes the actual receiver source against deterministic Google-service doubles.
// It does not contact Google or write to a connected spreadsheet.
function receiver() {
  const rows: unknown[][] = [];
  const secret = 'synthetic-script-contract-secret';
  let locked = false;
  const sheet = {
    getLastRow: () => rows.length,
    appendRow: (values: unknown[]) => {
      rows.push(values);
    },
    getRange: (range: string | number, column?: number) =>
      typeof range === 'string'
        ? {
            createTextFinder: (text: string) => ({
              matchEntireCell: () => ({
                findNext: () => {
                  const index = rows.findIndex((r) => r[0] === text);
                  return index < 0 ? null : { getRow: () => index + 1 };
                },
              }),
            }),
          }
        : { getValues: () => [rows[range - 1].slice(column! - 1, column! + 2)] },
  };
  const scope: Record<string, any> = {
    Date,
    JSON,
    Error,
    LockService: {
      getScriptLock: () => ({
        waitLock: () => {
          locked = true;
        },
        hasLock: () => locked,
        releaseLock: () => {
          locked = false;
        },
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key: string) =>
          key === 'PROINSPECT_WEBHOOK_SECRET' ? secret : 'synthetic-sheet-id',
      }),
    },
    SpreadsheetApp: { openById: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }) },
    Utilities: {
      Charset: { UTF_8: 'UTF-8' },
      computeHmacSha256Signature: (value: string, key: string) =>
        Array.from(createHmac('sha256', key).update(value).digest()),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text: string) => ({ setMimeType: () => text }),
    },
  };
  runInNewContext(readFileSync('integrations/apps-script/Code.gs', 'utf8'), scope);
  const signed = (changes: Record<string, unknown> = {}) => {
    const event: Record<string, any> = {
      version: 1,
      eventId: 'evt_fixture_123',
      entityId: 'wo_fixture',
      kind: 'work_order.updated',
      timestamp: String(Math.floor(Date.now() / 1000)),
      payload: { status: 'completed', workOrderId: 'wo_fixture' },
      ...changes,
    };
    event.signature = createHmac('sha256', secret)
      .update(
        [
          event.timestamp,
          event.eventId,
          event.kind,
          event.entityId,
          JSON.stringify(event.payload),
        ].join('.'),
      )
      .digest('hex');
    return event;
  };
  return {
    rows,
    signed,
    call: (e: Record<string, any>) =>
      JSON.parse(scope.doPost({ postData: { contents: JSON.stringify(e) } })),
    locked: () => locked,
  };
}
test('Apps Script receiver authenticates, deduplicates and rejects changed retries', () => {
  const r = receiver(),
    event = r.signed();
  assert.equal(r.call(event).ok, true);
  assert.equal(r.call(event).ok, true);
  assert.equal(r.rows.length, 2); // One header and one event, not two deliveries.
  assert.equal(r.call(r.signed({ payload: { status: 'cancelled' } })).ok, false);
  assert.equal(r.rows.length, 2);
  assert.equal(r.locked(), false);
});
test('Apps Script rejects missing signatures, expired timestamps and sensitive fields', () => {
  const r = receiver();
  assert.equal(r.call({ ...r.signed(), signature: '0'.repeat(64) }).ok, false);
  assert.equal(r.call(r.signed({ timestamp: 'not-a-timestamp' })).ok, false);
  assert.equal(r.call(r.signed({ timestamp: '1' })).ok, false);
  assert.equal(r.call(r.signed({ payload: { evidence: 'must not be projected' } })).ok, false);
  assert.equal(r.rows.length, 0);
});
