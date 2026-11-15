import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { createServer, type Server } from 'node:http';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
let server: Server;
const folder = 'artifacts/commercial-wizard-review',
  origin = 'http://127.0.0.1:5193';
test.beforeAll(async () => {
  mkdirSync(folder, { recursive: true });
  const fixture = {
    reference: 'COM-SYNTHETIC',
    status: 'in_progress',
    version: 1,
    personVersion: 1,
    personId: 'cap_synthetic_lead',
    lead: true,
    requestKey: '11111111-1111-4111-8111-111111111111',
    profile: {
      name: 'Synthetic Lead',
      email: 'lead@example.invalid',
      telephone: '0400000000',
      address: 'Synthetic private address',
      identityType: 'Not yet available',
      authorityStatement: 'Synthetic authority statement for interface testing.',
    },
    shared: {
      entity: {
        version: 'proinspect-commercial-application-v1',
        entities: [
          {
            id: 'cent_ui_company',
            entityType: 'company',
            legalName: 'Synthetic Company Pty Ltd',
            address: 'Synthetic business address',
            abn: '',
            acn: '123456789',
            tradingName: '',
            capacity: 'applicant',
            directors: ['cap_synthetic_lead'],
            signatories: ['cap_synthetic_lead'],
          },
        ],
        roles: [
          {
            personId: 'cap_synthetic_lead',
            entityId: 'cent_ui_company',
            role: 'director',
            authorityEvidence: '',
          },
          {
            personId: 'cap_synthetic_lead',
            entityId: 'cent_ui_company',
            role: 'signatory',
            authorityEvidence: '',
          },
        ],
      },
    },
    people: [
      { id: 'cap_synthetic_lead', label: 'You', lead: 1, state: 'in_progress' },
      { id: 'cap_synthetic_other', label: 'Synthetic Participant', lead: 0, state: 'invited' },
    ],
    documents: [],
    readiness: { ready: false, issues: ['Complete financial evidence'], manualReview: [] },
    offer: null,
    notice: {
      hash: '0'.repeat(64),
      version: 'synthetic-privacy',
      text: 'Synthetic approved notice for interface testing only.',
      providers: 'Synthetic providers only.',
      recipient: 'Synthetic Lessor',
      retention: { draft: 30, submitted: 180, withdrawn: 30 },
    },
    informationRequests: [],
    privacyRequests: [],
    property: {
      title: 'Synthetic premises',
      address: '12 Synthetic Avenue',
      suburb: 'Perth',
      postcode: '6000',
    },
    guarantee: 'required',
    securityRequirements: 'Synthetic guarantee assessment only.',
    requiredPersonalEvidence: [],
  };
  const entry = resolve(folder, 'entry.tsx');
  writeFileSync(
    entry,
    `import React from 'react';import {createRoot} from 'react-dom/client';import {createMemoryRouter,RouterProvider} from 'react-router';import '../../packages/ui/styles.css';import Application from '../../apps/marketing/app/routes/commercial-application';const fixture=${JSON.stringify(fixture)};const router=createMemoryRouter([{path:'/commercial-application/:token',element:<Application/>,loader:()=>fixture,action:async()=>({error:'Synthetic interface fixture; no data is sent.'})}],{initialEntries:['/commercial-application/session?step=entity']});createRoot(document.getElementById('root')!).render(<RouterProvider router={router}/>);`,
  );
  await build({
    entryPoints: [entry],
    outfile: resolve(folder, 'wizard.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    plugins: [
      {
        name: 'exclude-private-server-code',
        setup(b) {
          b.onLoad({ filter: /styles\.css$/ }, (args) => ({
            contents: readFileSync(args.path, 'utf8').replace(
              /@import ['\"]tailwindcss['\"];?/,
              '',
            ),
            loader: 'css',
          }));
          b.onResolve({ filter: /\.server$/ }, (args) => ({
            path: resolve(dirname(args.importer), args.path + '.ts'),
            namespace: 'synthetic-server',
            sideEffects: false,
          }));
          b.onLoad({ filter: /.*/, namespace: 'synthetic-server' }, (args) => {
            const source = readFileSync(args.path, 'utf8'),
              names = [
                ...source.matchAll(
                  /export\s+(?:async\s+)?function\s+(\w+)|export\s+const\s+(\w+)/g,
                ),
              ].map((m) => m[1] || m[2]);
            return {
              contents: names
                .map(
                  (n) =>
                    'export const ' +
                    n +
                    '=()=>{throw Error("Private backend excluded from UI fixture")};',
                )
                .join('\n'),
              loader: 'js',
            };
          });
        },
      },
    ],
  });
  server = createServer((req, res) => {
    if (req.url === '/wizard.js' || req.url === '/wizard.css') {
      res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript');
      res.end(readFileSync(resolve(folder, req.url.slice(1))));
      return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(
      '<!doctype html><html lang="en-AU"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/wizard.css"></head><body><main class="site"><div id="root"></div></main><script type="module" src="/wizard.js"></script></body></html>',
    );
  });
  await new Promise<void>((done) => server.listen(5193, '127.0.0.1', done));
});
test.afterAll(async () => {
  if (server) await new Promise<void>((done) => server.close(() => done()));
});
test('commercial entity selector shows only the relevant legal branch and reuses people across roles', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Applicant entities');
  const type = page.getByLabel('Legal structure', { exact: true });
  for (const [value, label] of [
    ['individual', 'Individual applicant'],
    ['sole_trader', 'Individual applicant'],
    ['company', 'ACN (9 digits)'],
    ['partnership', 'Authority to bind the partnership'],
    ['trust', 'Legal trustee'],
    ['corporate_trustee', 'Trust represented'],
    ['association', 'Registration number'],
    ['other_overseas', 'Country of registration'],
    ['joint', 'Joint applicant parties'],
  ]) {
    await type.selectOption(value);
    await expect(page.getByLabel(label, { exact: true }).first()).toBeVisible();
    if (value === 'trust')
      await expect(page.getByLabel('ACN (9 digits)', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: folder + '/' + value + '-desktop.png', fullPage: true });
  }
  await type.selectOption('company');
  await page
    .getByLabel('Authorised signatories', { exact: true })
    .selectOption(['cap_synthetic_lead']);
  await page
    .getByLabel('Directors', { exact: true })
    .selectOption(['cap_synthetic_lead', 'cap_synthetic_other']);
  const entity = JSON.parse(await page.locator('input[name="entity"]').inputValue());
  expect(
    entity.roles
      .filter((r: any) => r.personId === 'cap_synthetic_lead')
      .map((r: any) => r.role)
      .sort(),
  ).toEqual(['director', 'signatory']);
  expect(new Set(entity.roles.map((r: any) => r.personId)).size).toBe(2);
  expect(errors).toEqual([]);
});
test('all nine commercial steps retain the current responsive application styling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin);
  const names = [
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
  for (const name of names) {
    await page
      .getByRole('navigation', { name: 'Commercial application sections' })
      .getByRole('link', { name: new RegExp(name) })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(
      true,
    );
    await page.screenshot({
      path: folder + '/' + name.toLowerCase().replaceAll(' ', '-') + '-mobile.png',
      fullPage: true,
    });
  }
  await expect(page.getByRole('button', { name: 'Submit application securely' })).toBeDisabled();
});
