/** Deterministic, repeatable build step; keep the approved JPEG masters intact. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const images = new URL('../../apps/marketing/app/components/images/', import.meta.url);
const output = new URL('../../artifacts/service-enhancements/', import.meta.url);
const assets = [];
for (const name of ['co-working', 'modular', 'innovation', 'subscription-care']) {
  for (const suffix of ['', '-small']) {
    const filename = name + suffix;
    const source = await readFile(new URL(filename + '.jpg', images));
    const original = await sharp(source).metadata();
    const encoded = await sharp(source).webp({ quality: 82, effort: 6 }).toBuffer();
    const result = await sharp(encoded).metadata();
    assert.equal(result.format, 'webp');
    assert.equal(result.width, original.width);
    assert.equal(result.height, original.height);
    assert.ok(encoded.length < source.length, filename + ' must be smaller than its JPEG master');
    await writeFile(new URL(filename + '.webp', images), encoded);
    assets.push({
      image: filename,
      width: result.width,
      height: result.height,
      originalBytes: source.length,
      servedBytes: encoded.length,
    });
  }
}
const originalBytes = assets.reduce((sum, asset) => sum + asset.originalBytes, 0);
const servedBytes = assets.reduce((sum, asset) => sum + asset.servedBytes, 0);
await mkdir(output, { recursive: true });
await writeFile(
  new URL('image-optimisation.json', output),
  JSON.stringify(
    {
      assets,
      originalBytes,
      servedBytes,
      savedBytes: originalBytes - servedBytes,
    },
    null,
    2,
  ) + '\n',
);
console.log(`WebP: ${assets.length} variants, ${originalBytes} → ${servedBytes} bytes.`);
