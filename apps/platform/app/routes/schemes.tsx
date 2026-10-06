import { Link } from 'react-router';
import { useWorkspace, workspaceApi } from '../lib/workspace';
import { PageHeading } from '../../../../packages/ui/components';
import { OperationForm, Input, Panel } from '../components/OperationForm';
export default function Schemes() {
  const d = useWorkspace(),
    w = d.workspace,
    api = workspaceApi(w.kind, w.scopeId);
  return (
    <>
      <PageHeading
        title={
          w.kind === 'building'
            ? 'My building'
            : w.kind === 'council'
              ? 'My council workspace'
              : 'Schemes and buildings'
        }
        description="A shared scheme record connects common property, lots, authorised people and operational history."
      />
      <div className="stack">
        <div className="grid-2">
          {d.schemes.map((s) => (
            <Panel key={s.id} title={s.name} description={`Scheme ${s.scheme_number}`}>
              <p>
                {
                  d.requests.filter(
                    (r) => r.scheme_id === s.id && !['completed', 'closed'].includes(r.status),
                  ).length
                }{' '}
                open issues
              </p>
              <Link className="button secondary" to={`${w.href}/schemes/${s.id}`}>
                Open scheme workspace
              </Link>
            </Panel>
          ))}
        </div>
        {w.kind === 'strata-manager' && ['owner', 'admin'].includes(w.role) && (
          <Panel
            title="Set up a managed scheme"
            description="Initial spending authority is zero until verified by ProInspect. Existing schemes require a relationship handover review."
          >
            <OperationForm
              endpoint={`${api}/schemes`}
              label="Create scheme"
              redirect={(r) => `${w.href}/schemes/${r.id}`}
            >
              <div className="grid-2">
                <Input name="name" label="Scheme name" />
                <Input name="schemeNumber" label="Scheme number" />
                <Input name="address" label="Primary building address" />
                <Input name="suburb" label="Suburb" />
                <Input name="postcode" label="Postcode" />
              </div>
              <Input name="authorityReference" label="Management authority reference" />
              <Input type="datetime-local" name="validUntil" label="Management authority expires" />
            </OperationForm>
          </Panel>
        )}
      </div>
    </>
  );
}
