import {runtimeContext} from '../../../../packages/database/context';
import type {Env} from '../../../../packages/database/types';
import {currentLegalDocument} from '../../../platform/worker/features/legal-acceptance.server';
import {managedPrivacyDocument} from '../../../platform/worker/features/managed-rental-intake.server';
import { ENGAGEMENTS } from '../../../../packages/marketing/content';
import { CoverageLookup } from '../components/coverage-lookup';
import { PUBLIC_LEGAL_DRAFTS, PUBLIC_LEGAL_APPROVAL, type PublicLegalKey } from '../../../../packages/marketing/legal-drafts';
import {
  Link,
  useLoaderData,
  useOutletContext,
  type LoaderFunctionArgs,
  type MetaFunction,
} from 'react-router';
import { seo } from '../lib/seo';
import { MarketingCta } from '../components/marketing-ui';
import { MarketingPageHero, MarketingSectionTitle, MarketingEditorialBlocks } from '../components/page-patterns';

const pages: Record<string, { title: string; intro: string; sections: Array<[string, string]> }> = {
  'how-it-works': {
    title: 'From first instruction to a dependable property routine.',
    intro: 'Start with one task or build an ongoing property routine. We help you choose the right service and agree the details before work begins.',
    sections: [
      ['1. Identify the right service', 'Tell us about the property, location and outcome. Choose a specific inspection or discuss the workload you would like us to take on.'],
      ['2. Confirm who can authorise the work', 'Confirm your authorised contact, access arrangements and who can approve work or receive reports.'],
      ['3. Review the scope and price', 'Review the individual price or quote. For a plan, confirm included work, allowances, extras and the full terms before accepting.'],
      ['4. Mobilise the property or portfolio', 'Share the records and contacts we need. We agree the visit or recurring schedule and confirm property access.'],
      ['5. Deliver the task and retain a record', 'We complete the agreed work and issue useful records to your authorised property account.'],
      ['6. Review next steps', 'Review the outcome and approve any further work or expenditure. Ongoing services follow your agreed schedule.'],
    ],
  },
  'client-experience': {
    title: 'A connected view of the work behind your property.',
    intro: 'Find the task, the result and the next step in the context of your property.',
    sections: [
      ['Start with your property', 'Open the property or organisation you are authorised to use. Your verified role determines what you can see and do.'],
      ['Arrange or review an instruction', 'Choose the task and confirm the scope, price and access. Your booking confirmation tells you when the appointment is agreed.'],
      ['See the documented outcome', 'Review dated photographs, condition findings, attendance notes or handover actions, depending on the service.'],
      ['Follow up a task', 'See what needs attention, ask about next steps and approve further work when required.'],
      ['Permission follows responsibility', 'Owners, managers and invited residents see the information appropriate to their verified relationship. Private records stay within that scope.'],
      ['An ongoing service relationship', 'Use an agreed service and reporting routine to keep property tasks in view. Available tools follow your account permissions.'],
    ],
  },
  'why-proinspect': {
    title: 'Practical attendance backed by a clear next action.',
    intro: 'ProInspect connects inspections, property operations and building services so clients can spend less time chasing activity and more time making informed decisions.',
    sections: [
      ['Work shaped around the property', 'From a single rental to a shared building, we shape the work around occupancy, facilities and your team.'],
      ['One-off work and operational continuity', 'Book one inspection or delegate a recurring workload, with practical attendance and clear records in either case.'],
      ['Reports that support decisions', 'See what happened, what remains outstanding and who needs to decide through useful reports and action records.'],
      ['Clear responsibilities', 'Agree who instructs, who approves costs and who follows up, so the next step has an owner.'],
      ['A practical partner for different teams', 'Self-managing landlords, agencies, asset managers, strata councils, shared-accommodation operators and project teams can obtain the type of service appropriate to their role.'],
      ['Defined fees rather than assumptions', 'Compare our monthly plans, sign in for individual service prices or request a tailored quote. Scope and extras are agreed before you commit.'],
    ],
  },
  'areas-we-service': {
    title: 'Where ProInspect provides property services.',
    intro: 'Our standard scheduled service area covers approved suburbs in Perth and Peel. For other Western Australian locations, send an enquiry and we will assess coverage, travel and the work required.',
    sections: [
      ['Search using suburb and postcode', 'Search both details to check our Perth and Peel service reference. We confirm access and availability before booking.'],
      ['Some locations require individual confirmation', 'Islands, postal-only entries and locations with travel or access constraints need individual confirmation.'],
      ['Outside Perth and Peel', 'Send the location, task and preferred timing. We will review availability and travel costs.'],
      ['Before confirming any service', 'We confirm the scope, access, availability and cost. Urgent requests still require confirmation; this is not an emergency service.'],
    ],
  },
  about: {
    title: 'On-the-ground support. Structured property records.',
    intro:
      'ProInspect provides property inspection and operational attendance services in Western Australia.',
    sections: [
      [
        'What we focus on',
        'Practical property work: inspections, authorised attendance, maintenance assessment, contractor access and documented follow-up.',
      ],
      [
        'A clear service boundary',
        'The agreed scope determines what is inspected, attended or documented. Specialist technical work, legal determinations and scheme governance are not assumed to be included.',
      ],
      [
        'A connected approach',
        'We are building a platform where the people involved can follow authorised work and retain the resulting property record.',
      ],
    ],
  },
  contact: {
    title: 'Tell us what the property needs.',
    intro: 'Discuss a service, portfolio or operational support requirement.',
    sections: [
      [
        'Service enquiries',
        'Email info@proinspect.systems with the service you need, the general property location and a suitable way to contact you. Do not include access codes, sensitive tenant information or confidential evidence in an initial enquiry.',
      ],
      [
        'Ready to book?',
        'Use the service catalogue to select an inspection or attendance, then continue to the authenticated booking flow. Availability and scope must be confirmed.',
      ],
      [
        'Portfolio and strata requirements',
        'Describe the properties or schemes, the type of work and the level of ongoing support required. Professional and strata portal onboarding will be enabled through staged releases.',
      ],
    ],
  },
  resources: {
    title: 'Property knowledge, built from real work.',
    intro:
      'Find practical guidance on choosing an inspection, preparing for attendance and understanding the resulting record.',
    sections: [
      [
        'Start with the service',
        'Each service page explains its purpose and how to discuss the scope.',
      ],
      [
        'Useful comparisons',
        'Compare routine inspections with incoming PCRs, pre-vacate visits with final inspections, and one-off services with ongoing support.',
      ],
    ],
  },

};
export async function loader({ params,context }: LoaderFunctionArgs) {
  const key = params.page ?? '';
  if (Object.prototype.hasOwnProperty.call(PUBLIC_LEGAL_DRAFTS,key)) {
    const legalKey = key as PublicLegalKey;
    const env=context.get(runtimeContext).env as Env;
    const approved=(key==='privacy'?await managedPrivacyDocument(env):null)??await currentLegalDocument(env,key);
    if(approved)return {title:approved.title,intro:approved.body.intro,sections:approved.body.sections as Array<[string,string]>,path:'/'+key,legalApproved:true,version:approved.version_label,effectiveAt:approved.effective_at};
    return {
      ...PUBLIC_LEGAL_DRAFTS[legalKey],
      path: '/' + key,
      legalApproved: PUBLIC_LEGAL_APPROVAL[legalKey].approved,version:null,effectiveAt:null,
    };
  }
  const page = pages[key];
  if (!page) throw new Response('Not found', { status: 404 });
  return { ...page, path: '/' + key, legalApproved: true,version:null,effectiveAt:null };
}
export const meta: MetaFunction<typeof loader> = ({ loaderData }) =>
  loaderData
    ? [...seo(loaderData.title, loaderData.intro, loaderData.path),
       ...(!loaderData.legalApproved ? [{ name: 'robots', content: 'noindex, nofollow' }] : [])]
    : [];
export default function Information() {
  const p = useLoaderData<typeof loader>();
  const { appOrigin } = useOutletContext<{ appOrigin: string }>();
  const legal = Object.prototype.hasOwnProperty.call(PUBLIC_LEGAL_DRAFTS,p.path.slice(1));
  const how = p.path === '/how-it-works';
  const client = p.path === '/client-experience';
  const why = p.path === '/why-proinspect';
  const serviceArea = p.path === '/areas-we-service';
  const about = p.path === '/about';
  const label = legal && p.legalApproved ? 'Legal documents' : legal ? 'Legal documents — review drafts' : how ? 'How we work' : client ? 'The client experience' : why ? 'Why ProInspect' : serviceArea ? 'Where we work' : about ? 'About ProInspect' : 'Property services';
  const visual = legal ? 'none' as const : client ? 'report' as const : how ? 'process' as const : serviceArea ? 'residential' as const : about ? 'commercial' as const : 'services' as const;
  return (
    <>
      <MarketingPageHero
        eyebrow={label}
        title={p.title}
        intro={p.intro}
        crumbs={[{ label }]}
        visual={visual}
        primary={legal ? undefined : { label: how ? 'Explore services' : 'Discuss your needs', to: how ? '/services' : '/contact' }}
      />
      {legal && !p.legalApproved && (
        <section className="mkt-legal-notice" aria-label="Pre-release policy notice">
          <div className="site-container">
            <strong>Pre-release information</strong>
            <span>{p.path === '/privacy' ? 'Privacy handling statements here are proposals pending operator review.' : 'These legal conditions are proposals pending operator review.'} Do not treat this review draft as an approved policy or a binding contract.</span>
          </div>
        </section>
      )}
      <section className="section mkt-section">
        <div className="site-container">
          <MarketingSectionTitle
            eyebrow={legal ? 'Current release information' : how ? 'A clear process' : why ? 'Our approach' : client ? 'Your property record' : serviceArea ? 'Location and availability' : 'What you should know'}
            title={legal ? (p.legalApproved?'Approved document version':'Review the proposed contents.') : how ? 'Simple steps. Agreed responsibilities.' : why ? 'What matters in a property service.' : client ? 'Property work with context.' : serviceArea ? 'Check your location before arranging attendance.' : 'The practical approach behind the work.'}
            description={legal
              ? (p.legalApproved?'Version '+p.version+'; effective '+p.effectiveAt+'. Accepted historical versions are retained separately.':'The final policy or contract will take effect only after its actual operator, commitments, applicable disclosures and publication date have been approved.')
              : how ? 'Different engagements need different onboarding steps, approvals and reporting.' : client ? 'See how instructions, records and next actions stay associated with the property.' : why ? 'The outcome matters: a documented task, a clear next action and appropriate oversight.' : serviceArea ? 'Enter a suburb and postcode to review the local service reference.' : 'Find the right support and agree the scope before attendance.'}
          />
          <MarketingEditorialBlocks sections={p.sections} numbered={how} />
          {serviceArea && <CoverageLookup />}
        </div>
      </section>

      {how && (
        <section className="section mkt-section mkt-stone">
          <div className="site-container">
            <MarketingSectionTitle eyebrow="Ways to work with ProInspect" title="A service when you need it. Support when it makes sense." description="Choose an individual instruction, an inspection arrangement or broader ongoing operational support. Every model requires a defined scope." />
            <nav className="mkt-engagement-grid" aria-label="Ways to work with ProInspect">
              {Object.entries(ENGAGEMENTS).map(([slug, engagement], i) => (
                <Link className="mkt-engagement-card mkt-linked-card" key={slug} to={'/how-we-work/' + slug}>
                  <span className="mkt-card-number">0{i + 1}</span>
                  <h3>{engagement.title}</h3>
                  <p>{engagement.intro}</p>
                  <span className="mkt-text-link">Explore arrangement <span aria-hidden="true">↗</span></span>
                </Link>
              ))}
            </nav>
          </div>
        </section>
      )}

      {(why || client) && (
        <section className="section mkt-section mkt-stone">
          <div className="site-container mkt-callout-grid">
            <div>
              <p className="eyebrow">Evidence and outcomes</p>
              <h2>Ask for the record that fits the instruction.</h2>
              <p>Report content and supporting evidence vary by service. Defined scope, relevant observations and appropriate customer access matter more than unsupported marketing claims.</p>
              <Link className="mkt-text-link" to="/services/routine-inspection">Explore a detailed service example <span aria-hidden="true">↗</span></Link>
            </div>
            <div className="mkt-callout-panel">
              <span className="mkt-card-number">CLEAR EXPECTATIONS</span>
              <h3>We distinguish services from specialist decisions.</h3>
              <p>Documenting visible condition is not the same as technical certification, repairing a fault or deciding legal responsibility. Additional work requires an agreed scope.</p>
            </div>
          </div>
        </section>
      )}

      {(about || serviceArea) && (
        <section className="section mkt-section mkt-stone">
          <div className="site-container mkt-callout-grid">
            <div><p className="eyebrow">Working with ProInspect</p><h2>Tell us about the property and the task.</h2><p>We can review a service request or a broader property operations requirement. Scope, coverage, access and availability are not guaranteed until confirmed.</p></div>
            <div className="mkt-callout-panel"><span className="mkt-card-number">ENQUIRY CHECKLIST</span><ul className="mkt-check-list"><li>General location or suburb</li><li>Property type and intended outcome</li><li>Preferred timeframe and known access constraints</li></ul><p className="mkt-image-disclosure">Do not include private access codes or confidential tenancy information in a public enquiry.</p></div>
          </div>
        </section>
      )}

      {legal ? (
        <section className="section mkt-section mkt-stone">
          <div className="site-container mkt-callout-grid">
            <div><p className="eyebrow">Further information</p><h2>Have a question about this notice?</h2><p>Contact ProInspect for the appropriate published documentation before relying on commercial or privacy commitments.</p></div>
            <div className="mkt-callout-panel"><h3>Review the public information.</h3><p>Approved documents, once published, take precedence over these pre-release descriptions.</p><Link className="button secondary" to="/contact">Contact ProInspect <span aria-hidden="true">→</span></Link></div>
          </div>
        </section>
      ) : (
        <MarketingCta
          title={how ? 'Ready to arrange property work?' : why ? 'See how ProInspect could help.' : client ? 'Give property work a clearer record.' : 'Discuss your property requirements.'}
          description="Select an appropriate service or tell us what you need attended, inspected or documented. We confirm scope, availability and access before proceeding."
          appOrigin={appOrigin}
        />
      )}
    </>
  );
}
