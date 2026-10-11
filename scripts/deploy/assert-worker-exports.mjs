/** Fail builds that drop either Durable Object class required by proinspect-platform. */
import { readFileSync } from 'node:fs';

const entry = readFileSync(new URL('../../apps/platform/build/server/index.js', import.meta.url), 'utf8');
const exportStatement = entry.slice(entry.lastIndexOf('export'));
for (const className of ['BookingCoordinator', 'BookingScheduler']) {
  if (!exportStatement.includes(className))
    throw new Error(`The compiled Worker must export ${className} to preserve Durable Object deployment compatibility.`);
}
console.log('Worker exports both the existing BookingCoordinator and the new BookingScheduler.');
