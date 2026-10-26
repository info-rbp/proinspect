import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace, workspaceApi } from '../lib/workspace';
import { PageHeading, Badge } from '../../../../packages/ui/components';
import { OperationForm, Input, Panel, Select, choices, TextArea, options } from '../components/OperationForm';
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const base=`/api/w/${params.kind}/${params.scopeId}/confidential`;
  const [detail, listing]=await Promise.all([
    loadApi(request,context,`${base}/${params.caseId}`),
    loadApi(request,context,base),
  ]);
  return {...detail,reviewers:listing.reviewers} as any;
}
export default function ConfidentialCase() {
  const c = useLoaderData<typeof loader>(),
    d = useWorkspace(),
    api = workspaceApi(d.workspace.kind, d.workspace.scopeId);
  return (
    <>
      <PageHeading
        title="Confidential case"
        description="Access to this page is recorded in the restricted case audit only."
      >
        <a className="button secondary" href="/workspaces">
          Leave this page
        </a>
      </PageHeading>
      <div className="stack">
        <Panel title="Case information">
          <Badge status={c.status} />
          <p className="preserve-lines">{c.details.details}</p>
          <p>Safe contact: {c.details.safeContact || 'Not specified'}</p>
        </Panel>
        <Panel title="WA Form 2 — restricted manual preparation"
          description="This is not an official completed form, legal-service record or automatic bond payout. Preparation and independent review use the official WA Form 2; confidential evidence remains in this restricted workspace.">
          <p><a target="_blank" rel="noopener noreferrer" href="https://www.consumerprotection.wa.gov.au/rental-forms-and-notices">Current WA Consumer Protection Form 2 and evidence guidance</a></p>
          <p>A tenant can instruct additional approved reviewers individually. No co-tenant, landlord, property manager or ordinary Staff workspace receives this case automatically.</p>
          {c.applicant&&<OperationForm endpoint={`${api}/confidential/${c.id}/reviewers`} label="Grant another reviewer explicit access">
            <Select name="reviewerId" label="Approved confidential reviewer" options={options(c.reviewers,'display_name')}/>
            <label><input type="checkbox" name="confirmExplicitAccess" required/>I expressly authorise this reviewer to access my restricted case and its evidence.</label>
          </OperationForm>}
          {!c.applicant&&c.status==='under_review'&&<OperationForm endpoint={`${api}/confidential/${c.id}/form2-preparations`} label="Save encrypted Form 2 preparation worksheet">
            <Input name="officialEdition" label="Edition verified against the current official WA Form 2"/>
            <Input name="plannedNoticeDate" label="Proposed notice date (not a service date)" type="date"/>
            <TextArea name="servicePlan" label="Confidential manual notice and safe-contact plan (not sent)"/>
            <label><input type="checkbox" name="noAutomaticService" required/>I understand that this is a confidential worksheet only. No notice is served and no evidence is disclosed by saving it.</label>
          </OperationForm>}
          {c.form2Preparations?.map((p:any)=><div className="record-row" key={p.id}><div>
            <strong>Form 2 preparation</strong><p className="small">Prepared {p.created_at}</p>
            <p>{p.outcome?`Independent reviewer: ${p.outcome.replaceAll('_',' ')}`:'Independent review pending'}</p>
          </div>{!c.applicant&&c.status==='under_review'&&!p.outcome&&p.prepared_by!==d.user.id&&<OperationForm endpoint={`${api}/confidential/${c.id}/form2-preparations/${p.id}/review`} label="Record independent manual review">
            <Select name="outcome" label="Review finding" options={choices(['reviewed_for_manual_handling','requires_revision'])}/>
            <label><input type="checkbox" name="officialFormChecked" required/>I checked the current official form version independently.</label>
            <label><input type="checkbox" name="noAutomaticService" required/>No notice, evidence, or funds are sent by this review.</label>
          </OperationForm>}</div>)}
          <p className="small">Sensitive details are intentionally omitted from general notification and audit queues. Official form execution and legal service must occur through a separately approved process.</p>
        </Panel>
        <Panel title="Supporting evidence">
          {c.evidence.map((e: any) => (
            <p key={e.id}>
              <a href={`${api}/confidential-evidence/${e.id}/download`}>
                Download authorised evidence
              </a>{' '}
              | {e.created_at}
            </p>
          ))}
          {c.applicant && (
            <OperationForm
              endpoint={`${api}/confidential/${c.id}/evidence`}
              multipart
              label="Add encrypted evidence"
            >
              <Input name="file" label="PDF, JPEG or PNG (up to 2 MB)" type="file" />
            </OperationForm>
          )}
        </Panel>
        {c.status !== 'closed' && (!c.applicant || c.status === 'draft') && (
          <Panel title="Case progress">
            <OperationForm
              endpoint={`${api}/confidential/${c.id}`}
              defaults={{ version: c.version }}
              label="Update confidential case"
            >
              <Select
                name="status"
                label="Next step"
                options={choices(c.applicant ? ['submitted'] : ['under_review', 'closed'])}
              />
            </OperationForm>
          </Panel>
        )}
      </div>
    </>
  );
}
