import reference from './service-area-reference.json' with { type: 'json' };
const normalise = (value: string) => value.trim().normalize('NFKC').toLocaleLowerCase('en-AU').replace(/\s+/g, ' ');
export function findServiceArea(suburb: string, postcode: string) {
  const matches = reference.filter(row => normalise(row.suburb) === normalise(suburb) && row.postcode === postcode.trim());
  if (!matches.length) return { classification: 'by_request', message: 'This suburb and postcode combination is not in the supplied reference. Ask us to confirm coverage and any travel requirements.' };
  const row = matches[0];
  return { ...row, message: row.classification === 'manual_review'
    ? row.reason + '. Please request manual confirmation before arranging attendance.'
    : 'This exact suburb and postcode combination appears in the supplied Perth/Peel reference. Service, travel, access and appointment availability still need confirmation; this is not a booking guarantee.' };
}
