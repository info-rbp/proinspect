/** Exact integer-cent presentation and spreadsheet-safe text export. */
export function moneyAUD(value: string | number | bigint): string {
  if (typeof value === 'number' && !Number.isSafeInteger(value))
    throw new Error('Money must use exact integer cents.');
  if (typeof value === 'string' && !/^-?\d+$/.test(value))
    throw new Error('Money must use exact integer cents.');
  const amount = BigInt(value),
    magnitude = amount < 0n ? -amount : amount;
  return (
    (amount < 0n ? '-' : '') +
    '$' +
    (magnitude / 100n).toLocaleString('en-AU') +
    '.' +
    String(magnitude % 100n).padStart(2, '0')
  );
}
export function csvCell(value: string | number | bigint | null | undefined): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('Export requires exact integers.');
    return String(value);
  }
  if (typeof value === 'bigint') return String(value);
  let text = value;
  if (/^[=+\-@]/.test(text.trimStart()) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function csvRows(
  rows: ReadonlyArray<ReadonlyArray<string | number | bigint | null | undefined>>,
): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
