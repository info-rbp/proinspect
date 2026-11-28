import {
  Link,
  useLoaderData,
  useSearchParams,
  useLocation,
  type LoaderFunctionArgs,
} from 'react-router';
import { runtimeContext } from '../../../../packages/database/context';
import type { Env } from '../../../../packages/database/types';
import { publicListings } from '../../../platform/worker/features/leasing.server';
import {
  displayPrice,
  propertyUrl,
  handoffDisclaimer,
} from '../../../../packages/marketing/leasing';
import { LEASING_PROPERTY_TYPES, leasingPropertyType, leasingPropertyTypeLabel, filterLeasingListings } from '../../../../packages/marketing/leasing-property-types';
import { seo } from '../lib/seo';
import { EditorialHero } from '../components/editorial';
import '../../../../packages/ui/leasing.css';
export const meta = () =>
  seo(
    'Properties for Lease & Open Homes — Western Australia',
    'Browse published properties for lease, explore available inspection sessions and follow the advertised application instructions.',
    '/leasing',
    { noindex: true },
  );
export async function loader({ context }: LoaderFunctionArgs) {
  const env = context.get(runtimeContext).env as Env;
  return { listings: await publicListings(env) };
}
export default function LeasingIndex() {
  const { listings } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const kind = leasingPropertyType(params.get('type'));
  const q = (params.get('q') ?? '').trim();
  const selectedTypeLabel = leasingPropertyTypeLabel(kind);
  const items = filterLeasingListings(listings, kind, q);
  return (
    <>
      <EditorialHero
        eyebrow="Properties Available"
        title="Find Your Next Place."
        intro="See what is available, when inspections are advertised and how to apply through the process selected by the responsible landlord or leasing agent."
        image="leasing"
        primary={{ label: "See What's Available", to: '#available-properties' }}
        secondary={{ label: 'Tenant information', to: '/tenants' }}
      />
      <section
        className="mkt-section pi-editorial-section pi-leasing-results"
        id="available-properties"
      >
        <div className="site-container">
          <div className="pi-section-heading">
            <p className="eyebrow">Current opportunities</p>
            <h2>Current Properties Available.</h2>
            <p>
              Browse published properties for lease. Choose a property to see its available photos,
              inspection sessions and application information.
            </p>
          </div>
          <form className="leasing-filters" method="get" key={params.toString()} action={pathname + '#available-properties'} aria-label="Search properties for lease">
            <label>
              Find a suburb or address
              <input
                aria-label="Search property location"
                name="q"
                placeholder="Suburb, property or postcode"
                defaultValue={params.get('q') ?? ''}
              />
            </label>
            <label>
              Property type
              <select name="type" defaultValue={kind}>
                <option value="">All types</option>
                {LEASING_PROPERTY_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>
            <button className="button">Search properties</button>
          </form>
          <p className="pi-results-count" role="status">
            {items.length} {items.length === 1 ? 'property' : 'properties'} available
            {q || kind ? ' matching your search' : ''}
          </p>
          {items.length === 0 ? (
            <div className="panel pi-leasing-empty">
              <h3>No properties currently match.</h3>
              <p>
                {selectedTypeLabel && !q
                  ? `There are no published ${selectedTypeLabel} listings available at present. Try another property type or view all properties.`
                  : 'Try another suburb or property type. Only approved, published listings appear here.'}
              </p>
              <Link className="pi-inline-link" to={pathname + '#available-properties'}>
                View all properties <span aria-hidden="true">→</span>
              </Link>
            </div>
          ) : (
            <div className="pi-listing-grid">
              {items.map((property: any) => (
                <article className="leasing-card pi-listing-card" key={property.id}>
                  <Link
                    className="leasing-image"
                    to={propertyUrl(property.kind, property.slug)}
                    aria-label={'View ' + property.title}
                  >
                    <img
                      src={`/api/public/leasing/photos/${property.id}/cover`}
                      alt={property.title}
                      loading="lazy"
                      width={900}
                      height={600}
                    />
                  </Link>
                  <div className="pi-listing-body">
                    <p className="eyebrow">
                      {leasingPropertyTypeLabel(property.kind) ?? 'Property'} ·{' '}
                      {property.suburb}
                    </p>
                    <h3>
                      <Link to={propertyUrl(property.kind, property.slug)}>{property.title}</Link>
                    </h3>
                    <p className="leasing-price">
                      {displayPrice(property.price_cents, property.price_period)}
                    </p>
                    <p className="leasing-card-facts">
                      {property.kind === 'residential'
                        ? [
                            property.bedrooms != null
                              ? `${property.bedrooms} ${property.bedrooms === 1 ? 'bed' : 'beds'}`
                              : '',
                            property.bathrooms != null
                              ? `${property.bathrooms} ${property.bathrooms === 1 ? 'bath' : 'baths'}`
                              : '',
                            property.parking != null
                              ? `${property.parking} ${property.parking === 1 ? 'car bay' : 'car bays'}`
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : property.area_sqm != null
                          ? `${property.area_sqm.toLocaleString()} m²`
                          : `${leasingPropertyTypeLabel(property.kind) ?? 'Property'} listing`}
                    </p>
                    <p className="small">Inspections facilitated by ProInspect</p>
                    <Link className="pi-inline-link" to={propertyUrl(property.kind, property.slug)}>
                      View property, inspections &amp; applications{' '}
                      <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
      <section className="mkt-section pi-editorial-section pi-neutral">
        <div className="site-container">
          <div className="pi-section-heading">
            <p className="eyebrow">Your next steps</p>
            <h2>Browse. Visit. Apply.</h2>
            <p>
              Find the property that suits you and follow its advertised inspection and application
              options.
            </p>
          </div>
          <ol className="pi-process-list">
            <li>
              <span className="pi-step-number">01</span>
              <h3>Explore current properties</h3>
              <p>
                Review property details, available photos and advertised inspection sessions.
              </p>
            </li>
            <li>
              <span className="pi-step-number">02</span>
              <h3>Register for a viewing</h3>
              <p>
                Register for an advertised open home on the property page. If no session is listed,
                register your interest and check back for inspection information.
              </p>
            </li>
            <li>
              <span className="pi-step-number">03</span>
              <h3>Follow the application pathway</h3>
              <p>
                When applications are open, use the property’s secure application option or approved
                provider link. The responsible landlord or agent sets the requirements and makes the
                decision.
              </p>
            </li>
          </ol>
          <div className="pi-leasing-note">
            <p>{handoffDisclaimer}</p>
            <p>
              Inspection registrations and rental applications are separate steps. The authorised
              landlord or agency remains responsible for rental terms, application requirements and
              decisions.
            </p>
            <Link className="pi-inline-link" to="/open-home/check-in">
              Attending today? Open home check-in <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
