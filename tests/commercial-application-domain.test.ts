import {
  isMarketingStylePath,
  shouldIndexPublicPage,
} from '../apps/platform/app/lib/public-routes.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COMMERCIAL_APPLICATION_VERSION,
  commercialEntity,
  validateEntityGraph,
  commercialReadiness,
  sectionSchemas,
  commercialOffer,
} from '../packages/marketing/commercial-application.ts';
const people = ['person_one', 'person_two', 'person_three'];
const base = {
  id: 'entity_one',
  legalName: 'Synthetic entity',
  address: '12 Synthetic Road, Perth',
  abn: '',
  tradingName: '',
  capacity: 'applicant',
  signatories: [people[0]],
};
const role = (entityId: string, personId: string, type: string) => ({
  entityId,
  personId,
  role: type,
  authorityEvidence: '',
});
const section = (entities: any[], roles: any[]) => ({
  version: COMMERCIAL_APPLICATION_VERSION,
  entities,
  roles,
});
test('every legal structure has its own required fields and rejects another branch’s omissions', () => {
  const branches = [
    { ...base, entityType: 'individual', personId: people[0] },
    { ...base, entityType: 'sole_trader', personId: people[0] },
    { ...base, entityType: 'company', acn: '123456789', directors: people.slice(0, 2) },
    {
      ...base,
      entityType: 'partnership',
      partners: [
        { personId: people[0], share: '50%', authority: 'Authorised partner' },
        { personId: people[1], share: '50%', authority: 'Authorised partner' },
      ],
    },
    {
      ...base,
      entityType: 'trust',
      trustType: 'Unit trust',
      trusteeEntityId: 'trustee_company',
      deedDescription: 'Approved trust deed extract',
    },
    {
      ...base,
      entityType: 'corporate_trustee',
      acn: '123456789',
      directors: [people[0]],
      trustForId: 'trust_entity',
      capacityWording: 'Synthetic Pty Ltd as trustee for Synthetic Trust',
    },
    {
      ...base,
      entityType: 'association',
      registrationBody: 'Synthetic registry',
      registrationNumber: 'SYN-123',
      officeBearers: [people[0]],
    },
    {
      ...base,
      entityType: 'other_overseas',
      country: 'Example country',
      registrationBody: 'Example registry',
      registrationNumber: 'SYN-456',
      australianPresence: 'Proposed Australian office',
      representativeId: people[0],
    },
    {
      ...base,
      entityType: 'joint',
      partyIds: ['party_one', 'party_two'],
      liabilityArrangement: 'Subject to separate legal review',
    },
  ];
  for (const branch of branches)
    assert.equal(commercialEntity.safeParse(branch).success, true, branch.entityType);
  assert.equal(commercialEntity.safeParse({ ...base, entityType: 'company' }).success, false);
  assert.equal(commercialEntity.safeParse({ ...base, entityType: 'trust' }).success, false);
  assert.equal(
    commercialEntity.safeParse({
      ...base,
      entityType: 'company',
      acn: '123',
      directors: [people[0]],
    }).success,
    false,
  );
});
test('trust and corporate trustee use one person profile with multiple explicit roles', () => {
  const trust = {
    ...base,
    id: 'trust_entity',
    entityType: 'trust',
    trustType: 'Unit trust',
    trusteeEntityId: 'trustee_company',
    deedDescription: 'Approved trust deed extract',
  };
  const company = {
    ...base,
    id: 'trustee_company',
    capacity: 'trustee',
    entityType: 'corporate_trustee',
    acn: '123456789',
    directors: [people[0]],
    trustForId: trust.id,
    capacityWording: 'Synthetic Pty Ltd as trustee for Synthetic Trust',
  };
  const roles = [
    role(trust.id, people[0], 'signatory'),
    role(company.id, people[0], 'signatory'),
    role(company.id, people[0], 'director'),
    role(company.id, people[0], 'trustee_officer'),
  ];
  assert.equal(validateEntityGraph(section([trust, company], roles), people).entities.length, 2);
  assert.throws(
    () =>
      validateEntityGraph(
        section([trust, { ...company, trustForId: 'unknown_trust' }], roles),
        people,
      ),
    /mismatch|required/,
  );
  assert.throws(
    () => validateEntityGraph(section([trust, company], [...roles, roles[0]]), people),
    /Duplicate role/,
  );
  assert.throws(
    () => validateEntityGraph(section([trust, company], roles), ['stranger']),
    /Unknown/,
  );
});
test('joint graphs reject cycles and cross-application participant references', () => {
  const one = {
    ...base,
    id: 'joint_one',
    entityType: 'joint',
    partyIds: ['joint_two', 'party_three'],
    liabilityArrangement: 'Subject to legal review',
  };
  const two = { ...one, id: 'joint_two', partyIds: ['joint_one', 'party_three'] };
  const three = { ...base, id: 'party_three', entityType: 'individual', personId: people[0] };
  assert.throws(
    () =>
      validateEntityGraph(
        section(
          [one, two, three],
          [one, two, three].map((e) => role(e.id, people[0], 'signatory')),
        ),
        people,
      ),
    /Cyclic/,
  );
  assert.throws(
    () =>
      validateEntityGraph(
        section([three], [role(three.id, 'foreign_person', 'signatory')]),
        people,
      ),
    /Unknown/,
  );
});
test('financial alternatives require reasons and remain a manual review path', () => {
  assert.equal(
    sectionSchemas.financial.safeParse({
      historyYears: 0,
      basQuarters: 0,
      unavailableReason: 'Newly established company',
      alternativeEvidence: 'Forecast and financial support evidence',
    }).success,
    true,
  );
  assert.equal(
    sectionSchemas.financial.safeParse({
      historyYears: 0,
      basQuarters: 0,
      unavailableReason: '',
      alternativeEvidence: '',
    }).success,
    false,
  );
  const result = commercialReadiness(
    {
      financial: {
        historyYears: 0,
        basQuarters: 0,
        unavailableReason: 'Newly established company',
        alternativeEvidence: 'Forecast and financial support evidence',
      },
    },
    people,
    [],
    'required',
  );
  assert.ok(result.manualReview.length > 0);
  assert.ok(result.issues.includes('Add the described alternative evidence'));
  assert.ok(result.issues.some((s) => s.includes('guarantor')));
});
test('accountant permission needs a separate purpose and future expiry', () => {
  const ref = {
    name: 'Synthetic Accountant',
    organisation: 'Synthetic Practice',
    contact: 'accountant@example.invalid',
    relationship: 'Accountant',
  };
  const data = {
    previousLandlord: null,
    noLandlordReason: 'New business',
    tradeReferences: [ref, ref],
    accountant: ref,
    accountantPermission: {
      granted: true,
      scope: 'Confirm only these business statements',
      expiresAt: '2099-01-01T00:00:00Z',
    },
  };
  assert.equal(sectionSchemas.references.safeParse(data).success, true);
  assert.equal(
    sectionSchemas.references.safeParse({
      ...data,
      accountantPermission: { ...data.accountantPermission, expiresAt: '2020-01-01T00:00:00Z' },
    }).success,
    false,
  );
  assert.equal(sectionSchemas.references.safeParse({ ...data, accountant: null }).success, false);
});
test('offers cannot infer a rent period or apply a generic property’s terms', () => {
  assert.equal(
    commercialOffer.safeParse({
      rent: { amountCents: 3600000, currency: 'AUD', taxTreatment: 'ex_gst' },
    }).success,
    false,
  );
  const source =
    readFileSync('apps/marketing/app/routes/commercial-start.tsx', 'utf8') +
    readFileSync('packages/marketing/commercial-application.ts', 'utf8');
  assert.doesNotMatch(source, /111 Medina|25,200|19\.85|\$7,000|\$2,500/);
});
test('new commercial intake remains independent and disabled in every deployed environment', async () => {
  const config = JSON.parse(readFileSync('apps/platform/wrangler.jsonc', 'utf8'));
  for (const vars of [config.vars, config.env.staging.vars, config.env.connected.vars]) {
    for (const key of [
      'COMMERCIAL_APPLICATIONS_ENABLED',
      'COMMERCIAL_APPLICATION_SCANNER_ENABLED',
      'COMMERCIAL_APPLICATION_HANDOFF_ENABLED',
    ])
      assert.equal(vars[key], 'false');
  }
});

test('commercial private routes use existing application styling and stay unindexed', () => {
  for (const path of [
    '/commercial-application/session',
    '/commercial-application/recover',
    '/commercial-application/' + 'a'.repeat(64),
    '/commercial-application/recipient/' + 'b'.repeat(64),
    '/properties-for-lease/commercial/synthetic/apply',
  ]) {
    assert.equal(isMarketingStylePath(path), true, path);
    assert.equal(
      shouldIndexPublicPage(path, 'https://proinspect.systems', 'production'),
      false,
      path,
    );
  }
});
