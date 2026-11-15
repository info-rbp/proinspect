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
    intro: 'Choose an individual service, a residential or commercial subscription, or a tailored property programme. The onboarding steps differ according to the support you need.',
    sections: [
      ['1. Identify the right service', 'Tell us about the property, location, tenant or building context and the outcome you need. A one-off inspection can begin with a specific task; an ongoing programme starts with understanding your operating workload.'],
      ['2. Confirm who can authorise the work', 'Identify the landlord, appointed manager, building representative or project team. Agree entry arrangements, instructions, spending approvals, permitted records and reporting recipients.'],
      ['3. Review the scope and price', 'For one-off work, confirm the quote or signed-in individual service price. For subscriptions, review the included-service matrix, visit allowances, extras, initial term and separate early-exit provisions before accepting.'],
      ['4. Mobilise the property or portfolio', 'For recurring work, confirm existing records, contacts, contractors, responsibilities, upcoming dates, reporting frequency and applicable checklists. For individual work, confirm the visit and property access.'],
      ['5. Deliver the task and retain a record', 'The assigned work is completed within the agreed scope. Reports, images, issues registers or attendance records are issued to the appropriate authorised client or property workspace.'],
      ['6. Review next steps', 'The client approves any new spend, follow-up attendance or specialist work outside the original scope. Subscription work continues to the agreed schedule rather than assuming unlimited services.'],
    ],
  },
  'client-experience': {
    title: 'A connected view of the work behind your property.',
    intro: 'Keep requested tasks, responsible contacts and issued records associated with the relevant property and authorised relationship.',
    sections: [
      ['Start with your property', 'Identify the home, commercial tenancy, building or project relevant to your authorised role. Different people may have access to different records and actions.'],
      ['Arrange or review an instruction', 'The service request records the location, purpose, access requirements and approved task. An enquiry or tentative calendar time is not automatically a confirmed booking.'],
      ['See the documented outcome', 'Depending on the service, an issued record may contain dated photographs, condition observations, a completed-work summary, a handover list or matters needing review.'],
      ['Follow up a task', 'The responsible client can consider issues, ask about next actions and separately authorise work beyond the initial service. Reports do not themselves make financial, legal or specialist decisions.'],
      ['Permission follows responsibility', 'Private landlords, professional managers, contractors, tenants, resident groups and strata representatives do not share unrestricted access. Invitations and verified relationships determine what can be viewed.'],
      ['An ongoing service relationship', 'Under an approved recurring programme, agreed reporting and service schedules support oversight across the property. Specific portal features depend on their authorised release and service permissions.'],
    ],
  },
  'why-proinspect': {
    title: 'Practical attendance backed by a clear next action.',
    intro: 'ProInspect connects inspections, property operations and building services so clients can spend less time chasing activity and more time making informed decisions.',
    sections: [
      ['Work shaped around the property', 'An apartment needs different care from a commercial tenancy, student accommodation operation or strata building. We scope the work around occupancy, shared facilities, building routines and the people responsible.'],
      ['One-off work and operational continuity', 'Choose a single dated inspection or delegate an agreed recurring workload. The same practical service approach supports both specific tasks and broader outsourced operations.'],
      ['Reports that support decisions', 'Condition photographs, issue registers, handover records, contractor attendance notes and owner updates explain what happened, what remains outstanding and who needs to decide.'],
      ['Clear responsibilities', 'A documented authority matrix identifies the client, instructed activities, entry and safety conditions, approval limits and specialist responsibilities. That clarity helps prevent work from being lost between parties.'],
      ['A practical partner for different teams', 'Self-managing landlords, agencies, asset managers, strata councils, shared-accommodation operators and project teams can obtain the type of service appropriate to their role.'],
      ['Defined fees rather than assumptions', 'Subscriptions have disclosed marketing prices; individual service rates sit in authorised client accounts. Every paid engagement requires approved inclusions, expenses, allowances and additional work arrangements before acceptance.'],
    ],
  },
  'areas-we-service': {
    title: 'Where ProInspect provides property services.',
    intro: 'Our standard scheduled service area covers approved suburbs in Perth and Peel. For other Western Australian locations, send an enquiry and we will assess coverage, travel and the work required.',
    sections: [
      ['Search using suburb and postcode', 'Enter both details to locate your property in the Perth and Peel service reference. A match helps identify potential scheduled coverage but is not an appointment confirmation.'],
      ['Some locations require individual confirmation', 'Island, postal delivery, regional or other specially flagged entries are reviewed manually. A general postal code does not necessarily establish practical travel or service availability.'],
      ['Outside Perth and Peel', 'We consider other WA locations upon request. Include the general location, work type, access requirements and preferred timeframe so we can review capacity and appropriate travel arrangements.'],
      ['Before confirming any service', 'We check the property instructions, lawful access, staffing, travel, scope and any additional cost. An urgent request does not guarantee immediate or emergency attendance.'],
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
      'Guides, comparisons and case studies will be published as reviewed content becomes available.',
    sections: [
      [
        'Start with the service',
        'Each service page explains its purpose and how to discuss the scope.',
      ],
      [
        'No invented evidence',
        'We will not publish unverified case studies, performance statistics or customer testimonials. Operational examples must be reviewed and de-identified before publication.',
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
