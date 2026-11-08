import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Exercise the actual TSX export rather than duplicating its conversion rules.
const output = await build({
  entryPoints: ['apps/platform/app/components/OperationForm.tsx'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
});
const { formValues } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].contents).toString('base64')
);

test('commercial forms send numeric monetary and review parameters, including explicit zero', () => {
  const fields = [
    'sourceAmountCents',
    'reviewBasisPoints',
    'indexNumerator',
    'indexDenominator',
    'floorCents',
    'capCents',
    'quotedCents',
    'gstBasisPoints',
    'version',
  ];
  for (const value of ['0', '1000', '-125']) {
    const form = new FormData();
    for (const name of fields) form.set(name, value);
    const actual = formValues(form);
    for (const name of fields) assert.equal(actual[name], Number(value));
  }
});

test('commercial form optional values remain absent and explicit option dates become ISO timestamps', () => {
  const form = new FormData();
  for (const name of ['floorCents', 'capCents', 'quotedCents', 'optionClosesAt'])
    form.set(name, '');
  form.set('optionOpensAt', '2026-10-27T09:00:00+08:00');
  form.set('newDueAt', '2026-10-28T10:00:00+08:00');
  form.set('periodFrom', '2026-10-27');
  assert.deepEqual(formValues(form), {
    optionOpensAt: '2026-10-27T01:00:00.000Z',
    newDueAt: '2026-10-28T02:00:00.000Z',
    periodFrom: '2026-10-27',
  });
});
