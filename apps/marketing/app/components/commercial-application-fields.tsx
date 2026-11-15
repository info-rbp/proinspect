import { useState } from 'react';
import {
  COMMERCIAL_APPLICATION_VERSION,
  ENTITY_TYPES,
  type CommercialEntity,
} from '../../../../packages/marketing/commercial-application';
export function TextField({
  label,
  name,
  value = '',
  required = false,
  type = 'text',
  help,
}: {
  label: string;
  name: string;
  value?: string;
  required?: boolean;
  type?: string;
  help?: string;
}) {
  return (
    <label className="rental-field">
      {label}
      <input
        aria-label={label}
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        maxLength={1200}
      />
      {help && <small>{help}</small>}
    </label>
  );
}
export function LongField({
  label,
  name,
  value = '',
  required = false,
}: {
  label: string;
  name: string;
  value?: string;
  required?: boolean;
}) {
  return (
    <label className="rental-field wide">
      {label}
      <textarea name={name} defaultValue={value} required={required} rows={3} maxLength={1200} />
    </label>
  );
}
type Person = { id: string; label?: string; lead?: number; state: string };
const labels: Record<string, string> = {
  individual: 'Individual',
  sole_trader: 'Sole trader',
  company: 'Australian company',
  partnership: 'Partnership',
  trust: 'Trust',
  corporate_trustee: 'Corporate trustee',
  association: 'Incorporated association / not-for-profit',
  other_overseas: 'Other / overseas entity',
  joint: 'Joint applicants / consortium',
};
const words: Record<string, string> = {
  legalName: 'Legal name',
  address: 'Registered or principal address',
  abn: 'ABN (11 digits, if held)',
  acn: 'ACN (9 digits)',
  tradingName: 'Trading name (if applicable)',
  trustType: 'Trust type',
  deedDescription: 'Trust deed / authority evidence available',
  capacityWording: 'Legal capacity wording (company as trustee for trust)',
  registrationBody: 'Registration authority',
  registrationNumber: 'Registration number',
  country: 'Country of registration',
  australianPresence: 'Australian presence and representative authority',
  liabilityArrangement: 'Proposed liability arrangement — subject to legal review',
};
function blankEntity(type: string, id: string) {
  const base = {
    id,
    entityType: type,
    legalName: '',
    address: '',
    abn: '',
    tradingName: '',
    capacity: 'applicant',
    signatories: [],
  };
  const detail: Record<string, Record<string, unknown>> = {
    individual: { personId: '' },
    sole_trader: { personId: '' },
    company: { acn: '', directors: [] },
    partnership: {
      partners: [
        { personId: '', share: '', authority: '' },
        { personId: '', share: '', authority: '' },
      ],
    },
    trust: { trustType: '', trusteeEntityId: '', deedDescription: '' },
    corporate_trustee: { acn: '', directors: [], trustForId: '', capacityWording: '' },
    association: { registrationBody: '', registrationNumber: '', officeBearers: [] },
    other_overseas: {
      country: '',
      registrationBody: '',
      registrationNumber: '',
      australianPresence: '',
      representativeId: '',
    },
    joint: { partyIds: [], liabilityArrangement: '' },
  };
  return { ...base, ...detail[type], guarantors: [] } as Record<string, any>;
}
export function MultiPeople({
  label,
  value,
  onChange,
  people,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  people: Person[];
}) {
  return (
    <label className="rental-field">
      {label}
      <select
        aria-label={label}
        multiple
        value={value}
        onChange={(e) => onChange(Array.from(e.target.selectedOptions, (o) => o.value))}
      >
        {people.map((p, i) => (
          <option value={p.id} key={p.id}>
            {p.label || 'Participant ' + (i + 1)}
            {p.lead ? ' (lead)' : ''}
          </option>
        ))}
      </select>
      <small>Select every relevant participant. The same person can hold several roles.</small>
    </label>
  );
}
export function EntityEditor({
  value,
  people,
  personId,
}: {
  value: any;
  people: Person[];
  personId: string;
}) {
  const [entities, setEntities] = useState<Array<Record<string, any>>>(() =>
    (value?.entities?.length
      ? value.entities
      : [blankEntity('individual', 'cent_' + personId)]
    ).map((e: CommercialEntity) => ({
      ...e,
      guarantors:
        value?.roles
          ?.filter((r: any) => r.entityId === e.id && r.role === 'guarantor')
          .map((r: any) => r.personId) || [],
    })),
  );
  const update = (index: number, key: string, field: unknown) =>
    setEntities((rows) => rows.map((row, i) => (i === index ? { ...row, [key]: field } : row)));
  const roles = entities.flatMap((e) => [
    ...e.signatories.map((personId: string) => ({
      personId,
      entityId: e.id,
      role: 'signatory',
      authorityEvidence: '',
    })),
    ...(e.directors || []).flatMap((personId: string) => [
      { personId, entityId: e.id, role: 'director', authorityEvidence: '' },
      ...(e.entityType === 'corporate_trustee'
        ? [{ personId, entityId: e.id, role: 'trustee_officer', authorityEvidence: '' }]
        : []),
    ]),
    ...(e.partners || [])
      .filter((p: any) => p.personId)
      .map((p: any) => ({
        personId: p.personId,
        entityId: e.id,
        role: 'partner',
        authorityEvidence: p.authority,
      })),
    ...(e.officeBearers || []).map((personId: string) => ({
      personId,
      entityId: e.id,
      role: 'trustee_officer',
      authorityEvidence: '',
    })),
    ...(e.guarantors || []).map((personId: string) => ({
      personId,
      entityId: e.id,
      role: 'guarantor',
      authorityEvidence: '',
    })),
  ]);
  return (
    <div className="stack">
      <input
        type="hidden"
        name="entity"
        value={JSON.stringify({ version: COMMERCIAL_APPLICATION_VERSION, entities, roles })}
      />
      <p>
        Invite any additional directors, partners, signatories or guarantors first, then select them
        below. Each person uses their own private link and can hold several roles.
      </p>
      {entities.map((e, index) => (
        <fieldset key={e.id}>
          <legend>Legal entity {index + 1}</legend>
          <div className="rental-fields">
            <label className="rental-field">
              Legal structure
              <select
                aria-label="Legal structure"
                value={e.entityType}
                onChange={(event) => {
                  const next = blankEntity(event.target.value, e.id);
                  for (const k of [
                    'legalName',
                    'address',
                    'abn',
                    'tradingName',
                    'capacity',
                    'signatories',
                  ])
                    next[k] = e[k];
                  setEntities((rows) => rows.map((row, i) => (i === index ? next : row)));
                }}
              >
                {ENTITY_TYPES.map((t) => (
                  <option value={t} key={t}>
                    {labels[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="rental-field">
              Entity’s role
              <select
                aria-label="Entity’s role"
                value={e.capacity}
                onChange={(event) => update(index, 'capacity', event.target.value)}
              >
                <option value="applicant">Applicant</option>
                <option value="trustee">Trustee</option>
                <option value="guarantor">Guarantor</option>
              </select>
            </label>
            {[
              'legalName',
              'address',
              'abn',
              'tradingName',
              ...Object.keys(words).filter(
                (k) => k in e && !['legalName', 'address', 'abn', 'tradingName'].includes(k),
              ),
            ].map((key) => (
              <label className="rental-field" key={key}>
                {words[key]}
                <input
                  aria-label={words[key]}
                  value={e[key] || ''}
                  maxLength={key === 'abn' ? 11 : key === 'acn' ? 9 : 1200}
                  onChange={(event) => update(index, key, event.target.value)}
                  required={[
                    'legalName',
                    'address',
                    'acn',
                    'trustType',
                    'registrationBody',
                    'registrationNumber',
                    'country',
                    'australianPresence',
                    'liabilityArrangement',
                    'deedDescription',
                    'capacityWording',
                  ].includes(key)}
                />
              </label>
            ))}
            {['personId', 'representativeId']
              .filter((k) => k in e)
              .map((key) => (
                <label className="rental-field" key={key}>
                  {key === 'personId' ? 'Individual applicant' : 'Australian representative'}
                  <select
                    aria-label={
                      key === 'personId'
                        ? 'Individual applicant'
                        : key === 'representativeId'
                          ? 'Australian representative'
                          : key === 'trusteeEntityId'
                            ? 'Legal trustee'
                            : 'Trust represented'
                    }
                    value={e[key]}
                    required
                    onChange={(event) => update(index, key, event.target.value)}
                  >
                    <option value="">Choose a participant</option>
                    {people.map((p, i) => (
                      <option value={p.id} key={p.id}>
                        {p.label || 'Participant ' + (i + 1)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            {['trusteeEntityId', 'trustForId']
              .filter((k) => k in e)
              .map((key) => (
                <label className="rental-field" key={key}>
                  {key === 'trusteeEntityId' ? 'Legal trustee' : 'Trust represented'}
                  <select
                    aria-label={
                      key === 'personId'
                        ? 'Individual applicant'
                        : key === 'representativeId'
                          ? 'Australian representative'
                          : key === 'trusteeEntityId'
                            ? 'Legal trustee'
                            : 'Trust represented'
                    }
                    value={e[key]}
                    required
                    onChange={(event) => update(index, key, event.target.value)}
                  >
                    <option value="">Choose an added entity</option>
                    {entities
                      .filter(
                        (x) => x.id !== e.id && (key !== 'trustForId' || x.entityType === 'trust'),
                      )
                      .map((x, i) => (
                        <option value={x.id} key={x.id}>
                          {x.legalName || 'Entity ' + (i + 1)}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
            <MultiPeople
              label="Authorised signatories"
              value={e.signatories}
              people={people}
              onChange={(v) => update(index, 'signatories', v)}
            />
            {'directors' in e && (
              <MultiPeople
                label="Directors"
                value={e.directors}
                people={people}
                onChange={(v) => update(index, 'directors', v)}
              />
            )}
            {'officeBearers' in e && (
              <MultiPeople
                label="Governing office bearers"
                value={e.officeBearers}
                people={people}
                onChange={(v) => update(index, 'officeBearers', v)}
              />
            )}
            <MultiPeople
              label="Guarantor participants (only when applicable)"
              value={e.guarantors}
              people={people}
              onChange={(v) => update(index, 'guarantors', v)}
            />
            {'partyIds' in e && (
              <label className="rental-field">
                Joint applicant parties
                <select
                  aria-label="Joint applicant parties"
                  multiple
                  value={e.partyIds}
                  onChange={(event) =>
                    update(
                      index,
                      'partyIds',
                      Array.from(event.target.selectedOptions, (o) => o.value),
                    )
                  }
                >
                  {entities
                    .filter((x) => x.id !== e.id)
                    .map((x) => (
                      <option value={x.id} key={x.id}>
                        {x.legalName || 'Additional entity'}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>
          {e.entityType === 'partnership' && (
            <div className="stack">
              <h3>Partners</h3>
              {e.partners.map((p: any, i: number) => (
                <div className="rental-fields" key={i}>
                  <label>
                    Partner
                    <select
                      required
                      value={p.personId}
                      onChange={(event) =>
                        update(
                          index,
                          'partners',
                          e.partners.map((v: any, j: number) =>
                            i === j ? { ...v, personId: event.target.value } : v,
                          ),
                        )
                      }
                    >
                      <option value="">Choose participant</option>
                      {people.map((person, j) => (
                        <option key={person.id} value={person.id}>
                          {person.label || 'Participant ' + (j + 1)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {['share', 'authority'].map((key) => (
                    <label key={key}>
                      {key === 'share' ? 'Share or role' : 'Authority to bind the partnership'}
                      <input
                        required
                        value={p[key]}
                        onChange={(event) =>
                          update(
                            index,
                            'partners',
                            e.partners.map((v: any, j: number) =>
                              i === j ? { ...v, [key]: event.target.value } : v,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
              ))}
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  update(index, 'partners', [
                    ...e.partners,
                    { personId: '', share: '', authority: '' },
                  ])
                }
              >
                Add partner
              </button>
            </div>
          )}
          {entities.length > 1 && (
            <button
              className="rental-inline-button"
              type="button"
              onClick={() => setEntities(entities.filter((_, i) => i !== index))}
            >
              Remove entity
            </button>
          )}
        </fieldset>
      ))}
      <button
        type="button"
        className="button secondary"
        onClick={() =>
          setEntities([...entities, blankEntity('company', 'cent_' + crypto.randomUUID())])
        }
      >
        Add applicant, trustee or guarantor entity
      </button>
    </div>
  );
}
export function ReferenceEditor({ value }: { value: any }) {
  const blank = () => ({ name: '', organisation: '', contact: '', relationship: '' });
  const [trades, setTrades] = useState<Array<Record<string, string>>>(
    value?.tradeReferences || [blank(), blank()],
  );
  return (
    <div className="stack">
      <input type="hidden" name="tradeReferences" value={JSON.stringify(trades)} />
      {trades.map((row, index) => (
        <fieldset key={index}>
          <legend>Trade / business referee {index + 1}</legend>
          <div className="rental-fields">
            {Object.keys(row).map((key) => (
              <label key={key}>
                {key === 'contact'
                  ? 'Email or telephone'
                  : key.charAt(0).toUpperCase() + key.slice(1)}
                <input
                  required={key !== 'organisation'}
                  maxLength={240}
                  value={row[key]}
                  onChange={(event) =>
                    setTrades(
                      trades.map((r, i) => (i === index ? { ...r, [key]: event.target.value } : r)),
                    )
                  }
                />
              </label>
            ))}
          </div>
          {index >= 2 && (
            <button
              type="button"
              className="rental-inline-button"
              onClick={() => setTrades(trades.filter((_, i) => i !== index))}
            >
              Remove referee
            </button>
          )}
        </fieldset>
      ))}
      {trades.length < 10 && (
        <button
          type="button"
          className="button secondary"
          onClick={() => setTrades([...trades, blank()])}
        >
          Add trade referee
        </button>
      )}
    </div>
  );
}
