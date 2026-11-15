import { useState } from 'react';
import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace } from '../lib/workspace';
import { PageHeading } from '../../../../packages/ui/components';
import {
  CommercialAdminForm,
  ReviewRecord,
  adminText as get,
} from '../components/CommercialAdminForm';
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  return loadApi(request, context, '/api/staff/commercial-applications/' + params.applicationId);
}
function OfferForm({ base, page }: { base: string; page: any }) {
  const [incentives, setIncentives] = useState<Array<Record<string, string>>>([]);
  return (
    <CommercialAdminForm
      endpoint={base + '/offer'}
      label="Attach applicant-specific authorised offer"
      build={(f) => ({
        version: page.application.version,
        offer: {
          id: get(f, 'offerId'),
          version: get(f, 'offerVersion'),
          expiresAt: new Date(get(f, 'expiry')).toISOString(),
          authorisationReference: get(f, 'authorityReference'),
          rent: {
            amountCents: Math.round(Number(get(f, 'rentAmount')) * 100),
            period: get(f, 'rentPeriod'),
            currency: 'AUD',
            taxTreatment: get(f, 'rentTax'),
          },
          term: get(f, 'term'),
          options: get(f, 'options'),
          commencement: get(f, 'commencement'),
          paymentSchedule: get(f, 'paymentSchedule'),
          rentReview: get(f, 'rentReview'),
          incentives: incentives.map((i) => ({
            kind: i.kind,
            description: i.description,
            conditions: i.conditions,
            status: i.status,
            ...(i.from ? { from: i.from } : {}),
            ...(i.to ? { to: i.to } : {}),
          })),
          outgoings: {
            basis: get(f, 'outgoingsBasis'),
            paymentSchedule: get(f, 'outgoingsPayments'),
            responsibility: get(f, 'outgoingsResponsibility'),
          },
          security: {
            instrument: get(f, 'securityInstrument'),
            amountCents: Math.round(Number(get(f, 'securityAmount')) * 100),
            taxTreatment: get(f, 'securityTax'),
            conditions: get(f, 'securityConditions'),
          },
          leasingCosts: {
            description: get(f, 'leasingCosts'),
            responsibleParty: get(f, 'leasingCostsParty'),
            taxTreatment: get(f, 'leasingCostsTax'),
          },
          permittedPersonIds: f.getAll('permittedPeople').map(String),
          nonBinding: f.has('nonBinding'),
        },
      })}
    >
      <p>
        These terms apply only to this application. Never substitute the Medina example. Confirm
        amount periods, outgoings basis, tax and cost responsibility before attachment. Every
        participant must declare again after a new offer.
      </p>
      <div className="grid-2">
        {[
          ['offerId', 'Approved offer reference'],
          ['offerVersion', 'Offer document version'],
          ['authorityReference', 'Lessor authority reference'],
          ['term', 'Proposed term'],
          ['options', 'Options (if any)'],
          ['paymentSchedule', 'Payment timing'],
          ['rentReview', 'Rent review terms'],
          ['outgoingsBasis', 'Explicit outgoings calculation basis'],
          ['outgoingsPayments', 'Outgoings payment schedule'],
          ['outgoingsResponsibility', 'Outgoings responsibility'],
          ['securityInstrument', 'Security instrument'],
          ['securityTax', 'Verified security tax treatment'],
          ['securityConditions', 'Security conditions'],
          ['leasingCosts', 'Leasing costs description'],
          ['leasingCostsParty', 'Legally responsible party for costs'],
          ['leasingCostsTax', 'Verified cost tax treatment'],
        ].map(([name, label]) => (
          <label key={name}>
            {label}
            <input name={name} required={name !== 'options'} maxLength={1200} />
          </label>
        ))}
      </div>
      <div className="grid-2">
        <label>
          Base rent amount (AUD)
          <input name="rentAmount" type="number" min="0.01" step="0.01" required />
        </label>
        <label>
          Rent period
          <select name="rentPeriod" required>
            <option value="">Confirm period</option>
            <option value="year">Per year</option>
            <option value="month">Per month</option>
            <option value="week">Per week</option>
          </select>
        </label>
        <label>
          Rent tax treatment
          <select name="rentTax" required>
            <option value="">Confirm treatment</option>
            <option value="ex_gst">Excluding GST</option>
            <option value="incl_gst">Including GST</option>
            <option value="not_applicable">Not applicable</option>
          </select>
        </label>
        <label>
          Security amount (AUD)
          <input name="securityAmount" type="number" min="0" step="0.01" required />
        </label>
        <label>
          Proposed commencement
          <input type="date" name="commencement" required />
        </label>
        <label>
          Offer expiry
          <input type="datetime-local" name="expiry" required />
        </label>
      </div>
      <h3>Property-specific incentives</h3>
      {incentives.map((row, i) => (
        <fieldset key={i}>
          <legend>Incentive {i + 1}</legend>
          {['kind', 'description', 'conditions', 'from', 'to'].map((key) => (
            <label key={key}>
              {key.replace(/^./, (s) => s.toUpperCase())}
              <input
                type={['from', 'to'].includes(key) ? 'date' : 'text'}
                value={row[key]}
                onChange={(e) =>
                  setIncentives(
                    incentives.map((r, j) => (j === i ? { ...r, [key]: e.target.value } : r)),
                  )
                }
                required={['kind', 'description'].includes(key)}
              />
            </label>
          ))}
          <label>
            Status
            <select
              value={row.status}
              onChange={(e) =>
                setIncentives(
                  incentives.map((r, j) => (j === i ? { ...r, status: e.target.value } : r)),
                )
              }
            >
              {['proposed', 'agreed', 'completed'].map((v) => (
                <option value={v} key={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="rental-inline-button"
            onClick={() => setIncentives(incentives.filter((_, j) => j !== i))}
          >
            Remove incentive
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="button secondary"
        onClick={() =>
          setIncentives([
            ...incentives,
            { kind: '', description: '', conditions: '', from: '', to: '', status: 'proposed' },
          ])
        }
      >
        Add an authorised incentive
      </button>
      <label>
        Participants authorised to see this offer
        <select multiple name="permittedPeople" required>
          {page.people.map((p: any, i: number) => (
            <option value={p.id} key={p.id}>
              {p.lead ? 'Lead applicant' : 'Participant ' + (i + 1)}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" name="nonBinding" required />
        The displayed offer is non-binding and does not execute a lease or guarantee.
      </label>
    </CommercialAdminForm>
  );
}
export default function CommercialApplicationDetail() {
  const d = useLoaderData<typeof loader>(),
    a = d.application,
    w = useWorkspace().workspace,
    base = '/api/staff/commercial-applications/' + a.id;
  return (
    <>
      <PageHeading
        title={a.reference}
        eyebrow="Restricted commercial application"
        description={d.property.title + ' · ' + d.property.address}
      />
      <Link to={w.href + '/commercial-applications'}>Return to commercial queue</Link>
      <section className="panel">
        <h2>Readiness and retention</h2>
        <p>
          State: {a.status.replaceAll('_', ' ')}. Version: {a.version}. Retained until{' '}
          {a.retainedUntil}. Privacy hold: {a.privacyHoldUntil || 'None'}.
        </p>
        <p>
          Draft identity/financial answers remain private. Only sealed submissions appear below;
          authorised evidence review is separate.
        </p>
      </section>
      <section className="panel stack">
        <h2>Private evidence review</h2>
        <CommercialAdminForm
          endpoint={base + '/scan'}
          label="Request pending private security scans"
          build={() => ({})}
        >
          <p>
            The scanner transport and independent source acceptance must be active. HTTP acceptance
            never clears quarantine; only a signed clean verdict does.
          </p>
        </CommercialAdminForm>
        {d.documents.length === 0 ? (
          <p>No evidence uploaded.</p>
        ) : (
          d.documents.map((doc: any) => (
            <article className="panel" key={doc.id}>
              <h3>
                {doc.category.replaceAll('_', ' ')} {doc.period_label}
              </h3>
              <p>
                Scan: {doc.scan_status}. Review: {doc.review_status}.
              </p>
              {doc.scan_status === 'clean' && (
                <a href={base + '/documents/' + doc.id + '/download'} className="button secondary">
                  Download privately for review
                </a>
              )}
              {doc.review_status === 'quarantined' && (
                <CommercialAdminForm
                  endpoint={base + '/documents/' + doc.id + '/review'}
                  label="Record evidence review"
                  build={(f) => ({ status: get(f, 'status'), note: get(f, 'note') })}
                >
                  <label>
                    Disposition
                    <select name="status">
                      <option value="released">Release clean file</option>
                      <option value="rejected">Reject file</option>
                    </select>
                  </label>
                  <label>
                    Reason
                    <textarea name="note" minLength={10} required />
                  </label>
                </CommercialAdminForm>
              )}
            </article>
          ))
        )}
      </section>
      <section className="panel stack">
        <h2>Immutable submission revisions</h2>
        {d.submissions.length === 0 ? (
          <p>No household submission yet.</p>
        ) : (
          d.submissions.map((s: any, i: number) => (
            <details key={s.id}>
              <summary>
                Submission revision {d.submissions.length - i} · {s.createdAt}
              </summary>
              <ReviewRecord value={s.snapshot} />
            </details>
          ))
        )}
      </section>
      {['draft', 'in_progress', 'needs_information', 'ready', 'invited'].includes(a.status) && (
        <details className="panel">
          <summary>Applicant-specific offer</summary>
          <OfferForm base={base} page={d} />
        </details>
      )}
      <section className="panel stack">
        <h2>Authorised follow-up</h2>
        {['submitted', 'needs_information', 'scanning_validation'].includes(a.status) && (
          <CommercialAdminForm
            endpoint={base + '/review'}
            label="Request more information privately"
            build={(f) => ({
              command: 'request-information',
              version: a.version,
              note: get(f, 'note'),
              ...(get(f, 'personId') ? { personId: get(f, 'personId') } : {}),
            })}
          >
            <label>
              Recipient
              <select name="personId">
                <option value="">All participants — shared instructions only</option>
                {d.people.map((p: any, i: number) => (
                  <option value={p.id} key={p.id}>
                    {p.lead ? 'Lead' : 'Participant ' + (i + 1)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Instructions
              <textarea name="note" required minLength={10} />
            </label>
          </CommercialAdminForm>
        )}
        <CommercialAdminForm
          endpoint={base + '/review'}
          label="Record privacy hold or release"
          build={(f) => ({
            command: 'privacy-hold',
            version: a.version,
            note: get(f, 'note'),
            ...(get(f, 'until') ? { until: new Date(get(f, 'until')).toISOString() } : {}),
          })}
        >
          <label>
            Hold until (leave empty to release)
            <input type="datetime-local" name="until" />
          </label>
          <label>
            Authority and reason
            <textarea name="note" required minLength={10} />
          </label>
        </CommercialAdminForm>
      </section>
      <section className="panel stack">
        <h2>Recipient-bound referral</h2>
        {a.status === 'submitted' && (
          <CommercialAdminForm
            endpoint={base + '/referrals'}
            label="Prepare verified recipient handoff"
            build={(f) => ({
              version: a.version,
              reviewReference: get(f, 'reviewReference'),
              manualReviewConfirmed: f.has('manualReviewConfirmed'),
            })}
          >
            <label>
              Completed review evidence reference
              <input name="reviewReference" minLength={8} required />
            </label>
            <label className="check">
              <input type="checkbox" name="manualReviewConfirmed" required />
              Flagged legal structures, authority and financial alternatives have received the
              required review.
            </label>
            <p>
              No application is sent until an authorised dispatch. Holds, scan status, listing
              authority and source acceptance are rechecked.
            </p>
          </CommercialAdminForm>
        )}
        {d.referrals.map((r: any) => (
          <div className="panel" key={r.id}>
            <p>Referral state: {r.status}. Provider acceptance is separate from inbox delivery.</p>
            {['uncertain', 'accepted'].includes(r.status) && (
              <CommercialAdminForm
                endpoint={base + '/referrals/' + r.id + '/reconcile'}
                label="Record signed provider reconciliation"
                build={(f) => ({
                  receipt: get(f, 'receipt'),
                  timestamp: get(f, 'timestamp'),
                  signature: get(f, 'signature'),
                  reference: get(f, 'reference'),
                })}
              >
                <p>
                  Use a fresh signed provider receipt for this exact recipient and referral. This
                  records acceptance or a bounce and never resends the application.
                </p>
                <label>
                  Provider receipt payload
                  <textarea name="receipt" required maxLength={8000} />
                </label>
                <label>
                  Provider timestamp
                  <input name="timestamp" required />
                </label>
                <label>
                  Provider signature
                  <input name="signature" required />
                </label>
                <label>
                  Reconciliation evidence reference
                  <input name="reference" required minLength={8} />
                </label>
              </CommercialAdminForm>
            )}
            {r.status === 'prepared' && (
              <CommercialAdminForm
                endpoint={base + '/referrals/' + r.id + '/dispatch'}
                label="Dispatch to approved private provider"
                build={() => ({})}
              >
                <p>
                  Only a signed acknowledgement can mark acceptance. Uncertain outcomes are held for
                  reconciliation and are not automatically resent.
                </p>
              </CommercialAdminForm>
            )}
          </div>
        ))}
      </section>
      {a.status === 'referred' && (
        <section className="panel">
          <h2>Record the responsible lessor’s written decision</h2>
          <CommercialAdminForm
            endpoint={base + '/review'}
            label="Record externally authorised decision"
            build={(f) => ({
              command: 'decision',
              version: a.version,
              outcome: get(f, 'outcome'),
              authorityReference: get(f, 'authorityReference'),
              note: get(f, 'note'),
            })}
          >
            <label>
              Documented outcome
              <select name="outcome">
                <option value="no_decision">No decision</option>
                <option value="accepted">Accepted by responsible representative</option>
                <option value="declined">Declined by responsible representative</option>
              </select>
            </label>
            <label>
              Written authority reference
              <input name="authorityReference" minLength={8} required />
            </label>
            <label>
              Record and instructions
              <textarea name="note" minLength={10} required />
            </label>
            <p>
              This records an external decision; it does not create a lease, bond, payment or tenant
              account.
            </p>
          </CommercialAdminForm>
        </section>
      )}
      <section className="panel stack">
        <h2>Privacy and review requests</h2>
        {d.requests.map((r: any) => (
          <details key={r.id}>
            <summary>
              {r.kind.replaceAll('_', ' ')} · {r.at}
            </summary>
            <ReviewRecord value={r.detail} />
          </details>
        ))}
        {d.privacyRequests.map((r: any) => (
          <article className="panel" key={r.id}>
            <h3>
              {r.kind} · {r.status}
            </h3>
            <ReviewRecord value={r.detail} />
            {r.status === 'pending' && (
              <CommercialAdminForm
                endpoint={base + '/privacy/' + r.id}
                label="Record privacy response"
                build={(f) => ({
                  status: get(f, 'status'),
                  note: get(f, 'note'),
                  reference: get(f, 'reference'),
                })}
              >
                <label>
                  Response
                  <select name="status">
                    <option value="resolved">Resolved</option>
                    <option value="denied">Denied with documented reason</option>
                  </select>
                </label>
                <label>
                  Response / authority reference
                  <input name="reference" minLength={8} required />
                </label>
                <label>
                  Resolution and record of communication
                  <textarea name="note" required minLength={15} />
                </label>
              </CommercialAdminForm>
            )}
          </article>
        ))}
      </section>
      {['closed', 'withdrawn', 'expired', 'decision_recorded', 'blocked'].includes(a.status) &&
        !a.purgedAt && (
          <details className="panel">
            <summary>Verify policy-controlled erasure</summary>
            <p>
              Only an administrator may erase after the retention period, holds and provider copies
              are reviewed. Failed object deletion leaves a blocked record for recovery; it is not
              reported as complete.
            </p>
            <CommercialAdminForm
              endpoint={base + '/purge'}
              label="Erase expired private records and verify object deletion"
              build={(f) => ({
                version: a.version,
                reference: get(f, 'reference'),
                downstreamCopiesVerified: f.has('downstreamCopiesVerified'),
                backupsAndLegalHoldReviewed: f.has('backupsAndLegalHoldReviewed'),
              })}
            >
              <label>
                Erasure verification reference
                <input name="reference" required minLength={12} />
              </label>
              <label className="check">
                <input type="checkbox" name="downstreamCopiesVerified" required />
                Downstream copies and provider deletion evidence are verified.
              </label>
              <label className="check">
                <input type="checkbox" name="backupsAndLegalHoldReviewed" required />
                Backups, retention policy and all legal holds are reviewed.
              </label>
            </CommercialAdminForm>
          </details>
        )}
    </>
  );
}
