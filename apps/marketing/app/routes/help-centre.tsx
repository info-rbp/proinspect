import {Link} from 'react-router';
import {EditorialHero} from '../components/editorial';
import {MarketingFaq} from '../components/page-patterns';
import {seo} from '../lib/seo';
const sections=[
 {id:'booking',title:'Booking and individual services',questions:[
  ['Do I have to subscribe to book a service?','No. Choose an individual service, or consider a Residential subscription separately. Certain appointments can be selected online when eligible; other work needs a confirmed scope or quotation.'],
  ['How do I book a service?','Create a free account or use the applicable individual service route. Select a property and an eligible service, then follow the available appointment or enquiry process. A service request is not a confirmed booking until accepted.'],
  ['Can ProInspect handle tenant enquiries?','We can respond to agreed ordinary matters and coordinate instructed attendance. The responsible landlord or property manager continues to make tenancy, access and expenditure decisions and must approve matters beyond the agreed authority.'],
  ['Can I book an inspection immediately?','Eligible services may provide available appointment times. Timing, lawful entry, price and scope must still be confirmed. Other services can be requested for review.']]},
 {id:'coverage',title:'Coverage and availability',questions:[
  ['Where do you work?','Our regular scheduled services cover approved suburbs across Perth and Peel. Other Western Australian locations may be considered by request, subject to travel, staff availability and site access.'],
  ['Are travel, urgency and trade costs included?','The agreed quotation or service schedule identifies any travel, urgency, specialist, third-party or extra attendance costs before work begins.']]},
 {id:'accounts',title:'Accounts and subscriptions',questions:[
  ['Is account registration free?','Yes. A free account does not activate a new paid subscription or authorise recurring payment.'],
  ['What is the Residential All Inclusive price?','AUD $50 plus GST per property per week (AUD $55 including GST). The proposed initial contract term is 24 months with 60 days’ written cancellation notice. Inclusions, limits and extras are defined in the accepted schedule.'],
  ['Can I get one report without an ongoing contract?','Yes. Individual inspections and other service requests are separate from a new paid Residential subscription.']]},
 {id:'reports',title:'Reports, renting and property records',questions:[
  ['How do inspection reports work?','Agreed observations and photographs are recorded during the inspection. Completed reports are reviewed before issue and made accessible to expressly authorised recipients through the appropriate property record.'],
  ['Can I view an example report?','Our example report page shows a labelled, synthetic illustration. It is not an issued customer report or an official prescribed Property Condition Report form.'],
  ['Does an open-home registration count as a rental application?','No. Open-home attendance and rental applications are separate. Each listing sets out the application option approved by the responsible landlord or leasing agent.'],
  ['Who decides tenancy and bond matters?','The authorised landlord or agency and applicable statutory process make these decisions. ProInspect supports agreed administration and factual recordkeeping but does not take the decision-maker’s place.']]}
];
export const meta=()=>seo('Help Centre — Property Inspections, Bookings and Residential Support | ProInspect','Answers to common questions about inspections, bookings, subscription terms, coverage and rental property records.','/help-centre');
export default function HelpCentre(){return <>
  <EditorialHero eyebrow="Help Centre" title="Practical answers for your property."
   intro="Understand how ProInspect services, bookings, property records and Residential subscriptions work." image="residential"
   primary={{label:'Explore Help Topics',to:'#topics'}} secondary={{label:'Residential Services',to:'/residential/services'}}/>
  <section id="topics" className="mkt-section pi-editorial-section"><div className="site-container">
   <div className="pi-section-heading"><p className="eyebrow">Find an answer</p><h2>Help when you need it.</h2></div>
   <nav className="pi-residential-related" aria-label="Help topics">{sections.map(s=><a key={s.id} href={'#'+s.id}>{s.title}<span aria-hidden="true">↓</span></a>)}</nav>
   {sections.map(s=><section className="pi-help-section" id={s.id} key={s.id}><div className="pi-section-heading"><h2>{s.title}</h2></div><MarketingFaq questions={s.questions as [string,string][]}/></section>)}
  </div></section>
  <section className="mkt-final-cta"><div className="site-container mkt-cta-inner"><div><p className="eyebrow">Need something else?</p><h2>Ask about your property.</h2>
    <p>Tell us what you need. Do not include keys, access codes or sensitive tenant documents in a public enquiry.</p></div>
    <div className="actions"><Link to="/contact" className="button mkt-button-light">Contact ProInspect <span aria-hidden="true">→</span></Link></div>
  </div></section>
</>}