import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import { SERVICE_SEEDS } from '../../../../packages/service-catalogue/index';
import { MarketingPageHero } from '../components/page-patterns';
import { MarketingCta } from '../components/marketing-ui';
import { seo } from '../lib/seo';

type Sector='residential'|'commercial'|'strata-building'|'co-living'|'student-living'|'construction'|'ongoing';
type Choice={value:string;label:string;explanation:string;ids:string[]};
const choices:Record<Sector,Choice[]>={
  residential:[
    {value:'incoming',label:'A new tenancy is starting',explanation:'Start with a record of the incoming condition.',ids:['property-condition-report']},
    {value:'during',label:'I need a routine condition check',explanation:'Observe the current condition during the tenancy.',ids:['routine-inspection','follow-up-reinspection']},
    {value:'vacating',label:'The tenant is moving out',explanation:'Choose an advance check or document the outgoing condition.',ids:['pre-vacate-inspection','final-exit-inspection']},
    {value:'maintenance',label:'I need to check repairs or a concern',explanation:'Record the issue or visible outcome of agreed work.',ids:['maintenance-attendance','completed-works-inspection']},
    {value:'access',label:'Someone needs access to the property',explanation:'Arrange a specific authorised visit or access handover.',ids:['contractor-access-attendance','key-handover-collection']},
  ],
  commercial:[
    {value:'condition',label:'I need an inspection of commercial premises',explanation:'Document accessible areas and visible condition.',ids:['commercial-property-inspection']},
    {value:'handover',label:'A commercial tenancy is ending',explanation:'Understand the distinction between pre-vacate and final make-good observations.',ids:['commercial-pre-vacate-make-good-inspection','commercial-final-make-good-inspection']},
    {value:'works',label:'I need work or maintenance checked',explanation:'Observe a reported issue or apparent completion of nominated works.',ids:['maintenance-attendance','completed-works-inspection']},
    {value:'access',label:'A contractor or meeting needs attendance',explanation:'Arrange authorised site access or a specified meeting.',ids:['contractor-access-attendance','property-meeting']},
  ],
  'strata-building':[
    {value:'shared',label:'I want a common-property inspection',explanation:'Document shared-area condition or presentation.',ids:['common-property-inspection','cleaning-presentation-inspection']},
    {value:'defects',label:'We need to follow up a defect or incident',explanation:'Record visible condition or progress in identified areas.',ids:['defect-rectification-inspection','damage-incident-inspection','follow-up-reinspection']},
    {value:'contractor',label:'A contractor needs access or attendance',explanation:'Coordinate the approved visit and record agreed activity.',ids:['contractor-access-attendance','contractor-supervision-attendance']},
    {value:'moves',label:'We need help with a move or building handover',explanation:'Support specified access arrangements or operational transition.',ids:['move-in-move-out-attendance','building-handover-attendance']},
    {value:'urgent',label:'A building matter needs prompt attention',explanation:'Request review subject to safe access and capacity; not emergency response.',ids:['urgent-building-attendance','building-management-attendance']},
  ],
  'co-living': [
    {value:'rooms',label:'I need room or shared-area condition records',explanation:'Start with room inspections and lawful shared-space checks.',ids:['routine-inspection','common-property-inspection']},
    {value:'turnover',label:'A resident is arriving or departing',explanation:'Scope keys, inventories, condition and cleaning follow-up with the operator.',ids:['key-handover-collection','move-in-move-out-attendance']},
    {value:'operations',label:'I need ongoing Co-Living support',explanation:'Discuss an operator programme for rooms, residents, cleaning and maintenance.',ids:[]},
  ],
  'student-living': [
    {value:'turnover',label:'A student room needs a turnover',explanation:'Agree room evidence, keys, inventory and readiness activities.',ids:['property-condition-report','key-handover-collection']},
    {value:'care',label:'Shared student facilities need care',explanation:'Agree shared inspections, cleaning, maintenance and contractor follow-up.',ids:['common-property-inspection','maintenance-attendance']},
    {value:'programme',label:'I need a student accommodation programme',explanation:'Scope room-by-room operations and resident support with the operator.',ids:[]},
  ],
  construction: [
    {value:'progress',label:'I need progress or milestone observations',explanation:'Discuss site attendance and photographic reporting.',ids:['other-custom-appointment','property-meeting']},
    {value:'defects',label:'I need defect or handover follow-up',explanation:'Record outstanding items and visible rectification progress.',ids:['defect-rectification-inspection','completed-works-inspection']},
    {value:'programme',label:'I need recurring project support',explanation:'Define contractor coordination, reporting and handover.',ids:[]},
  ],
  ongoing: [
    {value:'residential',label:'Residential inspection or operational subscription',explanation:'Explore the Residential All Inclusive Subscription and tailored portfolio support.',ids:[]},
    {value:'commercial',label:'Commercial outsourced operations',explanation:'Explore Commercial All-Inclusive and delegated operations.',ids:[]},
    {value:'building',label:'Building management, grounds or cleaning',explanation:'Request a building programme including routine care and reporting.',ids:[]},
  ],
};
export const meta=()=>seo('Find the Right Property Inspection or Attendance',
  'Choose inspections or ongoing property operations for Residential and Co-Living settings in WA.',
  '/service-finder',{breadcrumbs:[{name:'Services',path:'/services'},{name:'Service finder',path:'/service-finder'}]});
export default function ServiceFinder(){
  const {appOrigin}=useOutletContext<{appOrigin:string}>();
  // Prevent a selection before hydration from being dropped without updating results.
  const [interactive,setInteractive]=useState(false);
  useEffect(()=>{setInteractive(true);},[]);
  const [sector,setSector]=useState<Sector>('residential');
  const [task,setTask]=useState('incoming');
  const options=choices[sector].filter(c => sector !== 'ongoing' || c.value === 'residential');
  const choice=options.find(x=>x.value===task)??options[0];
  const matches=useMemo(()=>SERVICE_SEEDS.filter(service=>service.sectors.includes('residential') && choice.ids.includes(service.id)),[choice]);
  function changeSector(next:Sector){setSector(next);setTask(choices[next][0].value);}
  return <>
    <MarketingPageHero eyebrow="Find a service" title="Tell us what the property needs."
      intro="You do not need to know the name of the inspection. Choose the property setting and what you want to achieve. We will show relevant services and what they cover."
      crumbs={[{label:'Services',to:'/services'},{label:'Service finder'}]} visual="services" />
    <section className="section mkt-section"><div className="site-container mkt-service-intro-grid">
      <div>
        <p className="eyebrow">Step 1 of 2</p><h2>What kind of property is it?</h2>
        <label className="mkt-finder-label" htmlFor="service-finder-sector">Property setting</label>
        <select className="mkt-finder-select" id="service-finder-sector" disabled={!interactive} value={sector}
          onChange={e=>changeSector(e.target.value as Sector)}>
          <option value="residential">Residential rental property</option>
          <option value="co-living">Co-Living property</option>
          <option value="ongoing">Ongoing property operations</option>
        </select>
        <p className="eyebrow">Step 2 of 2</p><h2>What needs to happen?</h2>
        <label className="mkt-finder-label" htmlFor="service-finder-task">Your intended outcome</label>
        <select className="mkt-finder-select" id="service-finder-task" disabled={!interactive} value={choice.value}
          onChange={e=>setTask(e.target.value)}>
          {options.map(opt=><option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        <p>{choice.explanation}</p>
      </div>
      <aside className="mkt-at-glance"><p className="eyebrow">Before choosing</p><h3>What happens next?</h3>
        <p>Review the service scope, exclusions and intended report. Then follow its one-off enquiry or booking route. Appointments, access and prices are confirmed separately where required.</p>
        <p>This guide suggests suitable services; it does not provide technical or statutory advice.</p>
      </aside>
    </div></section>
    <section className="section mkt-section mkt-stone" aria-live="polite"><div className="site-container">
      <div className="mkt-section-heading"><div><p className="eyebrow">Suggested services</p><h2>Start with one of these options.</h2></div>
      <p>Compare the purpose and limits before arranging a visit.</p></div>
      {matches.length === 0 && <div className="mkt-callout-panel">
        <h3>A tailored programme fits this request.</h3>
        <p>Review your property, operating workload, site or room count, reporting needs and approval responsibilities with us.</p>
        <Link className="button secondary" to={sector === 'ongoing' && task === 'residential' ? '/residential/subscriptions' : sector === 'ongoing' && task === 'commercial' ? '/commercial' : sector === 'ongoing' ? '/strata' : '/' + sector}>Explore the programme <span aria-hidden="true">→</span></Link>
        <Link className="mkt-text-link" to="/contact">Request a tailored scope <span aria-hidden="true">→</span></Link>
      </div>}
      <div className="mkt-catalogue-grid">
        {matches.map(s=><article className="mkt-related-card mkt-catalogue-card" key={s.id}><p className="mkt-kicker">Property service</p>
          <h3>{s.name}</h3><p>{s.summary}</p>
          <Link className="mkt-text-link" to={'/services/'+s.id}>View scope and next steps <span aria-hidden="true">→</span></Link>
        </article>)}
      </div>
      <p className="mkt-section-footnote">Different work or several properties? <Link to="/contact">Describe your requirements</Link> for a reviewed instruction.</p>
    </div></section>
    <section className="mkt-section pi-editorial-section"><div className="site-container pi-introduction">
        <div><p className="eyebrow">Want a different way to browse?</p><h2>Explore the Residential service areas.</h2></div>
        <div><p>See inspections, open homes, leasing, maintenance management, access, exit inspections, bond administration and specialist support in one place.</p>
          <Link className="button secondary" to="/residential/services">See All Residential Services <span aria-hidden="true">→</span></Link>
        </div>
      </div></section>
      <MarketingCta title="Prefer to discuss the task first?" description="Tell us the property type, the general location and the outcome you need. A public enquiry is not a confirmed booking." appOrigin={appOrigin}/>
  </>;
}
