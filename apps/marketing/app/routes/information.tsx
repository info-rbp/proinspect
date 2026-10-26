import {runtimeContext} from '../../../../packages/database/context';
import type {Env} from '../../../../packages/database/types';
import {currentLegalDocument} from '../../../platform/worker/features/legal-acceptance.server';
import { ENGAGEMENTS } from '../../../../packages/marketing/content';
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
    title: 'A practical path from instruction to property record.',
    intro: 'Start with one service or discuss a recurring arrangement.',
    sections: [
      [
        '1. Choose the outcome',
        'Explore the service catalogue or discuss the property task you need help with.',
      ],
      [
        '2. Set up your account and property',
        'Verify your email, establish the appropriate relationship and select the property.',
      ],
      [
        '3. Confirm the work',
        'Agree the service, access arrangements, price and appointment before the work proceeds.',
      ],
      [
        '4. Keep the result',
        'Issued reports and documents are made available through the authorised property account.',
      ],
      [
        'Ongoing arrangements',
        'Inspection plans, standard support and outsourced operations need a defined scope, responsibilities and agreed commercial terms. Talk to ProInspect about the workload rather than assuming a package covers every task.',
      ],
    ],
  },
  'client-experience': {
    title: 'Your property work does not disappear into email.',
    intro:
      'One account connects you to the properties and relationships you are authorised to manage.',
    sections: [
      [
        'A record for the property',
        'Bookings, requests, work orders and issued reports belong to the same property context.',
      ],
      [
        'Access follows your role',
        'A private landlord, tenant and operations employee do not see the same information. Access is checked for each relationship and document.',
      ],
      [
        'Reports when they are ready',
        'Email tells you an issued report is available. Your account remains its secure point of access.',
      ],
      [
        'A workspace for each relationship',
        'Self-managing landlords, property managers, strata managers, tenants, residents and council members use different authorised workspaces. Organisation review, invitations and effective membership dates determine access. Hosted availability is confirmed during release, not by this preview.',
      ],
    ],
  },
  'why-proinspect': {
    title: 'Practical work, connected records.',
    intro: 'Choose one service or discuss ongoing property support.',
    sections: [
      [
        'A clear operational boundary',
        'Confirm the instruction, access and reporting output before work starts.',
      ],
      [
        'Property and scheme context',
        'Keep bookings, requests and issued records connected instead of scattered across separate email conversations.',
      ],
      [
        'Different roles, appropriate access',
        'Self-managing landlords, professional managers, residents, tenants and council members have different permissions.',
      ],
      [
        'Evidence rather than unsupported claims',
        'Ask about the intended report and service scope. Testimonials, performance figures and credentials will only be published after verification.',
      ],
    ],
  },
  'areas-we-service': {
    title: 'Confirm service availability for your location.',
    intro:
      'ProInspect is focused on property work in Western Australia. Coverage and attendance depend on the location, service and agreed scope.',
    sections: [
      [
        'Tell us the general location',
        'Include the suburb or locality in your enquiry. Do not send access codes or confidential tenancy information.',
      ],
      [
        'Confirm before booking',
        'A location appearing in a guide does not establish a service-area or urgent-response commitment. Availability is confirmed with the appointment or quotation.',
      ],
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
    const approved=await currentLegalDocument(context.get(runtimeContext).env as Env,key);
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
              : 'We describe our service boundaries clearly and only make commitments once the instruction is confirmed.'}
          />
          <MarketingEditorialBlocks sections={p.sections} numbered={how} />
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
