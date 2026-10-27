import { OperationForm, Input, TextArea, Select, choices } from './OperationForm';
import { moneyAUD } from '../../../../packages/finance/export';

type RecordRow = Record<string, any>;
function Decision({
  base,
  command,
  idName,
  row,
  leaseId,
}: {
  base: string;
  command: string;
  idName: string;
  row: RecordRow;
  leaseId: string;
}) {
  return (
    <OperationForm
      endpoint={base + '/' + command}
      label="Record independent decision"
      defaults={{ leaseId, [idName]: row.id }}
    >
      <Select name="decision" label="Decision" options={choices(['approved', 'rejected'])} />
      <Input
        name="reference"
        label="Independent review evidence reference (at least 8 characters)"
      />
    </OperationForm>
  );
}
export function CommercialLifecycle({
  lease: l,
  base,
  staff,
}: {
  lease: RecordRow;
  base: string;
  staff: boolean;
}) {
  const docs = l.sourceDocuments.map((d: RecordRow) => ({
    value: d.id,
    label: d.title + ' / v' + d.version,
  }));
  const work = l.workOrders.map((d: RecordRow) => ({
    value: d.id,
    label: d.reference + ' / ' + d.status,
  }));
  const ruleOptions = l.rules
    .filter((r: RecordRow) => r.status === 'approved')
    .map((r: RecordRow) => ({
      value: r.id,
      label:
        r.rule.obligationKey +
        ' / ' +
        r.rule.category +
        ' / ' +
        r.rule.basisFrom +
        ' / ' +
        moneyAUD(r.rule.sourceAmountCents),
    }));
  const originalCharges = l.charges
    .filter((r: RecordRow) => r.status === 'approved' && !r.adjusts_charge_id)
    .map((r: RecordRow) => ({
      value: r.id,
      label:
        r.source_reference + ' / ' + r.calculation.periodFrom + ' / ' + moneyAUD(r.total_cents),
    }));
  const evidence = (name = 'sourceDocumentId', label = 'Issued source evidence') => (
    <Select name={name} label={label} options={docs} />
  );
  return (
    <div className="stack">
      {l.historyTruncated && (
        <p role="status">
          This view shows the most recent 200 records in each history. Ledger totals include every
          approved record; exports do not silently truncate.
        </p>
      )}
      {l.signals.map((text: string) => (
        <p key={text} role="status">
          Review required: {text}
        </p>
      ))}
      <details>
        <summary>Lease source versions and option windows</summary>
        <div className="stack">
          <p>
            Original register dates remain unchanged. A reviewed source records terms and external
            notice evidence; it does not execute a lease, serve a notice or exercise an option.
          </p>
          {l.currentTerms && (
            <p>
              Effective recorded terms: {l.currentTerms.startsAt} to {l.currentTerms.endsAt} /{' '}
              {l.currentTerms.kind}.
            </p>
          )}
          <OperationForm
            endpoint={base + '/revision'}
            label="Submit source revision for review"
            defaults={{ leaseId: l.id, version: l.version }}
          >
            <Select
              name="kind"
              label="Source action"
              options={choices(
                l.approvedHeadId ? ['variation', 'renewal', 'expiry'] : ['commencement'],
              )}
            />
            <Input name="effectiveAt" type="datetime-local" label="Source effective date" />
            <Input name="startsAt" type="datetime-local" label="Recorded commencement" />
            <Input name="endsAt" type="datetime-local" label="Recorded expiry" />
            <Input
              name="optionOpensAt"
              type="datetime-local"
              label="Option window opens (both boundaries or neither)"
              required={false}
            />
            <Input
              name="optionClosesAt"
              type="datetime-local"
              label="Option window closes"
              required={false}
            />
            {evidence()}
            <Input name="sourceReference" label="Source clause / agreement reference" />
            <TextArea name="premises" label="Source description of the premises" />
            <TextArea name="parties" label="Source lessor and occupier identities" />
            <Input
              name="noticeReference"
              label="External notice / execution evidence, or explicit source-backed non-applicability"
            />
            <TextArea name="details" label="Terms, source review and changes" />
          </OperationForm>
          {l.revisions.map((r: RecordRow) => (
            <section className="panel stack" key={r.id}>
              <h3>
                {r.kind} / {r.status}
              </h3>
              <p>
                {r.source_reference} / source version {r.base_version} / effective {r.effective_at}
              </p>
              <p>
                {r.starts_at} to {r.ends_at}
              </p>
              {r.option_opens_at && (
                <p>
                  Option window: {r.option_opens_at} to {r.option_closes_at}
                </p>
              )}
              <p>{r.details.premises}</p>
              <p>{r.details.parties}</p>
              <p>{r.details.text}</p>
              <p>Notice evidence: {r.details.noticeReference}</p>
              {staff && r.status === 'pending' && (
                <Decision
                  base={base}
                  command="review-revision"
                  idName="revisionId"
                  row={r}
                  leaseId={l.id}
                />
              )}
            </section>
          ))}
        </div>
      </details>
      <details>
        <summary>Reviewed financial source rules</summary>
        <div className="stack">
          <p>
            Every amount, frequency, tax basis, proration method, review factor and cap must come
            from the source. There are no inferred rents, tax rates or automatic bank instructions.
            Periods are Perth calendar dates with exclusive end dates.
          </p>
          <OperationForm
            endpoint={base + '/rule'}
            label="Submit source financial rule"
            defaults={{ leaseId: l.id }}
          >
            <Select
              name="revisionId"
              label="Approved lease source"
              options={l.revisions
                .filter((r: RecordRow) => r.status === 'approved' && r.kind !== 'expiry')
                .map((r: RecordRow) => ({
                  value: r.id,
                  label: r.kind + ' / ' + r.source_reference,
                }))}
            />
            <Input
              name="obligationKey"
              label="Stable source obligation key (letters, digits, underscore or hyphen)"
            />
            <Select name="category" label="Category" options={choices(l.chargeCategories)} />
            <Input name="sourceAmountCents" type="number" label="Source amount in cents" />
            <Select
              name="taxBasis"
              label="Source amount tax basis"
              options={choices(['inclusive', 'exclusive'])}
            />
            <Input
              name="gstBasisPoints"
              type="number"
              label="Approved GST rate in basis points (1000 = 10%; explicitly enter 0 where applicable)"
            />
            <Select
              name="frequency"
              label="Source frequency"
              options={choices(['once', 'monthly', 'quarterly', 'annual', 'other'])}
            />
            <Input name="basisFrom" type="date" label="Full source period starts" />
            <Input name="basisTo" type="date" label="Full source period ends (exclusive)" />
            <Select
              name="method"
              label="Approved partial-period method"
              options={choices(['fixed', 'actual_days'])}
            />
            <Select
              name="reviewMethod"
              label="Approved rent / charge review method"
              options={choices(['none', 'percentage', 'index'])}
            />
            <Input
              name="reviewBasisPoints"
              type="number"
              label="Percentage change in basis points (percentage reviews only)"
              required={false}
            />
            <Input
              name="indexNumerator"
              type="number"
              label="Approved new index (index reviews only)"
              required={false}
            />
            <Input
              name="indexDenominator"
              type="number"
              label="Approved base index (index reviews only)"
              required={false}
            />
            <Input
              name="floorCents"
              type="number"
              label="Source floor in cents, same tax basis (optional)"
              required={false}
            />
            <Input
              name="capCents"
              type="number"
              label="Source cap in cents, same tax basis (optional)"
              required={false}
            />
            {evidence()}
            <Input name="sourceReference" label="Financial clause / approval source reference" />
            <TextArea
              name="details"
              label="Approved assumptions, frequency, review and cap clauses"
            />
          </OperationForm>
          {l.rules.map((r: RecordRow) => (
            <section className="panel stack" key={r.id}>
              <h3>
                {r.rule.obligationKey} / {r.status}
              </h3>
              <p>
                {r.rule.category} / {r.rule.frequency} / {moneyAUD(r.rule.sourceAmountCents)}{' '}
                {r.rule.taxBasis} tax / {r.rule.gstBasisPoints} basis points
              </p>
              <p>
                {r.rule.basisFrom} to {r.rule.basisTo} (exclusive); {r.rule.method}; review{' '}
                {r.rule.reviewMethod}
              </p>
              <p>{r.details.text}</p>
              <p>
                Immutable source hash: <code>{r.rule_sha256}</code>
              </p>
              {staff && r.status === 'pending' && (
                <Decision
                  base={base}
                  command="review-rule"
                  idName="ruleId"
                  row={r}
                  leaseId={l.id}
                />
              )}
            </section>
          ))}
        </div>
      </details>
      <details>
        <summary>Charge allocations, corrections and control totals</summary>
        <div className="stack">
          <p>
            Approved operational ledger in AUD: subtotal {moneyAUD(l.ledgerTotals.subtotalCents)},
            GST {moneyAUD(l.ledgerTotals.gstCents)}, total {moneyAUD(l.ledgerTotals.totalCents)}.
            This is not a tax invoice and does not collect rent, bonds or other money.
          </p>
          <OperationForm
            endpoint={base + '/charge'}
            label="Submit allocation or immutable adjustment"
            defaults={{ leaseId: l.id }}
          >
            <Select
              name="mode"
              label="Operation"
              options={choices(['allocate', 'recalculate', 'reverse'])}
            />
            <Select
              name="ruleId"
              label="Approved source rule (not required for a full reversal)"
              options={ruleOptions}
              optional
            />
            <Select
              name="adjustsChargeId"
              label="Original approved charge (corrections only)"
              options={originalCharges}
              optional
            />
            <Input
              name="periodFrom"
              type="date"
              label="Allocation starts (required for a new allocation)"
              required={false}
            />
            <Input
              name="periodTo"
              type="date"
              label="Allocation ends, exclusive"
              required={false}
            />
            {evidence()}
            <Input name="sourceReference" label="Allocation / correction source reference" />
          </OperationForm>
          {l.charges.map((r: RecordRow) => (
            <section className="panel stack" key={r.id}>
              <h3>
                {r.calculation.mode} / {r.status} / {moneyAUD(r.total_cents)}
              </h3>
              <p>
                {r.source_reference}: {r.calculation.periodFrom} to {r.calculation.periodTo}{' '}
                (exclusive)
              </p>
              <p>
                Subtotal {moneyAUD(r.subtotal_cents)} + GST {moneyAUD(r.gst_cents)}.{' '}
                {r.adjusts_charge_id
                  ? 'Original charge: ' + r.adjusts_charge_id
                  : 'Original allocation retained.'}
              </p>
              <p>
                Calculation hash: <code>{r.calculation_sha256}</code>
              </p>
              {staff && r.status === 'pending' && (
                <Decision
                  base={base}
                  command="review-charge"
                  idName="chargeId"
                  row={r}
                  leaseId={l.id}
                />
              )}
            </section>
          ))}
          <form method="get" action={base + '/ledger/' + l.id} className="stack">
            <Input name="from" type="date" label="Ledger export starts" />
            <Input
              name="to"
              type="date"
              label="Ledger export ends (exclusive; complete allocations only)"
            />
            <button type="submit" className="button">
              Export reviewed ledger and control totals
            </button>
          </form>
        </div>
      </details>
      <details>
        <summary>Make-good, compliance and reopened obligations</summary>
        <div className="stack">
          <OperationForm
            endpoint={base + '/obligation-case'}
            label="Submit obligation case for independent review"
            defaults={{ leaseId: l.id }}
          >
            <Select
              name="taskId"
              label="Task"
              options={l.tasks.map((r: RecordRow) => ({
                value: r.id,
                label: r.title + ' / ' + r.status + ' / version ' + r.version,
              }))}
            />
            <Input name="version" type="number" label="Current task version shown above" />
            <Select
              name="kind"
              label="Case action"
              options={choices(['assessment', 'completion', 'cancellation', 'reopening'])}
            />
            {evidence()}
            <Select
              name="conditionDocumentId"
              label="Issued condition / final report (required for completion)"
              options={docs}
              optional
            />
            <Select
              name="workOrderId"
              label="Related canonical quoted / instructed work"
              options={work}
              optional
            />
            <Select
              name="responsibility"
              label="Source-backed responsibility decision"
              options={choices(['lessor', 'occupier', 'shared', 'undetermined'])}
            />
            <TextArea
              name="observations"
              label="Inspection observations, scope, responsibility reasons and requested resolution"
            />
            <Input
              name="quotationReference"
              label="Quotation evidence (supply together with amount)"
              required={false}
            />
            <Input
              name="quotedCents"
              type="number"
              label="Quoted amount in cents"
              required={false}
            />
            <Input name="sourceReference" label="Source / decision reference" />
            <Input name="newTitle" label="Successor task title (reopening only)" required={false} />
            <Input
              name="newDueAt"
              type="datetime-local"
              label="Successor due date from source (reopening only)"
              required={false}
            />
          </OperationForm>
          {l.obligationCases.map((r: RecordRow) => (
            <section className="panel stack" key={r.id}>
              <h3>
                {r.kind} / {r.status}
              </h3>
              <p>
                Task {r.task_id} / version {r.task_version}; responsibility {r.responsibility}
              </p>
              <p>{r.details.observations}</p>
              {r.details.quotedCents !== null && (
                <p>
                  Quotation {r.details.quotationReference}: {moneyAUD(r.details.quotedCents)}
                </p>
              )}
              <p>{r.source_reference}</p>
              {staff && r.status === 'pending' && (
                <Decision
                  base={base}
                  command="review-obligation"
                  idName="caseId"
                  row={r}
                  leaseId={l.id}
                />
              )}
            </section>
          ))}
        </div>
      </details>
      <details>
        <summary>Source, option and dispute exceptions</summary>
        <div className="stack">
          <OperationForm
            endpoint={base + '/exception'}
            label="Record a visible exception"
            defaults={{ leaseId: l.id }}
          >
            <Select name="kind" label="Exception type" options={choices(l.exceptionKinds)} />
            <Select
              name="chargeId"
              label="Disputed charge, where applicable"
              options={l.charges.map((r: RecordRow) => ({
                value: r.id,
                label: r.source_reference + ' / ' + r.status,
              }))}
              optional
            />
            <Select
              name="taskId"
              label="Disputed task, where applicable"
              options={l.tasks.map((r: RecordRow) => ({ value: r.id, label: r.title }))}
              optional
            />
            <Input name="sourceReference" label="Exception evidence reference" />
            <TextArea
              name="details"
              label="Missed date, missing source, changed terms or dispute details"
            />
          </OperationForm>
          {l.exceptions.map((r: RecordRow) => (
            <section className="panel stack" key={r.id}>
              <h3>
                {r.kind} / {r.status}
              </h3>
              <p>{r.details.text}</p>
              <p>{r.source_reference}</p>
              {r.assignment && (
                <p>
                  Owner {r.assignment.owner_id}; priority {r.assignment.priority}; assignment
                  evidence {r.assignment.reference}
                </p>
              )}
              {staff && r.status === 'open' && (
                <>
                  <OperationForm
                    endpoint={base + '/assign-exception'}
                    label="Assign or escalate exception"
                    defaults={{ leaseId: l.id, exceptionId: r.id }}
                  >
                    <Input name="ownerId" label="Active verified operations owner ID" />
                    <Select
                      name="priority"
                      label="Priority"
                      options={choices(['routine', 'high', 'urgent'])}
                    />
                    <Input name="reference" label="Assignment / escalation reason reference" />
                  </OperationForm>
                  <OperationForm
                    endpoint={base + '/resolve-exception'}
                    label="Record independent evidence-backed resolution"
                    defaults={{ leaseId: l.id, exceptionId: r.id }}
                  >
                    {evidence('resolutionDocumentId', 'Issued resolution evidence')}
                    <Input name="reference" label="Resolution decision reference" />
                  </OperationForm>
                </>
              )}
            </section>
          ))}
        </div>
      </details>
    </div>
  );
}
