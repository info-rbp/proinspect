import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace, workspaceApi } from '../lib/workspace';
import { PageHeading, Badge } from '../../../../packages/ui/components';
import {
  OperationForm,
  Input,
  TextArea,
  Panel,
  Select,
  choices,
  options,
} from '../components/OperationForm';
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const base = `/api/w/${params.kind}/${params.scopeId}/tenancies/${params.tenancyId}`;
  return {
    detail: await loadApi(request, context, base),
    forms: await loadApi(request, context, base + '/forms'),
  } as any;
}
export default function TenancyDetail() {
  const data = useLoaderData<typeof loader>(),
    d = useWorkspace(),
    w = d.workspace,
    api = workspaceApi(w.kind, w.scopeId),
    t = data.detail.tenancy,
    tenant = w.kind === 'tenant',
    next: Record<string, string> = {
      draft: 'submitted',
      submitted: 'under_review',
      under_review: 'ready',
      ready: 'recorded',
    };
  return (
    <>
      <PageHeading
        title={d.properties.find((p) => p.id === t.property_id)?.address ?? 'Tenancy'}
        description="Manage the tenancy record, inspection publication, PCR responses and reviewed documents. Recording a notice does not itself prove legal service."
      />
      <div className="stack">
        <Panel title="Tenancy record">
          <Badge status={t.status} />
          <p>
            Start: {t.starts_at} | End: {t.ends_at || 'Ongoing'}
          </p>
          {data.detail.members.map((m: any) => (
            <p key={m.id}>
              {m.display_name || m.email} |{' '}
              {m.ends_at ? 'Past relationship' : 'Active relationship'}
            </p>
          ))}
          {!tenant && t.status === 'active' && (
            <OperationForm
              endpoint={`${api}/tenancies/${t.id}`}
              defaults={{ version: t.version }}
              label="Update tenancy record"
            >
              <Select
                name="status"
                label="Recorded tenancy status"
                options={choices(['active', 'ended'])}
              />
              <Input name="endsAt" type="datetime-local" label="End date" required={false} />
              <Input name="bondReference" label="External bond reference" required={false} />
              <Input
                name="rentCents"
                label="Recorded rent (cents)"
                type="number"
                required={false}
              />
              <Input name="reference" label="Supporting record reference" />
            </OperationForm>
          )}
        </Panel>
        {!tenant && t.status === 'active' && (
          <div className="grid-2">
            <Panel title="Invite another tenant">
              <OperationForm
                endpoint={`${api}/tenancies/${t.id}/invite`}
                label="Send tenancy invitation"
              >
                <Input name="email" label="Tenant email" type="email" />
              </OperationForm>
            </Panel>
            <Panel
              title="Publish inspection information"
              description="Check notice requirements and retain the actual notice/service reference before publishing."
            >
              <OperationForm
                endpoint={`${api}/inspections/publish`}
                defaults={{ tenancyId: t.id }}
                label="Publish to tenancy"
              >
                <Select
                  name="bookingId"
                  label="Confirmed property booking"
                  options={options(
                    d.bookings.filter(
                      (b) => b.property_id === t.property_id && b.status === 'confirmed',
                    ),
                    'reference',
                  )}
                />
                <Input name="noticeReference" label="Notice / service reference" />
              </OperationForm>
            </Panel>
          </div>
        )}
        <Panel title="Property condition report responses">
          {data.detail.pcrResponses.map((p: any) => (
            <div className="record-row" key={p.id}>
              <div>
                <p className="preserve-lines">{p.response}</p>
                <p>{p.acceptCondition ? 'Condition accepted' : 'Changes or comments supplied'}</p>
              </div>
              <Badge status={p.status} />
              {!tenant && p.status === 'submitted' && (
                <OperationForm
                  endpoint={`${api}/pcr-responses/${p.id}/acknowledge`}
                  label="Acknowledge response"
                />
              )}
            </div>
          ))}
          {tenant && (
            <OperationForm endpoint={`${api}/pcr-responses`} label="Submit PCR response">
              <Select
                name="documentId"
                label="Issued property condition report"
                options={options(
                  d.documents.filter(
                    (x) => x.category === 'property_condition_report' && x.status === 'issued',
                  ),
                  'title',
                )}
              />
              <Select
                name="acceptCondition"
                label="Your response"
                options={[
                  { value: 'true', label: 'I accept the recorded condition' },
                  { value: 'false', label: 'I have changes or comments' },
                ]}
              />
              <TextArea name="response" label="Response / itemised comments" />
            </OperationForm>
          )}
        </Panel>
        <Panel
          title="Forms and bond coordination"
          description="This workflow collects instructions and tracks reviewed official documents. It does not generate a substitute prescribed form, lodge a bond, terminate a tenancy or serve a notice automatically."
        >
          <OperationForm
            endpoint={`${api}/forms`}
            defaults={{ tenancyId: t.id }}
            label="Create draft instructions"
          >
            <Select
              name="formCode"
              label="Workflow"
              options={data.forms.definitions
                .filter((f: any) => !tenant || f.audience !== 'manager')
                .map((f: any) => ({ value: f.code, label: f.name }))}
            />
            <TextArea name="details" label="Instructions and relevant details" />
          </OperationForm>
          {data.forms.forms.map((f: any) => (
            <details key={f.id}>
              <summary>
                {data.forms.definitions.find((x: any) => x.code === f.form_code)?.name} - {f.status}
              </summary>
              <p className="preserve-lines">{f.answers.details}</p>
              {next[f.status] && (!tenant || f.status === 'draft') && (
                <OperationForm
                  endpoint={`${api}/forms/${f.id}`}
                  defaults={{ version: f.version, status: next[f.status] }}
                  label={`Record ${next[f.status].replaceAll('_', ' ')}`}
                >
                  {f.status === 'under_review' && (
                    <Select
                      name="documentId"
                      label="Reviewed official PDF already issued to this tenancy"
                      options={options(
                        d.documents.filter(
                          (doc) => doc.tenancy_id === t.id && doc.status === 'issued',
                        ),
                        'title',
                      )}
                    />
                  )}
                  {f.status === 'ready' && (
                    <Input name="reference" label="Actual service / lodgement reference" />
                  )}
                </OperationForm>
              )}
            </details>
          ))}
        </Panel>
        {d.restrictedEnabled && tenant && (
          <Link to={`${w.href}/confidential`}>
            Confidential assistance - separate restricted workspace
          </Link>
        )}
      </div>
    </>
  );
}
