/** Local Friday settlement anchor for Australian Perth property subscriptions.
 * Keep this pure and dependency-free for deterministic calendar tests.
 * Western Australia observes UTC+08 and no daylight saving time.
 */
export function nextFridayPerthAnchor(nowMs: number = Date.now()): number {
 if (!Number.isSafeInteger(nowMs) || nowMs <= 0) throw new RangeError('Invalid billing timestamp.');
 const local = new Date(nowMs + 8 * 3600_000);
 const days = (5 - local.getUTCDay() + 7) % 7;
 let anchor = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + days, 1, 0, 0);
 if (anchor <= nowMs + 2 * 3600_000) anchor += 7 * 86400_000;
 return Math.floor(anchor / 1000);
}
