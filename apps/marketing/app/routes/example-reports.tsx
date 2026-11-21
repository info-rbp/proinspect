import {Link} from 'react-router';
import {EditorialHero} from '../components/editorial';
import {IllustrativeReport} from '../components/marketing-ui';
import {seo} from '../lib/seo';
export const meta=()=>seo('Example Inspection Reports — ProInspect','See an explicitly illustrative inspection record and understand how issued reports connect to authorised property records.','/example-reports');
export default function ExampleReports(){return <>
 <EditorialHero eyebrow="Example Reports" title="A clearer view of your property."
  intro="Inspection records bring observations, photographs and follow-up items together so you can see what needs attention."
  image="residential" primary={{label:'View Example Layout',to:'#example'}}
  secondary={{label:'Explore Property Inspections',to:'/residential/services/property-inspections'}}/>
 <section id="example" className="mkt-section pi-editorial-section"><div className="site-container pi-residential-report-example">
  <div><p className="eyebrow">Illustrative example</p><h2>Know what the inspection recorded.</h2>
   <p>The demonstration is synthetic and does not represent an issued customer report, an approved statutory form or a completed Property Condition Report. Actual deliverables depend on the commissioned service, approved template and report review.</p>
   <p>ProInspect links authorised reports to the appropriate property and work history, so recipients can find the evidence that has been issued to them.</p>
   <Link to="/residential/services/property-inspections" className="pi-inline-link">Explore inspection services <span aria-hidden="true">↗</span></Link></div>
  <div><IllustrativeReport/><p className="pi-residential-note">ILLUSTRATIVE EXAMPLE — not an issued inspection report.</p></div>
 </div></section></>}