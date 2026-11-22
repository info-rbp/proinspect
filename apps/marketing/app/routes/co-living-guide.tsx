import {useState} from 'react';
import {Link,useLoaderData,type LoaderFunctionArgs,type MetaFunction} from 'react-router';
import {EditorialHero} from '../components/editorial';
import {BrandImage} from '../components/brand-image';
import {seo} from '../lib/seo';
import {
 CO_LIVING_BANNERS,CO_LIVING_GUIDE_SLUGS,CO_LIVING_STAGE_STEPS,
 CO_LIVING_INCLUSIONS,CO_LIVING_EXAMPLE_ROOMS,EXAMPLE_CO_LIVING_ROOM_WEEKLY_CENTS,
 EXAMPLE_CO_LIVING_PARKING_WEEKLY_CENTS,EXAMPLE_TRADITIONAL_WEEKLY_CENTS,
 EXAMPLE_FURNISHING_BUDGET_CENTS,EXAMPLE_POTENTIAL_RESALE_CENTS,
 sampleCoLivingProjection,coLivingProjection,money,type CoLivingGuideSlug,
} from '../../../../packages/marketing/co-living-hub';

export function loader({params}:LoaderFunctionArgs){
 const slug=params.topic;
 if(!CO_LIVING_GUIDE_SLUGS.some(x=>x===slug))throw new Response('Not found',{status:404});
 return CO_LIVING_BANNERS.find(x=>x.slug===slug)!;
}
export const meta:MetaFunction<typeof loader>=({loaderData:p})=>p?seo(
 p.title+' — Co-Living',
 p.description,
 p.href,
 {type:'WebPage',breadcrumbs:[{name:'Co-Living',path:'/co-living'}, {name:p.title,path:p.href}]}
):[];

const pages=CO_LIVING_BANNERS.filter(b=>b.slug!=='overview');
function OwnerCta(){return <section className="mkt-final-cta"><div className="site-container mkt-cta-inner">
 <div><p className="eyebrow">Discuss your property</p><h2>Start with an assessment.</h2>
 <p>Tell us about the home and your objectives. We will outline next steps before any agreement, purchase or property work is authorised.</p></div>
 <div className="actions"><Link className="button mkt-button-light" to="/contact?topic=co-living">
 Request a Co-Living Assessment <span aria-hidden="true">→</span></Link>
 <Link className="button mkt-button-outline-light" to="/co-living">Co-Living Overview</Link></div>
</div></section>;}
function Note({children}:{children:React.ReactNode}){return <p className="pi-co-living-note">{children}</p>;}
function HowItWorks(){return <>
 <section className="mkt-section pi-editorial-section" id="guide-content"><div className="site-container">
  <div className="pi-section-heading"><p className="eyebrow">Your onboarding journey</p><h2>Six stages from enquiry to tenanted.</h2>
  <p>Property establishment is an owner-approved project. Each stage has a clear deliverable and a decision or evidence check before moving forward.</p></div>
  <ol className="pi-process-list pi-co-living-process pi-co-living-process-detail">
   {CO_LIVING_STAGE_STEPS.map((step,i)=><li key={step.title}><span className="pi-step-number">0{i+1}</span>
     <h3>{step.title}</h3><p>{step.description}</p><p><strong>Your part:</strong> {step.owner}</p>
     <p><strong>Outcome:</strong> {step.outcome}</p>
   </li>)}
  </ol>
  <Note>We assess lawful room use and any necessary planning, building and fire-safety requirements before a converted space can be advertised. Lease and rent-collection actions require the relevant authorised arrangement.</Note>
 </div></section>
 <section className="mkt-section pi-editorial-section pi-neutral"><div className="site-container pi-introduction">
  <div><p className="eyebrow">Owner approvals</p><h2>You understand the proposed investment before work starts.</h2></div>
  <div><p>The proposal outlines the proposed room schedule, management services, recurring cost responsibilities, furnishing investment and required works. The owner reviews the exact scope, budget and contract before implementation.</p>
   <p>Any additional furnishing purchases or works outside the approved budget require separately recorded approval. Site visit and readiness records are reviewed before advertising.</p>
   <Link className="button secondary" to="/co-living/property-setup">Explore Property Setup <span aria-hidden="true">→</span></Link>
  </div>
 </div></section>
 </>;}
function PropertySetup(){return <>
 <section className="mkt-section pi-editorial-section" id="guide-content"><div className="site-container">
  <div className="pi-section-heading"><p className="eyebrow">Property establishment</p><h2>Furnish for residents, prepare for ongoing operation.</h2>
   <p>ProInspect prepares an agreed furnishing and setup plan tailored to the property's room layout, existing contents and approved shared facilities.</p></div>
  <div className="pi-residential-feature">
    <div className="pi-residential-feature-image"><BrandImage name="leasing"/></div>
    <div className="pi-residential-feature-content">
     <h3>Private bedrooms</h3>
     <p>Appropriate bed and mattress, storage, a desk or workspace where suitable, bedside lighting, curtains or blinds and relevant room amenities. Private ensuites are specified separately where provided.</p>
     <h3>Shared living areas</h3>
     <p>Kitchenware, dining seating, lounge furnishings, appliances, laundry facilities, communal bathroom supplies, practical storage and agreed outdoor furniture. Adequacy depends on the final approved resident capacity.</p>
     <p>We identify existing furniture suitable for reuse, relocation or potential owner-approved resale before proposing new purchases.</p>
    </div>
  </div>
  <div className="mkt-editorial-grid pi-co-living-after-feature">
    <article className="mkt-editorial-panel"><h3>Assessment and approved works</h3><p>Confirm the bedroom layout, maintenance needs, necessary approvals and any electrical, safety or other specialist works before procurement.</p></article>
    <article className="mkt-editorial-panel"><h3>Purchasing and installation</h3><p>Prepare itemised quotes, coordinate approved orders, deliveries and assembly. Purchases and required alterations remain owner-funded.</p></article>
    <article className="mkt-editorial-panel"><h3>Inventory and warranties</h3><p>Record furnishings and appliances by room, with available receipts and warranties to support future claims and replacements.</p></article>
    <article className="mkt-editorial-panel"><h3>Property readiness</h3><p>Arrange final cleaning, confirm internet and common-area cleaning arrangements and review outstanding occupancy or safety issues before marketing.</p></article>
  </div>
 </div></section>
 <section className="mkt-section pi-editorial-section pi-neutral"><div className="site-container pi-introduction">
  <div><p className="eyebrow">Illustrative establishment budget</p><h2>{money(EXAMPLE_FURNISHING_BUDGET_CENTS)} in preliminary furnishing costs.</h2></div>
  <div><p>Our earlier six-room example estimated {money(EXAMPLE_FURNISHING_BUDGET_CENTS)} for furnishings, delivery, assembly and contingency. Potential proceeds from selling selected existing furniture could reduce the owner's net outlay, but no resale proceeds are assured.</p>
   <p>Property alterations, statutory approvals and additional works are excluded from that sample budget and require a property-specific quotation and approval.</p>
   <Link className="button secondary" to="/co-living/example-property">Review the Example Property <span aria-hidden="true">→</span></Link>
  </div>
 </div></section></>;}
function Inclusions(){return <>
 <section className="mkt-section pi-editorial-section" id="guide-content"><div className="site-container">
  <div className="pi-section-heading"><p className="eyebrow">Service responsibilities</p><h2>What ProInspect coordinates and what the owner funds.</h2>
   <p>The proposed Co-Living fee covers a defined ongoing programme. Property ownership and capital costs remain separate and are made clear before engagement.</p></div>
  <div className="pi-co-living-table-wrap">
   <table className="pi-co-living-table"><thead><tr><th scope="col">Service</th><th scope="col">ProInspect's proposed role</th><th scope="col">Owner's responsibility</th></tr></thead>
    <tbody>{CO_LIVING_INCLUSIONS.map(item=><tr key={item.service}><th scope="row">{item.service}</th><td>{item.proinspect}</td><td>{item.owner}</td></tr>)}</tbody>
   </table>
  </div>
  <Note>Regulated leasing, rent, bond and agency functions are only provided through an appropriately authorised arrangement. The website does not activate a collection or management appointment. The final property-specific agreement controls the services and exclusions.</Note>
 </div></section>
 <section className="mkt-section pi-editorial-section pi-neutral"><div className="site-container">
  <div className="pi-section-heading"><p className="eyebrow">Utility allowance</p><h2>Annual funding linked to the management fees collected.</h2></div>
  <div className="pi-introduction">
   <div><p><strong>Allowance = 25% × management fees actually collected, excluding GST.</strong></p>
    <p>The utility allowance applies to eligible electricity, gas and water consumption over the agreed 12-month period. If supplier costs exceed the annual allowance, the owner reimburses the supported excess.</p></div>
   <div><p>Internet and standard fortnightly common-area cleaning are funded by ProInspect separately and are not deducted from the utility allowance.</p>
    <p>Optional resident bedroom cleaning is arranged and charged separately to the resident by agreement. Owner-approved maintenance and replacements remain owner-funded.</p>
    <Link className="button secondary" to="/co-living/pricing">View the Worked Fee Example <span aria-hidden="true">→</span></Link></div>
  </div>
  <div className="pi-co-living-after-feature">
   <h3>Separately chargeable administration</h3>
   <p>Proposed bond administration: <strong>$100 + GST per bond</strong>. Permitted tenancy database checks: <strong>$50 + GST per check</strong>. These are proposed owner charges, not automatic resident fees. Conditions and applicable authority must be agreed before services are billed.</p>
  </div>
 </div></section></>;}
function Pricing(){
 const [rooms,setRooms]=useState(2050);
 const [parking,setParking]=useState(50);
 const [occupancy,setOccupancy]=useState(95);
 const [ownerCosts,setOwnerCosts]=useState(100);
 const [utilities,setUtilities]=useState(6834.08);
 const calc=coLivingProjection({
  roomWeeklyCents:Math.round(rooms*100),parkingWeeklyCents:Math.round(parking*100),
  occupancyPercent:occupancy,ownerCostsWeeklyCents:Math.round(ownerCosts*100),
  actualAnnualUtilityCents:Math.round(utilities*100),
 });
 const traditionalAnnual=EXAMPLE_TRADITIONAL_WEEKLY_CENTS*52;
 const num=(value:number,set:(value:number)=>void,max:number)=>(e:React.ChangeEvent<HTMLInputElement>)=>{
  const value=Number(e.target.value);set(Number.isFinite(value)?Math.min(max,Math.max(0,value)):0);
 };
 return <>
 <section className="mkt-section pi-editorial-section" id="guide-content"><div className="site-container pi-introduction">
   <div><p className="eyebrow">Proposed ongoing management fee</p><h2>25% + GST of gross rent collected.</h2>
     <p>The fee is calculated on actually collected eligible room and car-bay rental income, not the maximum potential rent of vacant bedrooms.</p></div>
   <div><p>ProInspect's annual electricity, gas and water allowance equals <strong>25% of the management fees it collects excluding GST</strong>. It is not 25% of the owner's rental income. Eligible utility expenses above the annual allowance are reimbursable by the owner.</p>
   <p>Furnishing, approved maintenance, rates, insurance, statutory costs, tax and other property expenses are not funded by the management fee unless specifically agreed.</p></div>
  </div></section>
 <section className="mkt-section pi-editorial-section pi-neutral"><div className="site-container">
  <div className="pi-section-heading"><p className="eyebrow">Explore the numbers</p><h2>Illustrative Co-Living owner income calculator.</h2>
   <p>Adjust the assumptions. The figures are planning illustrations and cannot replace a site assessment, rental appraisal, approved budget or financial advice.</p></div>
  <div className="pi-co-living-calculator">
   <div className="pi-co-living-inputs">
    <label>Combined room rent at full occupancy ($/week)<input inputMode="decimal" type="number" min="0" max="50000" step="10" value={rooms} onChange={num(rooms,setRooms,50000)}/></label>
    <label>Parking rent ($/week)<input inputMode="decimal" type="number" min="0" max="1000" step="5" value={parking} onChange={num(parking,setParking,1000)}/></label>
    <label>Room occupancy assumption (%)<input type="range" min="0" max="100" step="5" value={occupancy} onChange={e=>setOccupancy(Number(e.target.value))}/>
      <strong>{occupancy}%</strong></label>
    <label>Estimated additional owner operating costs ($/week)<input inputMode="decimal" type="number" min="0" max="10000" step="10" value={ownerCosts} onChange={num(ownerCosts,setOwnerCosts,10000)}/></label>
    <label>Eligible annual utility expenses ($)<input inputMode="decimal" type="number" min="0" max="100000" step="50" value={utilities} onChange={num(utilities,setUtilities,100000)}/></label>
   </div>
   <div className="pi-co-living-results" aria-live="polite">
    <div><span>Gross rent collected (annualised)</span><strong>{money(calc.grossAnnualCents)}</strong></div>
    <div><span>Management fee (ex GST)</span><strong>{money(calc.managementAnnualExGstCents)}</strong></div>
    <div><span>GST on management fee</span><strong>{money(calc.managementGstAnnualCents)}</strong></div>
    <div><span>Owner after management charges</span><strong>{money(calc.ownerAnnualAfterFeesCents)}</strong></div>
    <div><span>ProInspect annual utility allowance</span><strong>{money(calc.annualUtilityAllowanceCents)}</strong></div>
    <div><span>Owner reimburses eligible utility excess</span><strong>{money(calc.utilityOverageCents)}</strong></div>
    <div className="pi-co-living-result-main"><span>Owner after selected modelled expenses</span><strong>{money(calc.ownerAnnualAfterModelledCostsCents)}</strong></div>
   </div>
  </div>
  <Note>The selected operating-cost input covers only the additional owner expenses you enter, such as maintenance reserves; it does not automatically include rates, insurance, finance, tax, approvals or the establishment investment. The utility overage is calculated separately. Monthly payouts and actual cashflow timing are not modelled.</Note>
  <p>For context, the earlier illustrative traditional whole-property rent was {money(EXAMPLE_TRADITIONAL_WEEKLY_CENTS)} per week ({money(traditionalAnnual)} annually) <strong>before</strong> conventional management and ownership expenses. Compare net income on a like-for-like basis before making an investment decision.</p>
 </div></section>
 <section className="mkt-section pi-editorial-section"><div className="site-container pi-introduction">
  <div><p className="eyebrow">A transparent arrangement</p><h2>Know the exclusions before you approve.</h2></div>
  <div><p>Initial furnishings and any conversion works are paid by the owner through an approved establishment budget. There is no universal fixed setup cost shown here.</p>
   <p>Proposed separate owner charges are $100 + GST for bond administration per bond and $50 + GST for an authorised tenancy database check per check. Private bedroom cleaning is optional and separately priced for residents.</p>
   <p>Rent collection, landlord disbursements and regulated leasing functions require approved authority and compliant arrangements before they can operate. No payment is collected through this public calculator.</p>
   <Link className="button secondary" to="/co-living/example-property">See the Six-Bedroom Illustration <span aria-hidden="true">→</span></Link>
  </div>
 </div></section>
 </>;
}
function ExampleProperty(){
 const full=sampleCoLivingProjection(100);
 const ninetyFive=sampleCoLivingProjection(95,10000,683408);
 const budget=EXAMPLE_FURNISHING_BUDGET_CENTS-EXAMPLE_POTENTIAL_RESALE_CENTS;
 return <>
 <section className="mkt-section pi-editorial-section" id="guide-content"><div className="site-container">
  <div className="pi-section-heading"><p className="eyebrow">Illustrative property case study</p><h2>Six furnished bedrooms with shared living facilities.</h2>
   <p>This is a hypothetical financial presentation using a previously discussed property layout. It is not an approved conversion, live listing or documented operating result.</p></div>
  <div className="pi-residential-feature">
   <div className="pi-residential-feature-image"><BrandImage name="co-living"/></div>
   <div className="pi-residential-feature-content">
    <h3>The proposed layout</h3>
    <p>Four existing bedrooms, subject to review, with a proposed theatre-to-bedroom conversion and proposed study-to-bedroom conversion, shared kitchen, dining, lounge, bathrooms, laundry and two optional car bays.</p>
    <p>Any additional room requires a property-specific review of planning, building classification, ventilation, fire safety, amenity and tenancy arrangements. The proposed room count and rent may change substantially after assessment.</p>
   </div>
  </div>
  <div className="pi-co-living-after-feature pi-co-living-table-wrap">
   <table className="pi-co-living-table"><thead><tr><th scope="col">Accommodation</th><th scope="col">Illustrative weekly rent</th></tr></thead><tbody>
    {CO_LIVING_EXAMPLE_ROOMS.map(r=><tr key={r.name}><th scope="row">{r.name}</th><td>{money(r.weeklyCents)}</td></tr>)}
    <tr><th scope="row">Two car bays</th><td>{money(EXAMPLE_CO_LIVING_PARKING_WEEKLY_CENTS)}</td></tr>
    <tr><th scope="row">Total potential weekly rental income</th><td><strong>{money(full.grossWeeklyCents)}</strong></td></tr>
   </tbody></table>
  </div>
 </div></section>
 <section className="mkt-section pi-editorial-section pi-neutral"><div className="site-container">
  <div className="pi-section-heading"><p className="eyebrow">Illustrative setup and returns</p><h2>Present the investment and operating assumptions together.</h2></div>
  <div className="pi-co-living-metrics">
    <div><span>Potential annual gross rental income</span><strong>{money(full.grossAnnualCents)}</strong></div>
    <div><span>Annual management charge including GST</span><strong>{money(full.managementAnnualIncludingGstCents)}</strong></div>
    <div><span>Potential annual owner income after management</span><strong>{money(full.ownerAnnualAfterFeesCents)}</strong></div>
    <div><span>Potential annual utility allowance</span><strong>{money(full.annualUtilityAllowanceCents)}</strong></div>
  </div>
  <div className="pi-introduction pi-co-living-after-feature">
   <div><h3>Initial property establishment</h3>
    <p>Illustrative furnishings, setup and contingency: <strong>{money(EXAMPLE_FURNISHING_BUDGET_CENTS)}</strong>.</p>
    <p>Hypothetical resale recovery: {money(EXAMPLE_POTENTIAL_RESALE_CENTS)}. Net illustrative furnishing outlay: <strong>{money(budget)}</strong>, excluding approval fees and conversion works.</p></div>
   <div><h3>95% effective room occupancy scenario</h3>
     <p>Assuming both car bays rented, {money(10000)} weekly additional owner operating costs and {money(683408)} of annual eligible utilities, the example owner income after the management fee, owner reserve and utility overage is <strong>{money(ninetyFive.ownerAnnualAfterModelledCostsCents)} annually</strong>.</p>
    <p>Excludes rates, insurance, financing, tax, statutory work, the initial furnishing investment and other unmodelled costs. This must not be presented as net investment profit or compared directly with a traditional rental's net return.</p>
   </div>
  </div>
  <Link className="button secondary" to="/co-living/pricing">Adjust the Financial Assumptions <span aria-hidden="true">→</span></Link>
 </div></section>
 </>;
}
export default function CoLivingGuide(){
 const guide=useLoaderData<typeof loader>();
 const slug=guide.slug as CoLivingGuideSlug;
 return <>
 <EditorialHero eyebrow="Co-Living Property Services" title={guide.title}
   intro={guide.description} image={guide.image}
   primary={{label:'Explore '+guide.title,to:'#guide-content'}}
   secondary={{label:'All Co-Living Topics',to:'/co-living#service-options'}}/>
 <nav className="mkt-section pi-editorial-section pi-co-living-topic-nav" aria-label="Co-Living sections">
  <div className="site-container pi-co-living-topic-links"><Link to="/co-living">Co-Living Overview</Link>
  {pages.map(x=><Link key={x.slug} to={x.href} aria-current={x.slug===slug?'page':undefined}>{x.title}</Link>)}</div>
 </nav>
 {slug==='how-it-works'&&<HowItWorks/>}
 {slug==='property-setup'&&<PropertySetup/>}
 {slug==='inclusions'&&<Inclusions/>}
 {slug==='pricing'&&<Pricing/>}
 {slug==='example-property'&&<ExampleProperty/>}
 <section className="mkt-section pi-editorial-section"><div className="site-container">
   <div className="pi-section-heading"><p className="eyebrow">Continue exploring</p><h2>Other parts of the Co-Living offering.</h2></div>
   <div className="pi-co-living-related">
     {CO_LIVING_BANNERS.filter(x=>x.slug!==slug).map(x=><Link key={x.slug} to={x.href}>{x.title}<span aria-hidden="true">↗</span></Link>)}
   </div>
 </div></section>
 <OwnerCta/>
 </>;
}
