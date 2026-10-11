/** Internal-only cents/basis-point pricing; never a public rate without a verified agreement. */
export interface V2PricingInput {
  hoursMilli: number;
  visits: number;
  quantity: number;
  complexityBp: number;
  externalPassThroughCents: number;
  loadedHourlyCents: number;
  travelVisitCents: number;
  fixedAdminCents: number;
  contingencyBp: number;
  targetMarginBp: number;
  gstBp: number;
}
function integer(value: number, min: number, max: number, field: string) {
  if (!Number.isSafeInteger(value) || value<min || value>max) throw new RangeError('Invalid '+field);
}
export function calculateV2Quote(input: V2PricingInput) {
  integer(input.hoursMilli,0,100_000_000,'hoursMilli');
  integer(input.visits,0,10_000,'visits');
  integer(input.quantity,1,10_000,'quantity');
  integer(input.complexityBp,1000,50_000,'complexityBp');
  integer(input.externalPassThroughCents,0,1_000_000_000,'externalPassThroughCents');
  integer(input.loadedHourlyCents,0,10_000_000,'loadedHourlyCents');
  integer(input.travelVisitCents,0,10_000_000,'travelVisitCents');
  integer(input.fixedAdminCents,0,10_000_000,'fixedAdminCents');
  integer(input.contingencyBp,0,5000,'contingencyBp');
  integer(input.targetMarginBp,0,9500,'targetMarginBp');
  integer(input.gstBp,0,3000,'gstBp');
  const laborCents=Math.ceil(input.hoursMilli*input.loadedHourlyCents/1000);
  const attendanceCents=input.visits*input.travelVisitCents;
  const baseUnitCostCents=laborCents+attendanceCents+input.fixedAdminCents;
  const complexityAdjustedCents=Math.ceil(baseUnitCostCents*input.complexityBp/10000);
  const riskAdjustedUnitCents=Math.ceil(complexityAdjustedCents*(10000+input.contingencyBp)/10000);
  const unitServiceFeeCents=Math.ceil(riskAdjustedUnitCents*10000/(10000-input.targetMarginBp));
  const serviceFeeCents=unitServiceFeeCents*input.quantity;
  const externalCents=input.externalPassThroughCents*input.quantity;
  const exGstCents=serviceFeeCents+externalCents;
  const gstCents=Math.round(exGstCents*input.gstBp/10000);
  const totalCents=exGstCents+gstCents;
  for (const value of [laborCents,attendanceCents,riskAdjustedUnitCents,unitServiceFeeCents,serviceFeeCents,externalCents,exGstCents,gstCents,totalCents])
    if (!Number.isSafeInteger(value) || value<0 || value>1_000_000_000_000) throw new RangeError('Quote exceeds monetary limit');
  return {laborCents,attendanceCents,riskAdjustedUnitCents,unitServiceFeeCents,serviceFeeCents,externalCents,exGstCents,gstCents,totalCents,monthlyServiceFeeCents:Math.ceil(serviceFeeCents/12)};
}
