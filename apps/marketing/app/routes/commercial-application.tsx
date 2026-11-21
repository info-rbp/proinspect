import { residentialPublicResponse } from '../../../../packages/domain/residential-policy';
import { useState } from 'react';
import {
  Form,
  Link,
  data,
  redirect,
  useLoaderData,
  useActionData,
  useSearchParams,
  useRouteError,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from 'react-router';
import { platformEnv } from '../../../../packages/database/context';
import { AppError } from '../../../../packages/database/types';
import {
  COMMERCIAL_STEPS,
  evidenceCategories,
  commercialEditable,
} from '../../../../packages/marketing/commercial-application';
import {
  commercialPage,
  exchangeCommercialLink,
  commercialPrivateHeaders,
} from '../../../platform/worker/features/commercial-intake.server';
import {
  saveCommercialShared,
  inviteCommercialPerson,
  removeCommercialPerson,
  declareCommercialPerson,
  submitCommercial,
  uploadCommercialEvidence,
  deleteCommercialEvidence,
  withdrawCommercial,
  correctCommercialEmail,
  withdrawCommercialParticipation,
} from '../../../platform/worker/features/commercial-application-actions.server';
import { requestCommercialPrivacy } from '../../../platform/worker/features/commercial-privacy.server';
import { commercialSession, commercialSessionCookie } from '../lib/commercial-session.server';
import {
  EntityEditor,
  ReferenceEditor,
  TextField,
  LongField,
  MultiPeople,
} from '../components/commercial-application-fields';
import { boundedText } from '../../../../packages/http-bodies';
import '../../../../packages/ui/rental-application.css';
const titles = [
  'Property and offer',
  'Applicant entities',
  'Business operations',
  'Financial capacity',
  'References',
  'Premises and fit-out',
  'Security and guarantors',
  'Private declarations',
  'Review and submit',
];
export const meta = () => [
  { title: 'Private commercial application | ProInspect' },
  { name: 'robots', content: 'noindex, nofollow, noarchive' },
  { name: 'referrer', content: 'strict-origin' },
];
export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const env = platformEnv(context);
  try {
    if (params.token !== 'session') {
      const session = await exchangeCommercialLink(env, params.token ?? '');
      return redirect('/commercial-application/session', {
        headers: {
          ...commercialPrivateHeaders,
          'Set-Cookie': commercialSessionCookie(env, session),
        },
      });
    }
    return data(
      {
        ...(await commercialPage(env, commercialSession(request, env))),
        requestKey: crypto.randomUUID(),
      },
      { headers: commercialPrivateHeaders },
    );
  } catch (error) {
    throw new Response(
      error instanceof AppError ? error.message : 'Private application unavailable.',
      { status: error instanceof AppError ? error.status : 503, headers: commercialPrivateHeaders },
    );
  }
}
async function boundedMultipart(request: Request) {
  const maximum = 9 * 1024 * 1024;
  const reader = request.body?.getReader();
  if (!reader) return new FormData();
  const chunks: Uint8Array<ArrayBuffer>[] = [],
    headers = new Headers(request.headers);
  let bytes = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.length;
    if (bytes > maximum) {
      await reader.cancel();
      throw new AppError(413, 'COMMERCIAL_FILE_SIZE', 'Choose one file up to 8 MB.');
    }
    chunks.push(new Uint8Array(part.value));
  }
  return new Request(request.url, { method: 'POST', headers, body: new Blob(chunks) }).formData();
}
export async function action({ request, context, params }: ActionFunctionArgs) {
  const retired = residentialPublicResponse(request);
  if (retired) return retired;
  const env = platformEnv(context),
    session = commercialSession(request, env);
  if (params.token !== 'session' || request.headers.get('Origin') !== new URL(request.url).origin)
    return data(
      { error: 'Reload before submitting.' },
      { status: 403, headers: commercialPrivateHeaders },
    );
  try {
    const f = request.headers.get('content-type')?.includes('multipart/form-data')
      ? await boundedMultipart(request)
      : (() => new FormData())();
    if (!request.headers.get('content-type')?.includes('multipart/form-data'))
      new URLSearchParams(await boundedText(request, 65536)).forEach((v, k) => f.append(k, v));
    const get = (k: string) => String(f.get(k) ?? ''),
      yes = (k: string) => f.get(k) === 'yes',
      version = Number(get('version')),
      intent = get('intent');
    if (intent === 'save') {
      const section = get('section');
      let input: unknown;
      if (section === 'entity') input = JSON.parse(get('entity'));
      else if (section === 'operations')
        input = {
          businessDescription: get('businessDescription'),
          proposedUse: get('proposedUse'),
          tradingHours: get('tradingHours'),
          staffCount: Number(get('staffCount')),
          customerTraffic: get('customerTraffic'),
          proposedCommencement: get('proposedCommencement'),
          licencesAndPermits: get('licencesAndPermits'),
        };
      else if (section === 'financial')
        input = {
          historyYears: Number(get('historyYears')),
          basQuarters: Number(get('basQuarters')),
          unavailableReason: get('unavailableReason'),
          alternativeEvidence: get('alternativeEvidence'),
        };
      else if (section === 'references') {
        const ref = (prefix: string) => ({
          name: get(prefix + 'Name'),
          organisation: get(prefix + 'Organisation'),
          contact: get(prefix + 'Contact'),
          relationship: get(prefix + 'Relationship'),
        });
        input = {
          previousLandlord: yes('hasLandlord') ? ref('landlord') : null,
          noLandlordReason: get('noLandlordReason'),
          tradeReferences: JSON.parse(get('tradeReferences')),
          accountant: yes('hasAccountant') ? ref('accountant') : null,
          accountantPermission: yes('accountantPermission')
            ? {
                granted: true,
                scope: get('accountantScope'),
                expiresAt: new Date(get('accountantExpiry') + 'T23:59:59+08:00').toISOString(),
              }
            : null,
        };
      } else if (section === 'fitout')
        input = {
          alterations: yes('alterations'),
          description: get('description'),
          approvalNeeds: get('approvalNeeds'),
          signage: get('signage'),
          equipment: get('equipment'),
          utilities: get('utilities'),
          maintenanceResponsibilities: get('maintenanceResponsibilities'),
          parkingStorage: get('parkingStorage'),
        };
      else if (section === 'security')
        input = {
          instrument: get('instrument'),
          details: get('details'),
          guarantorPersonIds: JSON.parse(get('guarantorPersonIds') || '[]'),
          guarantorEntityIds: JSON.parse(get('guarantorEntityIds') || '[]'),
        };
      await saveCommercialShared(env, session, section, input, version);
      const index = COMMERCIAL_STEPS.indexOf(section as (typeof COMMERCIAL_STEPS)[number]);
      return redirect(
        '/commercial-application/session?step=' + COMMERCIAL_STEPS[Math.min(index + 1, 8)],
      );
    }
    if (intent === 'invite')
      await inviteCommercialPerson(
        env,
        session,
        { name: get('name'), email: get('email'), adultConfirmed: yes('adultConfirmed') },
        version,
      );
    else if (intent === 'remove-person')
      await removeCommercialPerson(env, session, get('personId'), version);
    else if (intent === 'upload') await uploadCommercialEvidence(env, session, f, version);
    else if (intent === 'delete-document')
      await deleteCommercialEvidence(env, session, get('documentId'), version);
    else if (intent === 'declare') {
      await declareCommercialPerson(
        env,
        session,
        {
          profile: {
            name: get('name'),
            email: get('email'),
            telephone: get('telephone'),
            address: get('address'),
            identityType: get('identityType'),
            identityReference: get('identityReference'),
            authorityStatement: get('authorityStatement'),
          },
          noticeHash: get('noticeHash'),
          authority: yes('authority'),
          nonBinding: yes('nonBinding'),
          referencePermission: yes('referencePermission'),
          guaranteeConsent: yes('guaranteeConsent'),
        },
        version,
        Number(get('personVersion')),
      );
      return redirect('/commercial-application/session?step=review');
    } else if (intent === 'submit') {
      const result = await submitCommercial(env, session, get('requestKey'), version);
      return data({ receipt: result.receipt }, { headers: commercialPrivateHeaders });
    } else if (intent === 'withdraw') await withdrawCommercial(env, session, version);
    else if (intent === 'withdraw-participation')
      await withdrawCommercialParticipation(env, session, version);
    else if (intent === 'privacy')
      await requestCommercialPrivacy(env, session, { kind: get('kind'), note: get('note') });
    else if (intent === 'correct-email') {
      await correctCommercialEmail(
        env,
        session,
        get('newEmail'),
        version,
        Number(get('personVersion')),
      );
      return redirect('/commercial-application/recover');
    } else throw Error('Choose an application action.');
    return redirect(
      '/commercial-application/session?step=' + encodeURIComponent(get('returnStep') || 'review'),
    );
  } catch (error) {
    return data(
      {
        error:
          error instanceof AppError
            ? error.message
            : 'Check the required fields, dates, references and evidence for this step.',
      },
      { status: error instanceof AppError ? error.status : 422, headers: commercialPrivateHeaders },
    );
  }
}
function Version({ page, intent, step }: { page: any; intent: string; step?: string }) {
  return (
    <>
      <input name="version" type="hidden" value={page.version} />
      <input name="intent" type="hidden" value={intent} />
      {step && (
        <>
          <input name="section" type="hidden" value={step} />
          <input name="returnStep" type="hidden" value={step} />
        </>
      )}
    </>
  );
}
function EvidencePanel({ page, step, editable }: { page: any; step: string; editable: boolean }) {
  return (
    <section className="rental-notice">
      <h3>Your private evidence</h3>
      {page.requiredPersonalEvidence.length > 0 && (
        <p>
          Specifically requested personal categories: {page.requiredPersonalEvidence.join(', ')}.
          Guarantee evidence applies only to proposed guarantors.
        </p>
      )}
      <p>
        Upload only evidence requested for this application. Files are quarantined until an approved
        scanner and authorised reviewer clear them. No public file links or email attachments are
        used. Other participants cannot see your files.
      </p>
      {editable && (
        <Form method="post" encType="multipart/form-data" className="rental-form">
          <Version page={page} intent="upload" step={step} />
          <label>
            Evidence category
            <select name="category">
              {evidenceCategories.map((c) => (
                <option key={c} value={c}>
                  {c.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          {page.lead && (
            <label>
              Business entity (business evidence only)
              <select name="entityId">
                <option value="">My personal evidence</option>
                {page.shared.entity?.entities.map((e: any) => (
                  <option key={e.id} value={e.id}>
                    {e.legalName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <TextField
            label="Financial year or BAS quarter (when applicable)"
            name="period"
            help="Use 2025-2026 for a financial year or 2026-Q1 for a BAS quarter."
          />
          <label>
            File
            <input type="file" name="file" required accept=".pdf,.jpg,.jpeg,.png,.webp" />
            <small>PDF, JPEG, PNG or WebP. Maximum 8 MB per file.</small>
          </label>
          <button className="button secondary">Upload privately</button>
        </Form>
      )}
      <ul className="rental-document-list">
        {page.documents.map((d: any) => (
          <li key={d.id}>
            <span>
              {d.category.replaceAll('_', ' ')} {d.period_label} ·{' '}
              {d.scan_status === 'clean'
                ? d.review_status === 'released'
                  ? 'Ready'
                  : 'Awaiting authorised review'
                : d.scan_status === 'unsafe'
                  ? 'Unsafe — remove and replace'
                  : 'Awaiting security scan'}
            </span>
            {editable && (
              <Form method="post">
                <Version page={page} intent="delete-document" step={step} />
                <input name="documentId" type="hidden" value={d.id} />
                <button className="rental-inline-button">Remove file</button>
              </Form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
function FinancialFields({ value }: { value: any }) {
  const [years, setYears] = useState(value?.historyYears ?? 2),
    [quarters, setQuarters] = useState(value?.basQuarters ?? 4);
  return (
    <>
      <p>
        By default provide two accountant-prepared financial years and four quarterly BAS returns. A
        new entity or unavailable history can be explained with alternative evidence for manual
        review.
      </p>
      <div className="rental-fields">
        <label>
          Financial years available
          <select
            name="historyYears"
            value={years}
            onChange={(e) => setYears(Number(e.target.value))}
          >
            {[0, 1, 2].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          BAS quarters available
          <select
            name="basQuarters"
            value={quarters}
            onChange={(e) => setQuarters(Number(e.target.value))}
          >
            {[0, 1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      {(years < 2 || quarters < 4) && (
        <>
          <LongField
            label="Why is history unavailable?"
            name="unavailableReason"
            value={value?.unavailableReason}
            required
          />
          <LongField
            label="Alternative evidence proposed"
            name="alternativeEvidence"
            value={value?.alternativeEvidence}
            required
          />
        </>
      )}
    </>
  );
}
function ReferenceFields({ value }: { value: any }) {
  const [landlord, setLandlord] = useState(Boolean(value?.previousLandlord)),
    [accountant, setAccountant] = useState(Boolean(value?.accountant)),
    [permission, setPermission] = useState(Boolean(value?.accountantPermission));
  const fields = (prefix: string, record: any) => (
    <div className="rental-fields">
      {['Name', 'Organisation', 'Contact', 'Relationship'].map((key) => (
        <TextField
          key={key}
          label={key === 'Contact' ? 'Email or telephone' : key}
          name={prefix + key}
          value={record?.[key.toLowerCase()]}
          required={key !== 'Organisation'}
        />
      ))}
    </div>
  );
  return (
    <>
      <label className="rental-check">
        <input
          type="checkbox"
          name="hasLandlord"
          value="yes"
          checked={landlord}
          onChange={(e) => setLandlord(e.target.checked)}
        />
        <span>I can provide a current or previous commercial landlord</span>
      </label>
      {landlord ? (
        fields('landlord', value?.previousLandlord)
      ) : (
        <LongField
          label="No commercial landlord history — explanation"
          name="noLandlordReason"
          value={value?.noLandlordReason}
          required
        />
      )}
      <ReferenceEditor value={value} />
      <label className="rental-check">
        <input
          type="checkbox"
          name="hasAccountant"
          value="yes"
          checked={accountant}
          onChange={(e) => setAccountant(e.target.checked)}
        />
        <span>Add an accountant or bookkeeper (optional)</span>
      </label>
      {accountant && (
        <>
          {fields('accountant', value?.accountant)}
          <label className="rental-check">
            <input
              type="checkbox"
              name="accountantPermission"
              value="yes"
              checked={permission}
              onChange={(e) => setPermission(e.target.checked)}
            />
            <span>Separately authorise contact with this accountant for the stated purpose</span>
          </label>
          {permission && (
            <>
              <LongField
                label="Exact purpose and limits of permission"
                name="accountantScope"
                value={value?.accountantPermission?.scope}
                required
              />
              <TextField
                label="Permission expires on"
                name="accountantExpiry"
                type="date"
                value={value?.accountantPermission?.expiresAt?.slice(0, 10)}
                required
              />
            </>
          )}
        </>
      )}
      <p className="rental-muted">
        A supplied contact is not permission to contact them. Tell referees why their details are
        supplied. Accountant permission is separately logged with its purpose and expiry.
      </p>
    </>
  );
}
function FitoutFields({ value }: { value: any }) {
  const [alterations, setAlterations] = useState(Boolean(value?.alterations));
  return (
    <>
      <label className="rental-check">
        <input
          type="checkbox"
          name="alterations"
          value="yes"
          checked={alterations}
          onChange={(e) => setAlterations(e.target.checked)}
        />
        <span>Alterations or fit-out are proposed</span>
      </label>
      {alterations && (
        <>
          <LongField
            label="Proposed alterations"
            name="description"
            value={value?.description}
            required
          />
          <LongField
            label="Plans and approvals needed"
            name="approvalNeeds"
            value={value?.approvalNeeds}
            required
          />
        </>
      )}
      {[
        ['signage', 'Signage proposal'],
        ['equipment', 'Plant or specialist equipment'],
        ['utilities', 'Utilities needed'],
        ['maintenanceResponsibilities', 'Proposed maintenance responsibilities'],
        ['parkingStorage', 'Parking and storage needs'],
      ].map(([key, label]) => (
        <LongField
          key={key}
          label={label}
          name={key}
          value={value?.[key]}
          required={['utilities', 'maintenanceResponsibilities', 'parkingStorage'].includes(key)}
        />
      ))}
      <p>
        Planning, building and other permissions are determined by the responsible authorities. This
        application grants none.
      </p>
    </>
  );
}
function SecurityFields({ page }: { page: any }) {
  const value = page.shared.security,
    [people, setPeople] = useState<string[]>(value?.guarantorPersonIds || []),
    [entities, setEntities] = useState<string[]>(value?.guarantorEntityIds || []);
  return (
    <>
      <p>{page.securityRequirements}</p>
      <p>
        Guarantee requirement: {page.guarantee}. Each guarantor must use their own private profile
        and consent to assessment. An application does not execute a guarantee.
      </p>
      <label>
        Proposed security instrument
        <select name="instrument" defaultValue={value?.instrument || 'none'}>
          {['none', 'cash', 'bank_guarantee', 'other'].map((v) => (
            <option value={v} key={v}>
              {v.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      <LongField
        name="details"
        label="Security details / questions for review"
        value={value?.details}
      />
      <input
        type="hidden"
        name="guarantorPersonIds"
        value={JSON.stringify(page.guarantee === 'none' ? [] : people)}
      />
      <input
        type="hidden"
        name="guarantorEntityIds"
        value={JSON.stringify(page.guarantee === 'none' ? [] : entities)}
      />
      {page.guarantee !== 'none' && (
        <>
          <MultiPeople
            label="Guarantor people (assign their entity role first)"
            value={people}
            onChange={setPeople}
            people={page.people}
          />
          <label>
            Guarantor entities
            <select
              multiple
              value={entities}
              onChange={(e) => setEntities(Array.from(e.target.selectedOptions, (o) => o.value))}
            >
              {page.shared.entity?.entities
                .filter((e: any) => e.capacity === 'guarantor')
                .map((e: any) => (
                  <option value={e.id} key={e.id}>
                    {e.legalName}
                  </option>
                ))}
            </select>
          </label>
        </>
      )}
    </>
  );
}
function SharedReview({ page }: { page: any }) {
  const shared = page.shared;
  return (
    <div className="rental-summary">
      <details>
        <summary>Applicant entities and roles</summary>
        {shared.entity?.entities.map((e: any) => (
          <article key={e.id}>
            <h3>{e.legalName}</h3>
            <p>
              {e.entityType.replaceAll('_', ' ')} · {e.capacity.replaceAll('_', ' ')}
            </p>
            <p>{e.address}</p>
            <p>
              {e.abn ? 'ABN ' + e.abn : ''} {e.acn ? 'ACN ' + e.acn : ''}
            </p>
            {e.tradingName && <p>Trading as {e.tradingName}</p>}
            <p>{e.capacityWording || e.liabilityArrangement || e.deedDescription || ''}</p>
            <p>
              {e.signatories.length} signatory participant(s); {e.directors?.length ?? 0}{' '}
              director(s); {e.partners?.length ?? 0} partner(s).
            </p>
          </article>
        ))}
      </details>
      <details>
        <summary>Business proposal and premises</summary>
        <dl>
          {Object.entries({ ...shared.operations, ...shared.fitout }).map(([key, value]) => (
            <div key={key}>
              <dt>{key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}</dt>
              <dd>{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</dd>
            </div>
          ))}
        </dl>
      </details>
      <details>
        <summary>Financial evidence scope</summary>
        <p>
          {shared.financial?.historyYears ?? 0} financial years;{' '}
          {shared.financial?.basQuarters ?? 0} BAS quarters.
        </p>
        <p>{shared.financial?.unavailableReason}</p>
        <p>{shared.financial?.alternativeEvidence}</p>
        <p>
          Each person’s private evidence is visible only to that person and authorised reviewers.
        </p>
      </details>
      <details>
        <summary>References and contact permissions</summary>
        <ul>
          {shared.references?.tradeReferences.map((r: any, i: number) => (
            <li key={i}>
              {r.name} · {r.organisation} · {r.relationship} · {r.contact}
            </li>
          ))}
        </ul>
        <p>{shared.references?.previousLandlord?.name || shared.references?.noLandlordReason}</p>
        <p>
          {shared.references?.accountantPermission
            ? 'Accountant permission: ' +
              shared.references.accountantPermission.scope +
              '; expires ' +
              shared.references.accountantPermission.expiresAt
            : 'No accountant contact permission.'}
        </p>
      </details>
      <details>
        <summary>Security and guarantee proposal</summary>
        <p>{page.securityRequirements}</p>
        <p>
          Instrument: {shared.security?.instrument.replaceAll('_', ' ') || 'Not supplied'}.{' '}
          {shared.security?.details}
        </p>
        <p>
          Guarantee requirement: {page.guarantee}. Individual guarantor assessments remain private.
        </p>
      </details>
    </div>
  );
}
export default function CommercialApplication() {
  const page = useLoaderData<typeof loader>(),
    result = useActionData<typeof action>(),
    [params] = useSearchParams();
  const selected = params.get('step'),
    step = COMMERCIAL_STEPS.includes(selected as any)
      ? (selected as (typeof COMMERCIAL_STEPS)[number])
      : 'property',
    index = COMMERCIAL_STEPS.indexOf(step),
    editable = commercialEditable(page.status);
  const value = (page.shared as any)[step] || {},
    profile = page.profile,
    guarantor = page.shared.entity?.roles.some(
      (r) => r.personId === page.personId && r.role === 'guarantor',
    );
  return (
    <div className="rental-shell">
      <div className="site-container">
        <div className="rental-progress-header">
          <div>
            <p className="eyebrow">Private commercial application · {page.reference}</p>
            <h1>{titles[index]}</h1>
            <p>
              {page.property.title} · {page.property.address}
            </p>
          </div>
          <span className="rental-state">{page.status.replaceAll('_', ' ')}</span>
        </div>
        <div className="rental-workspace">
          <aside className="rental-rail">
            <nav className="rental-steps" aria-label="Commercial application sections">
              {COMMERCIAL_STEPS.map((s, i) => (
                <Link
                  className={'rental-step' + (s === step ? ' active' : '')}
                  to={'?step=' + s}
                  key={s}
                  aria-current={s === step ? 'step' : undefined}
                >
                  <span className="rental-step-number">{i + 1}</span>
                  {titles[i]}
                </Link>
              ))}
            </nav>
            <p className="rental-muted">
              Your identity and documents are private. Save each section before leaving it.{' '}
              <Link to="/commercial-application/recover">Recover access</Link>.
            </p>
          </aside>
          <section className="rental-paper">
            {result && 'error' in result && (
              <p role="alert" className="notice warning">
                {result.error}
              </p>
            )}
            {result && 'receipt' in result && (
              <p role="status" className="rental-success">
                Application received. Receipt: {result.receipt}. This is not approval or a lease.
              </p>
            )}
            {page.informationRequests?.map((r: any) => (
              <div className="rental-notice" key={r.id}>
                <h3>More information requested</h3>
                <p>{r.instructions}</p>
              </div>
            ))}
            {step === 'property' && (
              <>
                <h2>Your property and authorised offer</h2>
                <p>
                  {page.property.address}, {page.property.suburb} WA {page.property.postcode}
                </p>
                {page.offer ? (
                  <div className="rental-notice">
                    <h3>Private offer — {page.offer.version}</h3>
                    <p>Expires {new Date(page.offer.expiresAt).toLocaleString('en-AU')}.</p>
                    <dl>
                      {[
                        [
                          'Rent',
                          new Intl.NumberFormat('en-AU', {
                            style: 'currency',
                            currency: 'AUD',
                          }).format(page.offer.rent.amountCents / 100) +
                            ' / ' +
                            page.offer.rent.period +
                            ' · ' +
                            page.offer.rent.taxTreatment.replaceAll('_', ' '),
                        ],
                        ['Term', page.offer.term],
                        ['Option', page.offer.options],
                        ['Commencement', page.offer.commencement],
                        ['Payment schedule', page.offer.paymentSchedule],
                        ['Rent review', page.offer.rentReview],
                        [
                          'Outgoings',
                          page.offer.outgoings.basis +
                            '; ' +
                            page.offer.outgoings.paymentSchedule +
                            '; ' +
                            page.offer.outgoings.responsibility,
                        ],
                        [
                          'Security',
                          page.offer.security.instrument +
                            '; ' +
                            new Intl.NumberFormat('en-AU', {
                              style: 'currency',
                              currency: 'AUD',
                            }).format(page.offer.security.amountCents / 100) +
                            '; ' +
                            page.offer.security.taxTreatment +
                            '; ' +
                            page.offer.security.conditions,
                        ],
                        [
                          'Leasing costs',
                          page.offer.leasingCosts.description +
                            '; responsible party: ' +
                            page.offer.leasingCosts.responsibleParty +
                            '; ' +
                            page.offer.leasingCosts.taxTreatment,
                        ],
                      ].map(([label, copy]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{copy}</dd>
                        </div>
                      ))}
                    </dl>
                    <ul>
                      {page.offer.incentives.map((i: any, n: number) => (
                        <li key={n}>
                          {i.description} · {i.from || ''} {i.to || ''} · {i.conditions} ·{' '}
                          {i.status}
                        </li>
                      ))}
                    </ul>
                    <p>
                      These are applicant-specific, non-binding proposed terms. This application
                      does not execute a lease or guarantee.
                    </p>
                  </div>
                ) : (
                  <p>
                    No offer has been authorised for display to you. Any proposed terms require a
                    separate, property-specific agreement; no example offer is used as a default.
                  </p>
                )}
                <Link className="button" to="?step=entity">
                  Continue to applicant entities
                </Link>
              </>
            )}
            {!['property', 'declarations', 'review'].includes(step) &&
              (!page.lead ? (
                <p>
                  Shared business information is completed by the lead. Complete your own private
                  declaration and evidence.
                </p>
              ) : !editable ? (
                <p>
                  This submission is locked. Your sealed record is retained; request an authorised
                  correction.
                </p>
              ) : (
                <Form method="post" className="rental-form" key={step}>
                  <Version page={page} intent="save" step={step} />
                  {step === 'entity' && (
                    <EntityEditor value={value} people={page.people} personId={page.personId} />
                  )}
                  {step === 'operations' && (
                    <>
                      <LongField
                        label="Business activity and background"
                        name="businessDescription"
                        value={value.businessDescription}
                        required
                      />
                      <LongField
                        label="Proposed use of the premises"
                        name="proposedUse"
                        value={value.proposedUse}
                        required
                      />
                      <div className="rental-fields">
                        {[
                          ['tradingHours', 'Proposed trading hours'],
                          ['staffCount', 'Number of staff'],
                          ['customerTraffic', 'Expected customer traffic'],
                          ['proposedCommencement', 'Proposed commencement date'],
                        ].map(([key, label]) => (
                          <TextField
                            key={key}
                            name={key}
                            label={label}
                            value={String(value[key] ?? '')}
                            type={
                              key === 'staffCount'
                                ? 'number'
                                : key === 'proposedCommencement'
                                  ? 'date'
                                  : 'text'
                            }
                            required
                          />
                        ))}
                      </div>
                      <LongField
                        label="Required licences or permits — status and needs"
                        name="licencesAndPermits"
                        value={value.licencesAndPermits}
                        required
                      />
                    </>
                  )}
                  {step === 'financial' && <FinancialFields value={value} />}
                  {step === 'references' && <ReferenceFields value={value} />}
                  {step === 'fitout' && <FitoutFields value={value} />}
                  {step === 'security' && <SecurityFields page={page} />}
                  <button className="button">Save and continue</button>
                </Form>
              ))}
            {step === 'declarations' && (
              <>
                <h2>Your own details and declarations</h2>
                <div className="rental-notice">
                  <h3>Collection notice — {page.notice.version}</h3>
                  <p>{page.notice.text}</p>
                  <p>{page.notice.providers}</p>
                  <p>
                    Recipient: {page.notice.recipient}. Retention: draft{' '}
                    {page.notice.retention.draft}, submitted {page.notice.retention.submitted},
                    withdrawn {page.notice.retention.withdrawn} days, subject to approved holds.
                    Access/correction: info@proinspect.systems.{' '}
                    <Link to="/privacy">Identified privacy policy</Link>.
                  </p>
                </div>
                {editable ? (
                  <Form method="post" className="rental-form">
                    <Version page={page} intent="declare" />
                    <input name="personVersion" type="hidden" value={page.personVersion} />
                    <input name="noticeHash" type="hidden" value={page.notice.hash} />
                    <TextField label="Full legal name" name="name" value={profile.name} required />
                    <label>
                      Verified private email
                      <input name="email" readOnly value={profile.email} />
                    </label>
                    <TextField
                      label="Telephone"
                      name="telephone"
                      value={profile.telephone}
                      required
                    />
                    <LongField
                      label="Your address"
                      name="address"
                      value={profile.address}
                      required
                    />
                    <label>
                      Identification type
                      <select
                        name="identityType"
                        defaultValue={profile.identityType || 'Not yet available'}
                      >
                        {['Not yet available', 'Driver licence', 'Passport', 'Other'].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                    <TextField
                      label="Safe identity reference (optional)"
                      name="identityReference"
                      value={profile.identityReference}
                      help="Do not enter full national identity numbers. Upload identity images only if specifically requested under the approved scope."
                    />
                    <LongField
                      label="Your authority and role in this application"
                      name="authorityStatement"
                      value={profile.authorityStatement}
                      required
                    />
                    <label className="rental-check">
                      <input name="authority" type="checkbox" value="yes" required />
                      <span>
                        I confirm my answers and authority are accurate and consent to the
                        identified application handling.
                      </span>
                    </label>
                    <label className="rental-check">
                      <input name="nonBinding" type="checkbox" value="yes" required />
                      <span>
                        I understand that submitting this application does not approve a tenancy,
                        execute a lease or create a guarantee.
                      </span>
                    </label>
                    <label className="rental-check">
                      <input name="referencePermission" type="checkbox" value="yes" />
                      <span>
                        I separately authorise contact with the referees supplied for this
                        application, solely for this assessment. No credit-check permission is
                        inferred. Accountant permission remains separate.
                      </span>
                    </label>
                    {guarantor && (
                      <label className="rental-check">
                        <input name="guaranteeConsent" type="checkbox" value="yes" required />
                        <span>
                          As a proposed guarantor, I independently consent to assessment of my
                          supplied information. Any guarantee requires separate legal review and
                          execution.
                        </span>
                      </label>
                    )}
                    <button className="button">Complete my private declaration</button>
                  </Form>
                ) : (
                  <p>Your submitted details are locked.</p>
                )}
              </>
            )}
            {['entity', 'financial', 'fitout', 'security', 'declarations'].includes(step) && (
              <EvidencePanel page={page} step={step} editable={editable} />
            )}
            {step === 'entity' && page.lead && editable && (
              <section className="rental-notice">
                <h3>Invite an additional adult participant</h3>
                <Form method="post" className="rental-form">
                  <Version page={page} intent="invite" step={step} />
                  <TextField name="name" label="Invitation name" required />
                  <TextField name="email" label="Their private email" type="email" required />
                  <label className="rental-check">
                    <input type="checkbox" name="adultConfirmed" value="yes" required />
                    <span>
                      This is an adult participant who will complete their own private details.
                    </span>
                  </label>
                  <button className="button secondary">Send private invitation</button>
                </Form>
              </section>
            )}
            {step === 'review' && (
              <>
                <h2>Application readiness</h2>
                <p>
                  Each participant sees only their private details and file records. The lead can
                  see completion statuses and shared business information.
                </p>
                <SharedReview page={page} />
                <ul>
                  {page.people.map((p: any, i: number) => (
                    <li key={p.id}>
                      {p.label || 'Participant ' + (i + 1)}
                      {p.lead ? ' (lead)' : ''}: {p.state.replaceAll('_', ' ')}
                      {page.lead && editable && !p.lead && (
                        <Form method="post">
                          <Version page={page} intent="remove-person" />
                          <input name="personId" type="hidden" value={p.id} />
                          <button className="rental-inline-button">
                            Remove participant (remove entity roles first)
                          </button>
                        </Form>
                      )}
                    </li>
                  ))}
                </ul>
                {page.lead && (
                  <>
                    <ul>
                      {page.readiness.issues.map((issue: string) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                    {page.readiness.manualReview.length > 0 && (
                      <div className="rental-notice">
                        <h3>Manual review needed</h3>
                        <ul>
                          {page.readiness.manualReview.map((issue: string) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                        <p>
                          These matters are referred for authorised review rather than automatically
                          rejected.
                        </p>
                      </div>
                    )}
                    {editable && (
                      <Form method="post">
                        <Version page={page} intent="submit" />
                        <input name="requestKey" type="hidden" value={page.requestKey} />
                        <button
                          className="button"
                          disabled={
                            !page.readiness.ready ||
                            page.people.some((p: any) => p.state !== 'ready')
                          }
                        >
                          Submit application securely
                        </button>
                      </Form>
                    )}
                    {!editable && (
                      <p role="status">
                        Current state: {page.status.replaceAll('_', ' ')}. The authorised lessor
                        makes decisions; no lease or bond is created by this workflow.
                      </p>
                    )}
                  </>
                )}
                {page.lead &&
                  !['withdrawn', 'closed', 'decision_recorded'].includes(page.status) && (
                    <Form method="post">
                      <Version page={page} intent="withdraw" />
                      <button className="rental-inline-button">Withdraw this application</button>
                    </Form>
                  )}
                {!page.lead &&
                  !['withdrawn', 'closed', 'decision_recorded'].includes(page.status) && (
                    <Form method="post">
                      <Version page={page} intent="withdraw-participation" />
                      <p>
                        Withdrawing your participation blocks further assessment and delivery of the
                        application. Retained information remains subject to the approved privacy
                        and retention process.
                      </p>
                      <button className="rental-inline-button">
                        Withdraw my participation and further assessment consent
                      </button>
                    </Form>
                  )}
                <p>
                  For private access or a correction request, use{' '}
                  <Link to="/commercial-application/recover">access recovery</Link> or contact
                  info@proinspect.systems. Submitted evidence is not silently edited.
                </p>
                <section className="rental-notice">
                  <h3>Your privacy requests</h3>
                  <ul>
                    {page.privacyRequests.map((r: any) => (
                      <li key={r.id}>
                        {r.kind} · {r.status}
                      </li>
                    ))}
                  </ul>
                  <Form method="post" className="rental-form">
                    <Version page={page} intent="privacy" />
                    <label>
                      Request type
                      <select name="kind">
                        <option value="access">Access my personal information</option>
                        <option value="correction">Correct my personal information</option>
                        <option value="erasure">Request erasure</option>
                      </select>
                    </label>
                    <LongField label="Request details (keep identity numbers out)" name="note" />
                    <button className="button secondary">Send private request</button>
                  </Form>
                  {editable && (
                    <Form method="post" className="rental-form">
                      <Version page={page} intent="correct-email" />
                      <input type="hidden" name="personVersion" value={page.personVersion} />
                      <TextField
                        name="newEmail"
                        label="Correct your own private email"
                        type="email"
                        required
                      />
                      <p>
                        All old links and sessions will be revoked. Use the new email link to
                        continue and declare again.
                      </p>
                      <button className="button secondary">Send new verified access link</button>
                    </Form>
                  )}
                </section>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
export function ErrorBoundary() {
  useRouteError();
  return (
    <section className="site section">
      <div className="site-container panel">
        <h1>Private application unavailable</h1>
        <p>
          The link may have expired, already been used, or the application may be unavailable.{' '}
          <Link to="/commercial-application/recover">Recover your own access</Link> or contact
          info@proinspect.systems for a private enquiry.
        </p>
      </div>
    </section>
  );
}
