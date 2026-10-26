import { useState } from 'react';
import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { runtimeContext } from '../../../../packages/database/context';
import type { Env } from '../../../../packages/database/types';
import { pcrCustomerPrice } from '../../../../packages/marketing/pcr-campaign';
import { seo } from '../lib/seo';

export async function loader({ context }: LoaderFunctionArgs) {
  const env = context.get(runtimeContext).env as Env;
  let sampleAvailable = false;
  try { sampleAvailable = Boolean(await env.DOCUMENTS?.head('marketing/approved-samples/property-condition-report.pdf')); } catch { /* No published sample in this environment. */ }
  const bookEnabled = env.PCR_LAUNCH_ENABLED === 'true' &&
    env.GUEST_BOOKINGS_ENABLED === 'true' &&
    env.STRIPE_GUEST_CHECKOUT_ENABLED === 'true' &&
    env.STRIPE_TAX_READY === 'true' &&
    (env.APP_ENV === 'staging' || env.APP_ENV === 'local');
  return { sampleAvailable, bookEnabled };
}
export const meta = ({ loaderData }: { loaderData?: Awaited<ReturnType<typeof loader>> }) => [
  ...seo('$100 Property Condition Reports', 'Book a ProInspect Property Condition Report from $100. Weekday and weekend appointments, a structured report within 48 hours and 20% off your next four routine inspections.', '/offers/pcr-100'),
  ...(!loaderData?.bookEnabled ? [{ name: 'robots', content: 'noindex,nofollow' }] : []),
];
const money = (cents: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(cents / 100);
const steps = [
  ['01','Book your visit','Provide the property address, your contact details and lawful access arrangements.'],
  ['02','Choose a time','Select an available inspection between 9 am and 5 pm, any day of the week.'],
  ['03','Pay securely','Review the exact total and pay through Stripe-hosted Checkout after verifying your email.'],
  ['04','Get your PCR','We document the property in our own template and supply your report within 48 hours of the inspection.'],
] as const;
export default function PcrOffer() {
  const { sampleAvailable, bookEnabled } = useLoaderData<typeof loader>();
  const [day,setDay] = useState<'weekday'|'saturday'|'sunday'>('weekday');
  const [keys,setKeys] = useState(false);
  const total = pcrCustomerPrice(day,keys);
  const bookingUrl = '/guest/book/property-condition-report?launch=pcr100' + (keys ? '&keys=1' : '');
  return <div className="pcr-landing">
    <section className="pcr-hero">
      <div className="site-container pcr-hero-grid">
        <div className="pcr-hero-copy">
          <p className="pcr-eyebrow">PROINSPECT · PROPERTY SERVICES · LAUNCH OFFER</p>
          <h1>A comprehensive property condition report. <em>One straightforward price.</em></h1>
          <p className="pcr-lead">Detailed, room-by-room condition reporting for residential rentals. Book a convenient inspection, receive a professionally formatted report, and keep the next four routine inspections more affordable.</p>
          <div className="pcr-hero-actions">
            {bookEnabled ? <Link to={bookingUrl} className="button pcr-primary">Book your $100 PCR <span aria-hidden="true">→</span></Link> : <Link to="/contact?service=property-condition-report" className="button pcr-primary">Enquire about a PCR <span aria-hidden="true">→</span></Link>}
            {sampleAvailable ? <a className="button secondary pcr-secondary" href="/offers/pcr/sample" download>Download a sample PCR</a> : <span className="pcr-sample-pending" role="status">Sample PCR download coming soon</span>}
          </div>
          <div className="pcr-hero-foot"><span><b>9 am–5 pm</b> seven days</span><span><b>48-hour</b> report delivery</span><span><b>20% off</b> four routines</span></div>
          {!bookEnabled && <p className="pcr-preview-note">The launch offer is being prepared. Online payment is not yet activated; enquiries are welcome.</p>}
        </div>
        <aside className="pcr-hero-price" aria-label="PCR launch pricing">
          <div className="pcr-hero-price-top"><span>PROPERTY CONDITION REPORT</span><span>LAUNCH RATE</span></div>
          <div className="pcr-from"><span>from</span><strong>$100</strong><span>AUD</span></div>
          <div className="pcr-rule" />
          <dl className="pcr-price-rows">
            <div><dt>Monday – Friday</dt><dd>$100</dd></div>
            <div><dt>Saturday <small>+25%</small></dt><dd>$125</dd></div>
            <div><dt>Sunday <small>+50%</small></dt><dd>$150</dd></div>
          </dl>
          <p>All appointment windows: 9:00 am – 5:00 pm Perth time.</p>
          <div className="pcr-offer-stamp"><span>YOUR NEXT 4</span><strong>20% OFF</strong><span>ROUTINE INSPECTIONS</span></div>
        </aside>
      </div>
    </section>
    <section className="pcr-included" aria-labelledby="pcr-included-heading">
      <div className="site-container">
        <div className="pcr-section-intro"><p className="pcr-eyebrow">CLEAR SCOPE. USEFUL EVIDENCE.</p><h2 id="pcr-included-heading">Everything you need to understand the property's condition.</h2><p>Our inspections produce a structured record that you can review, retain and share with the authorised parties.</p></div>
        <div className="pcr-included-grid">
          <article><span className="pcr-card-num">01</span><h3>Room-by-room assessment</h3><p>Visible condition of accessible rooms, fixtures, fittings and nominated features documented systematically.</p></article>
          <article><span className="pcr-card-num">02</span><h3>Supporting photographs</h3><p>Relevant photographic evidence to support the report's recorded observations.</p></article>
          <article><span className="pcr-card-num">03</span><h3>Our professional template</h3><p>Prepared in ProInspect's reporting format, not in the customer's or agency's software.</p></article>
          <article><span className="pcr-card-num">04</span><h3>Delivered within 48 hours</h3><p>Your completed PCR is delivered securely within 48 hours after the inspection has taken place.</p></article>
        </div>
        <p className="pcr-scope-note">A visual condition record, not a structural, pest, electrical or other specialist certification. Any statutory form requirements and issue responsibilities remain subject to the applicable WA rules and approved service terms.</p>
      </div>
    </section>
    <section className="pcr-calculator" aria-labelledby="pcr-price-heading">
      <div className="site-container pcr-calc-layout">
        <div><p className="pcr-eyebrow">TRANSPARENT PRICING</p><h2 id="pcr-price-heading">Choose a day that suits your schedule.</h2><p>Weekdays are $100. Saturday carries a 25% loading and Sunday a 50% loading. Optional off-site key collection is $10.</p><p>Additional travel, access or specialist requirements may be quoted separately. We will seek approval before any extra charge is made.</p></div>
        <div className="pcr-calc-card">
          <h3>Estimate your PCR total</h3>
          <fieldset><legend>Preferred day</legend><div className="pcr-day-options">
            {([['weekday','Mon–Fri','$100'],['saturday','Saturday','$125'],['sunday','Sunday','$150']] as const).map(([value,label,price])=><label key={value} className={day===value?'selected':''}><input type="radio" name="pcr-day" value={value} checked={day===value} onChange={()=>setDay(value)}/><span>{label}</span><strong>{price}</strong></label>)}
          </div></fieldset>
          <label className="pcr-addon"><input type="checkbox" checked={keys} onChange={e=>setKeys(e.target.checked)}/><span><strong>Collect keys off-site</strong><small>Add $10 for one collection location</small></span><b>+$10</b></label>
          <div className="pcr-total"><div><span>Estimated total</span><small>AUD · excludes any separately approved extras</small></div><strong>{money(total)}</strong></div>
          {bookEnabled?<Link className="button pcr-primary" to={bookingUrl}>Continue to booking <span aria-hidden="true">→</span></Link>:<Link className="button pcr-primary" to="/contact?service=property-condition-report">Enquire about this offer <span aria-hidden="true">→</span></Link>}
          <p className="pcr-calc-caption">The booked appointment date determines the final weekday/weekend rate; the confirmed total is shown before Stripe payment. GST treatment is subject to approved business settings.</p>
        </div>
      </div>
    </section>
    <section className="pcr-process" aria-labelledby="pcr-steps-heading"><div className="site-container">
      <div className="pcr-section-intro"><p className="pcr-eyebrow">A SIMPLE BOOKING PROCESS</p><h2 id="pcr-steps-heading">Four steps from booking to report.</h2></div>
      <div className="pcr-steps">{steps.map(([num,title,description])=><article key={num}><b>{num}</b><h3>{title}</h3><p>{description}</p></article>)}</div>
    </div></section>
    <section className="pcr-benefit"><div className="site-container pcr-benefit-grid"><div><p className="pcr-eyebrow">MORE VALUE AFTER YOUR PCR</p><h2>20% off your next four routine inspections.</h2><p>Book the launch PCR and receive four separate 20% discounts for future eligible paid routine inspections. Each discount belongs to the verified purchasing customer and is applied once per routine inspection.</p></div><strong className="pcr-benefit-figure">4 <span>× 20% off</span></strong></div></section>
    <section className="pcr-faq" aria-labelledby="pcr-faq-heading"><div className="site-container pcr-faq-layout">
      <div><p className="pcr-eyebrow">COMMON QUESTIONS</p><h2 id="pcr-faq-heading">Before you book</h2></div>
      <div className="pcr-faq-items">
        <details><summary>Is the $100 PCR available on weekends?</summary><p>Yes. Weekday inspections are $100; Saturday is $125 and Sunday is $150. All are scheduled between 9 am and 5 pm Perth time, subject to availability.</p></details>
        <details><summary>Do you use my property management software?</summary><p>No. We create reports in the ProInspect report template and deliver the completed document securely.</p></details>
        <details><summary>When will I receive the report?</summary><p>Within 48 hours after the completed inspection, subject to the approved scope and lawful access to the property.</p></details>
        <details><summary>What does the key collection fee cover?</summary><p>Collection of keys from one off-site location costs $10. We will confirm the collection address and access instructions. Other additional services are quoted before being charged.</p></details>
        <details><summary>How do I use the routine inspection discount?</summary><p>Following the paid PCR, four 20% discounts are recorded against your verified booking contact for eligible future paid routine inspections. Existing subscription-included services are not additionally discounted.</p></details>
        <details><summary>Can I see a sample PCR?</summary><p>{sampleAvailable?'Yes. Use the Download a sample PCR button at the top of this page.':'An approved sample will be published here once it has been supplied and privacy-reviewed.'}</p></details>
      </div>
    </div></section>
    <section className="pcr-last-cta"><div className="site-container"><p className="pcr-eyebrow">READY WHEN YOU ARE</p><h2>Get the condition documented. Get back to what matters.</h2>{bookEnabled?<Link className="button pcr-primary" to={bookingUrl}>Book a PCR online <span aria-hidden="true">→</span></Link>:<Link className="button pcr-primary" to="/contact?service=property-condition-report">Contact us about a PCR <span aria-hidden="true">→</span></Link>}<p>Residential property condition reporting · Perth time · Subject to available appointments and approved service terms.</p></div></section>
  </div>;
}
