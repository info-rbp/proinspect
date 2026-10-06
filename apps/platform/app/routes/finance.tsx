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
const money = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n / 100);
export default function Finance() {
  const d = useWorkspace(),
    w = d.workspace,
    api = workspaceApi(w.kind, w.scopeId),
    staff = w.kind === 'staff',
    council = w.kind === 'council',
    staffWrite = staff && ['administrator', 'operations_manager'].includes(d.user.staffRole ?? ''),
    financialAdmin = ['owner', 'admin'].includes(w.role),
    canDecide = (a: any) =>
      a.decision_scope === 'council'
        ? staffWrite
        : a.decision_scope === 'named_user'
          ? a.target_user_id === d.user.id
          : !staff && financialAdmin && a.client_id === w.scopeId;
  return (
    <>
      <PageHeading
        title={council ? 'Decisions and oversight' : 'Approvals and payments'}
        description={
          council
            ? 'Record your recommendation against an operational proposal. This is not a statutory vote or a unilateral instruction to proceed.'
            : 'Review costs in context. Only the authorised decision-maker can approve work; recorded payments and payment collection are separate actions.'
        }
      />
      <div className="stack">
        {d.approvals.map((a) => (
          <Panel
            key={a.id}
            title={a.summary}
            description={`${money(a.amount_cents)} | ${a.work_title ?? a.work_order_id}`}
          >
            <Badge status={a.status} />
            <p>Decision pathway: {a.decision_scope.replaceAll('_', ' ')}</p>
            {a.status === 'pending' &&
              (council ? (
                <OperationForm
                  endpoint={`${api}/approvals/${a.id}/response`}
                  label="Record recommendation"
                >
                  <Select
                    name="response"
                    label="Recommendation"
                    options={choices(['support', 'oppose', 'information'])}
                  />
                  <TextArea name="comment" label="Comments" required={false} />
                </OperationForm>
              ) : canDecide(a) ? (
                <OperationForm
                  endpoint={`${api}/approvals/${a.id}/decision`}
                  defaults={{ version: a.version }}
                  label={
                    a.decision_scope === 'council'
                      ? 'Record authorised council outcome'
                      : 'Record decision'
                  }
                >
                  <Select
                    name="decision"
                    label="Decision"
                    options={choices(['approved', 'declined', 'changes_requested'])}
                  />
                  <TextArea name="comment" label="Decision comments" required={false} />
                  <Input
                    name="reference"
                    label="Authority / external decision reference"
                    required={a.decision_scope === 'council'}
                  />
                </OperationForm>
              ) : (
                <p>
                  This proposal is awaiting its authorised decision-maker. Recommendations do not
                  authorise work.
                </p>
              ))}
          </Panel>
        ))}
        {!council && (
          <Panel title="Payments">
            {d.payments.map((p) => (
              <div className="stack payment-record" key={p.id}>
                <div className="record-row">
                  <div>
                    <strong>{p.description}</strong>
                    <p>{money(p.total_cents)}</p>
                  </div>
                  <Badge status={p.status} />
                </div>
                {!staff &&
                  w.role !== 'viewer' &&
                  ['pending', 'payment_required', 'failed'].includes(p.status) && (
                    <OperationForm
                      endpoint={`${api}/payments/${p.id}/checkout`}
                      label="Prepare secure payment"
                      result={(r) =>
                        r.url ? (
                          <a className="button" href={r.url} rel="noreferrer">
                            Continue to secure checkout
                          </a>
                        ) : null
                      }
                    />
                  )}
                {staffWrite && p.provider === 'manual' && (
                  <OperationForm
                    endpoint={`${api}/payments/${p.id}/record`}
                    defaults={{ version: p.version }}
                    label="Record external payment outcome"
                  >
                    <Select
                      name="status"
                      label="Recorded outcome"
                      options={choices(['paid', 'failed', 'refunded', 'waived'])}
                    />
                    <Input name="reference" label="Verified transaction or adjustment reference" />
                  </OperationForm>
                )}
              </div>
            ))}
          </Panel>
        )}
        {staffWrite && (
          <Panel
            title="Create payment record"
            description="Amounts are cents in AUD. This creates a ledger entry, not a charge or a refund."
          >
            <OperationForm endpoint={`${api}/payments`} label="Create payment">
              <Select
                name="workOrderId"
                label="Work order"
                options={options(d.workOrders, 'title')}
              />
              <Input type="number" name="amountExGstCents" label="Amount excluding GST (cents)" />
              <Input type="number" name="gstCents" label="GST (cents)" />
              <Input name="description" label="Invoice description" />
              <Input type="datetime-local" name="dueAt" label="Due date" required={false} />
            </OperationForm>
          </Panel>
        )}
        {(staffWrite ||
          (['property-manager', 'strata-manager'].includes(w.kind) && w.role !== 'viewer')) && (
          <Panel
            title="Prepare a cost proposal"
            description="Authority limits determine whether the client, verified owner or council outcome is required."
          >
            {d.workOrders
              .filter((o) =>
                ['triage', 'quote_required', 'approved', 'scheduled', 'assigned'].includes(
                  o.status,
                ),
              )
              .map((o) => (
                <details key={o.id}>
                  <summary>
                    {o.reference} - {o.title}
                  </summary>
                  <OperationForm
                    endpoint={`${api}/work-orders/${o.id}/proposals`}
                    defaults={{ version: o.version }}
                    label="Request approval"
                  >
                    <Input name="summary" label="Proposal summary" />
                    <Input type="number" name="amountCents" label="Total proposal (cents)" />
                    <Input name="reference" label="Quote / scope reference" />
                    <Input
                      name="targetUserId"
                      label="Verified owner approver ID (only when required)"
                      required={false}
                    />
                  </OperationForm>
                </details>
              ))}
          </Panel>
        )}
      </div>
    </>
  );
}
