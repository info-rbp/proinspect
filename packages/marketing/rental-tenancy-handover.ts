import { z } from 'zod';
import { perthLocalToUtc } from './leasing-operations.ts';

const dateOnly=z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'Use a valid Perth calendar date.');
const ref=z.string().trim().min(8).max(180);
export const tenancyHandoverInput=z.object({
 requestKey:z.string().uuid(),
 applicationVersion:z.number().int().positive(),
 startsOn:dateOnly,
 endsOn:dateOnly.nullable().optional(),
 writtenOfferReference:ref,
 confirmWrittenOffer:z.literal(true),
 confirmRecipientAuthority:z.literal(true),
 confirmPrivateInvitations:z.literal(true),
});
export const tenancyActivationInput=z.object({
 activationReference:ref,
 confirmExecutedAgreement:z.literal(true),
 confirmVerifiedParticipants:z.literal(true),
 confirmCommencementRecords:z.literal(true),
});
export const tenancyVoidInput=z.object({
 reasonReference:ref,
 confirmVoid:z.literal(true),
});
export function preparedTenancyDates(startsOn:string,endsOn?:string|null,at=Date.now()){
 const start=perthLocalToUtc(startsOn+'T00:00');
 const end=endsOn?perthLocalToUtc(endsOn+'T23:59'):null;
 if(Date.parse(start)<at-86400000)throw Error('Commencement must not be backdated.');
 if(end&&Date.parse(end)<=Date.parse(start))throw Error('Tenancy end must follow commencement.');
 return {startsAt:start,endsAt:end};
}
export function agreementMatchesPreparedTerms(
 values:Record<string,unknown>,startsOn:string,endsOn?:string|null
){
 if(String(values.startsAt??'')!==startsOn)return false;
 if(endsOn)return String(values.agreementType??'').toLowerCase()==='fixed'
   &&String(values.fixedTermEndsAt??'')===endsOn;
 return String(values.agreementType??'').toLowerCase()==='periodic'
   &&!String(values.fixedTermEndsAt??'').trim();
}
