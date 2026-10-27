/** Integer AUD cents; discount the approved service total once, not a Stripe tax-inclusive amount twice. */
export function pcrRoutineDiscount(exGstCents:number,gstCents:number){
 if(!Number.isSafeInteger(exGstCents)||exGstCents<=0||exGstCents>100000000||!Number.isSafeInteger(gstCents)||gstCents<0||gstCents>100000000)throw new RangeError('Invalid approved service price');
 const baseTotalCents=exGstCents+gstCents,discountCents=Math.round(baseTotalCents*2000/10000),totalCents=baseTotalCents-discountCents;
 const priceExGstCents=Math.round(exGstCents*8000/10000);
 if(discountCents<=0||totalCents<=0||priceExGstCents>totalCents)throw new RangeError('Price is too small for the discount');
 return {baseExGstCents:exGstCents,baseGstCents:gstCents,baseTotalCents,discountCents,priceExGstCents,gstCents:totalCents-priceExGstCents,totalCents};
}
