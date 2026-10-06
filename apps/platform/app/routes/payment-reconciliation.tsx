import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace, workspaceApi } from '../lib/workspace';
import { PageHeading, EmptyState } from '../../../../packages/ui/components';
import { OperationForm, Input, Panel } from '../components/OperationForm';
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  return (await loadApi(
    request,
    context,
    `${workspaceApi(params.kind!, params.scopeId!)}/payment-reconciliation`,
  )) as { items: Record<string, any>[] };
}
export default function PaymentReconciliation() {
  const d = useLoaderData<typeof loader>(),
    w = useWorkspace().workspace;
  return (
    <>
      <PageHeading
        title="Payment reconciliation"
        description="Provider events requiring review. Recording an outcome does not charge or refund money."
      />
      <div className="stack">
        {d.items.length ? (
          d.items.map((r) => (
            <Panel key={r.id} title={r.description} description={r.code.replaceAll('_', ' ')}>
              <p>Payment {r.payment_id}</p>
              <OperationForm
                endpoint={`${workspaceApi(w.kind, w.scopeId)}/payment-reconciliation/${r.id}`}
                label="Record verified resolution"
              >
                <Input name="reference" label="Verified external outcome and reference" />
              </OperationForm>
            </Panel>
          ))
        ) : (
          <EmptyState
            title="No payment exceptions"
            description="Conflicting provider outcomes will appear here for authorised review."
          />
        )}
      </div>
    </>
  );
}
