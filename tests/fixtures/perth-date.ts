/** A future Perth calendar weekday, independent of runner timezone and UTC rollover. */
export function futurePerthWeekday(now = Date.now(), leadDays = 4): string {
  if (!Number.isFinite(now) || !Number.isInteger(leadDays) || leadDays < 1 || leadDays > 90) {
    throw new Error('Invalid fixture date or lead time');
  }
  const perthDate = new Date(now + 8 * 60 * 60 * 1000);
  if (Number.isNaN(perthDate.getTime())) throw new Error('Invalid fixture date');
  perthDate.setUTCHours(0, 0, 0, 0);
  perthDate.setUTCDate(perthDate.getUTCDate() + leadDays);
  while ([0, 6].includes(perthDate.getUTCDay())) {
    perthDate.setUTCDate(perthDate.getUTCDate() + 1);
  }
  return perthDate.toISOString().slice(0, 10);
}
