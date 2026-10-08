import { ENGAGEMENTS } from '../../../../packages/marketing/content';
import {
  Link,
  useLoaderData,
  useOutletContext,
  type LoaderFunctionArgs,
  type MetaFunction,
} from 'react-router';
import { seo } from '../lib/seo';

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
  privacy: {
    title: 'Privacy information',
    intro:
      'Pre-release notice: the final business privacy policy must be approved before public registration opens.',
    sections: [
      [
        'Purpose of this build',
        'This environment is for validation of the rebuilt ProInspect platform. Use synthetic data during testing.',
      ],
      [
        'Access to records',
        'The application is designed to restrict property and tenancy information to authorised relationships. Customer files are not public marketing assets.',
      ],
      [
        'Before launch',
        'The operator must publish the approved collection, use, disclosure, retention, access and contact policy. This placeholder is not a substitute for that policy.',
      ],
    ],
  },
  terms: {
    title: 'Service terms',
    intro:
      'Pre-release notice: approved commercial terms are required before public bookings are enabled.',
    sections: [
      [
        'Confirmed scope',
        'The service, price, access arrangements and appointment must be confirmed for each booking.',
      ],
      [
        'Scope limitations',
        'Catalogue descriptions do not establish a legal, engineering or emergency-response engagement.',
      ],
      [
        'Before launch',
        'The operator must approve cancellation, payment, service scope and complaint arrangements and publish the final terms.',
      ],
    ],
  },
};
export function loader({ params }: LoaderFunctionArgs) {
  const page = pages[params.page ?? ''];
  if (!page) throw new Response('Not found', { status: 404 });
  return { ...page, path: `/${params.page}` };
}
export const meta: MetaFunction<typeof loader> = ({ loaderData }) =>
  loaderData ? seo(loaderData.title, loaderData.intro, loaderData.path) : [];
export default function Information() {
  const p = useLoaderData<typeof loader>();
  const { appOrigin } = useOutletContext<{ appOrigin: string }>();
  return (
    <>
      <header className="service-hero">
        <div className="site-container">
          <p className="eyebrow">ProInspect</p>
          <h1>{p.title}</h1>
          <p>{p.intro}</p>
        </div>
      </header>
      <section className="section">
        <div className="site-container">
          <article className="prose">
            {p.sections.map(([title, text]) => (
              <section className="stack-sm" key={title}>
                <h2>{title}</h2>
                <p>{text}</p>
              </section>
            ))}
            {p.path === '/how-it-works' && (
              <nav className="stack" aria-label="Ways to work with ProInspect">
                {Object.entries(ENGAGEMENTS).map(([slug, e]) => (
                  <Link key={slug} to={`/how-we-work/${slug}`}>
                    {e.title}
                  </Link>
                ))}
              </nav>
            )}
            <div className="actions">
              <Link className="button" to="/services">
                Explore services
              </Link>
              {p.path === '/contact' ? (
                <a className="button secondary" href="mailto:info@proinspect.systems">
                  Email ProInspect
                </a>
              ) : (
                <a className="button secondary" href={`${appOrigin}/signin`}>
                  Open your account
                </a>
              )}
            </div>
          </article>
        </div>
      </section>
    </>
  );
}
