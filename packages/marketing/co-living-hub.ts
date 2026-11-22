/** Public Co-Living marketing copy and illustrative financial arithmetic.
 * Site-specific offerings are proposed until authority and agreements are confirmed.
 * Never use these public projections to bill, collect rent or approve a tenancy.
 */
export const CO_LIVING_BANNERS=[
  {slug:'overview',title:'Co-Living Overview',description:'Discover how a suitable residential property can be prepared for furnished, room-by-room living with a coordinated operating programme.',href:'/co-living#overview',action:'Discover Co-Living',image:'co-living'},
  {slug:'how-it-works',title:'How Co-Living Works',description:'Follow the six clear steps from your first enquiry and site visit to proposal, property establishment, advertising and resident move-in.',href:'/co-living/how-it-works',action:'Explore the Process',image:'residential'},
  {slug:'property-setup',title:'Property Setup & Furnishing',description:'Understand private-room furniture, shared facilities, inspections, approved works and the owner-funded establishment budget.',href:'/co-living/property-setup',action:'Explore Property Setup',image:'leasing'},
  {slug:'inclusions',title:'What Is Included',description:'See which inspections, resident services, internet, utilities and fortnightly common-area cleaning ProInspect proposes to coordinate and fund.',href:'/co-living/inclusions',action:'View Service Inclusions',image:'maintenance'},
  {slug:'pricing',title:'Pricing & Owner Returns',description:'Understand the proposed 25% + GST management fee, annual utility allowance, owner expenses and financial outcome at different occupancy levels.',href:'/co-living/pricing',action:'Explore Pricing & Returns',image:'residential'},
  {slug:'example-property',title:'Example Co-Living Property',description:'Review an illustrative six-bedroom rental mix, furnishing budget and income comparison. All conversions and rental outcomes are subject to assessment.',href:'/co-living/example-property',action:'View Property Example',image:'co-living'},
] as const;
export type CoLivingGuideSlug=Exclude<(typeof CO_LIVING_BANNERS)[number]['slug'],'overview'>;
export const CO_LIVING_GUIDE_SLUGS=['how-it-works','property-setup','inclusions','pricing','example-property'] as const satisfies readonly CoLivingGuideSlug[];
export const CO_LIVING_STAGE_STEPS=[
 {title:'Enquiry',description:'Tell us about the property, existing occupancy and your investment objectives.',owner:'Provide the property details and available floor plan.',outcome:'Initial property profile and assessment appointment.'},
 {title:'Site Visit',description:'We assess layout, room suitability, common areas, existing furnishings, utility arrangements and potential works.',owner:'Provide site access, utility records and relevant property information.',outcome:'Property assessment and preliminary scope; no room-use approval is presumed.'},
 {title:'Proposal',description:'We outline proposed room rents, furnishing costs, service inclusions and financial scenarios.',owner:'Review the proposal, service terms and establishment budget; decide whether to proceed.',outcome:'Approved scope and budget subject to the necessary executed agreement and reviews.'},
 {title:'Implementation',description:'We coordinate approved furnishing, contractors, appliances, internet arrangements, inventories and readiness checks.',owner:'Approve any additional cost or variation outside the agreed budget.',outcome:'Prepared property with records of approved costs, items and outstanding matters.'},
 {title:'Advertising',description:'We coordinate the authorised marketing and leasing process once the proposed accommodation is approved for its intended use.',owner:'Confirm agreed initial rents and leasing instructions.',outcome:'Approved listing and resident enquiries under the authorised arrangement.'},
 {title:'Tenanted',description:'Resident move-in, condition report, room inventory, cleaning and ongoing service arrangements begin.',owner:'Receive service updates and make reserved expenditure decisions.',outcome:'Operational property; remaining room vacancies continue through the leasing process.'},
] as const;
export const CO_LIVING_INCLUSIONS=[
 {service:'Marketing and leasing coordination',proinspect:'Ordinary advertising, enquiries, applications and authorised leasing administration in the agreed scope.',owner:'Confirm leasing authority and reserved decisions.'},
 {service:'Rent administration',proinspect:'Proposed collection, reconciliation and disbursement coordination under an approved compliant arrangement.',owner:'Maintain agreed payment authority; no live direct-debit service is claimed.'},
 {service:'Resident management',proinspect:'Ordinary resident communication, shared-house issues, move-in and move-out coordination.',owner:'Retain decisions reserved by law or agreement.'},
 {service:'Condition records and inspections',proinspect:'Incoming PCR and inventory for each tenanted room; quarterly routine inspections and agreed exit records, with lawful access.',owner:'Provide lawful instructions and property access as required.'},
 {service:'Electricity, gas and water consumption',proinspect:'Fund eligible utility expenditure up to 25% of management fees collected excluding GST, calculated annually.',owner:'Reimburse the verified eligible utility costs above the annual allowance.'},
 {service:'Internet',proinspect:'Arrange and fund the agreed internet plan appropriate for the premises.',owner:'Any agreed infrastructure improvements or capital upgrades.'},
 {service:'Fortnightly common-area cleaning',proinspect:'Arrange and fund agreed fortnightly common-area cleaning and standard communal cleaning consumables.',owner:'Extra or specialist cleans outside the agreed scope, where authorised.'},
 {service:'Maintenance coordination',proinspect:'Record requests, obtain quotes and coordinate approved contractors and follow-up.',owner:'Approve quotes and pay property maintenance and repair costs.'},
 {service:'Furniture and appliances',proinspect:'Coordinate approved procurement, inventory, warranty records and claims.',owner:'Fund initial furnishings and owner-responsible replacements.'},
 {service:'Property ownership costs',proinspect:'Provide service invoices, receipts and transaction-level operational records.',owner:'Insurance, council rates, statutory charges, finance, tax accounting and other ownership expenditure.'},
] as const;
export const CO_LIVING_EXAMPLE_ROOMS=[
 {name:'Bedroom 1 — master ensuite',weeklyCents:40000},
 {name:'Bedroom 2',weeklyCents:30000},
 {name:'Bedroom 3',weeklyCents:35000},
 {name:'Bedroom 4',weeklyCents:35000},
 {name:'Bedroom 5 — proposed theatre conversion',weeklyCents:35000},
 {name:'Bedroom 6 — proposed study conversion',weeklyCents:30000},
] as const;
export const EXAMPLE_CO_LIVING_ROOM_WEEKLY_CENTS=CO_LIVING_EXAMPLE_ROOMS.reduce((total,room)=>total+room.weeklyCents,0);
export const EXAMPLE_CO_LIVING_PARKING_WEEKLY_CENTS=5000;
export const EXAMPLE_TRADITIONAL_WEEKLY_CENTS=89000;
export const EXAMPLE_FURNISHING_BUDGET_CENTS=2702500;
export const EXAMPLE_POTENTIAL_RESALE_CENTS=300000;

export function coLivingProjection(params:{
 roomWeeklyCents:number;
 parkingWeeklyCents:number;
 occupancyPercent:number;
 ownerCostsWeeklyCents?:number;
 actualAnnualUtilityCents?:number;
}){
 const {roomWeeklyCents,parkingWeeklyCents,occupancyPercent}=params;
 if(![roomWeeklyCents,parkingWeeklyCents,occupancyPercent,params.ownerCostsWeeklyCents??0,params.actualAnnualUtilityCents??0].every(Number.isFinite)
 ||roomWeeklyCents<0||parkingWeeklyCents<0||occupancyPercent<0||occupancyPercent>100
 ||(params.ownerCostsWeeklyCents??0)<0||(params.actualAnnualUtilityCents??0)<0)
 throw new RangeError('Co-Living calculator values must be non-negative and occupancy between 0 and 100.');
 const grossWeeklyCents=Math.round(roomWeeklyCents*occupancyPercent/100)+parkingWeeklyCents;
 const grossAnnualCents=grossWeeklyCents*52;
 const managementAnnualExGstCents=Math.round(grossAnnualCents*0.25);
 const managementGstAnnualCents=Math.round(managementAnnualExGstCents*0.1);
 const managementAnnualIncludingGstCents=managementAnnualExGstCents+managementGstAnnualCents;
 const annualUtilityAllowanceCents=Math.round(managementAnnualExGstCents*0.25);
 const utilityOverageCents=Math.max(0,Math.round(params.actualAnnualUtilityCents??0)-annualUtilityAllowanceCents);
 const ownerAnnualAfterFeesCents=grossAnnualCents-managementAnnualIncludingGstCents;
 const ownerAnnualAfterModelledCostsCents=ownerAnnualAfterFeesCents-52*Math.round(params.ownerCostsWeeklyCents??0)-utilityOverageCents;
 return {grossWeeklyCents,grossAnnualCents,managementAnnualExGstCents,managementGstAnnualCents,
   managementAnnualIncludingGstCents,annualUtilityAllowanceCents,utilityOverageCents,
   ownerAnnualAfterFeesCents,ownerAnnualAfterModelledCostsCents};
}
export const sampleCoLivingProjection=(occupancyPercent:number,ownerCostsWeeklyCents=0,actualAnnualUtilityCents=0)=>
 coLivingProjection({roomWeeklyCents:EXAMPLE_CO_LIVING_ROOM_WEEKLY_CENTS,
  parkingWeeklyCents:EXAMPLE_CO_LIVING_PARKING_WEEKLY_CENTS,occupancyPercent,
  ownerCostsWeeklyCents,actualAnnualUtilityCents});
export const money=(cents:number)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD',minimumFractionDigits:2,maximumFractionDigits:2}).format(cents/100);
