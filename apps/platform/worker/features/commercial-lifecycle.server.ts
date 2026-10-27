import { z } from 'zod';
import {
  assert,
  AppError,
  statement,
  uid,
  now,
  type Env,
} from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { operationsWrite } from '../../../../packages/authorization/server';
import { seal, unseal, digest } from '../../../../packages/auth/crypto';
import {
  recordId,
  isoDate,
  dateOnly,
  version,
  guard,
  clearGuard,
  activity,
  replay,
  receipt,
} from '../../../../packages/operations/core';
import {
  CommercialRuleError,
  calculateReviewedCharge,
  validateLeaseTransition,
  type LeaseTerms,
  type ChargeRule,
} from '../../../../packages/commercial/calculations';
import { leaseAccess, issuedEvidence, event } from './commercial-scope.server';

const evidence = z.string().trim().min(8).max(500),
  notes = z.string().trim().min(10).max(6000);
const categories = ['rent', 'outgoings', 'insurance', 'make_good', 'other'] as const;
const exceptionKinds = [
  'missed_option',
  'overlapping_options',
  'missing_document',
  'changed_terms',
  'disputed_charge',
  'disputed_task',
  'other',
] as const;
const commands = new Set([
  'revision',
  'review-revision',
  'rule',
  'review-rule',
  'charge',
  'review-charge',
  'obligation-case',
  'review-obligation',
  'exception',
  'resolve-exception',
  'assign-exception',
]);
const ruleSchema = z
  .object({
    obligationKey: recordId,
    category: z.enum(categories),
    frequency: z.enum(['once', 'monthly', 'quarterly', 'annual', 'other']),
    sourceAmountCents: z.number().int().min(0).max(1e12),
    gstBasisPoints: z.number().int().min(0).max(10000),
    taxBasis: z.enum(['inclusive', 'exclusive']),
    method: z.enum(['fixed', 'actual_days']),
    basisFrom: dateOnly,
    basisTo: dateOnly,
    reviewMethod: z.enum(['none', 'percentage', 'index']),
    reviewBasisPoints: z.number().int().min(-10000).max(100000).optional(),
    indexNumerator: z.number().int().positive().max(1e9).optional(),
    indexDenominator: z.number().int().positive().max(1e9).optional(),
    floorCents: z.number().int().min(0).max(1e12).optional(),
    capCents: z.number().int().min(0).max(1e12).optional(),
  })
  .superRefine((r, c) => {
    if (r.reviewMethod !== 'percentage' && r.reviewBasisPoints !== undefined)
      c.addIssue({
        code: 'custom',
        message: 'Percentage inputs only apply to percentage reviews.',
      });
    if (
      r.reviewMethod !== 'index' &&
      (r.indexNumerator !== undefined || r.indexDenominator !== undefined)
    )
      c.addIssue({ code: 'custom', message: 'Index inputs only apply to index reviews.' });
  });
type Row = Record<string, any>;
function terms(r: Row): LeaseTerms {
  return {
    kind: r.kind,
    effectiveAt: r.effective_at,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    optionOpensAt: r.option_opens_at,
    optionClosesAt: r.option_closes_at,
  };
}
function domain<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof CommercialRuleError) throw new AppError(422, e.code, e.message);
    throw e;
  }
}
async function head(env: Env, leaseId: string) {
  return statement(
    env.DB,
    "SELECT * FROM commercial_lease_revisions WHERE lease_id=? AND status='approved' ORDER BY base_version DESC LIMIT 1",
    leaseId,
  ).first<Row>();
}
async function balance(env: Env, id: string) {
  const original = await statement(
    env.DB,
    "SELECT subtotal_cents,gst_cents,total_cents FROM commercial_lease_charges WHERE id=? AND status='approved' AND adjusts_charge_id IS NULL",
    id,
  ).first<Row>();
  assert(
    original,
    409,
    'ORIGINAL_CHARGE_REQUIRED',
    'Choose an approved original charge, not another adjustment.',
  );
  const adjustments = await statement(
    env.DB,
    "SELECT COALESCE(sum(subtotal_cents),0) AS subtotal,COALESCE(sum(gst_cents),0) AS gst,COALESCE(sum(total_cents),0) AS total FROM commercial_lease_charges WHERE adjusts_charge_id=? AND status='approved'",
    id,
  ).first<Row>();
  return {
    subtotalCents: original.subtotal_cents + adjustments!.subtotal,
    gstCents: original.gst_cents + adjustments!.gst,
    totalCents: original.total_cents + adjustments!.total,
  };
}
function reviewer(user: Principal, w: Workspace, row: Row) {
  assert(w.kind === 'staff', 403, 'STAFF_REVIEW_REQUIRED', 'Review through the Staff workspace.');
  operationsWrite(user);
  assert(
    row.status === 'pending',
    409,
    'REVIEW_ALREADY_DECIDED',
    'This immutable decision has already been recorded.',
  );
  assert(
    row.created_by !== user.id,
    403,
    'INDEPENDENT_REVIEW',
    'A different authorised operations reviewer must decide this proposal.',
  );
}
async function rulePeriod(env: Env, l: Row, r: Row, from: string, to: string) {
  const revision = await statement(
    env.DB,
    'SELECT base_version,effective_at FROM commercial_lease_revisions WHERE id=? AND lease_id=?',
    r.revision_id,
    l.id,
  ).first<Row>();
  assert(revision, 409, 'REVISION_MISSING', 'The approved rule source is unavailable.');
  const perthDate = (value: string) =>
    new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 10);
  assert(
    from >= perthDate(revision.effective_at),
    422,
    'RULE_NOT_EFFECTIVE',
    'The allocation starts before this source revision takes effect in Perth.',
  );
  const later = (
    await statement(
      env.DB,
      "SELECT effective_at FROM commercial_lease_revisions WHERE lease_id=? AND status='approved' AND base_version>?",
      l.id,
      revision.base_version,
    ).all<Row>()
  ).results;
  assert(
    !later.some((v) => perthDate(v.effective_at) < to),
    409,
    'SOURCE_PERIOD_CHANGED',
    'A later approved source affects this allocation. Split the period at the amendment and use the corresponding reviewed rules.',
  );
}
async function approvedRule(env: Env, l: Row, id: string) {
  const r = await statement(
    env.DB,
    "SELECT * FROM commercial_charge_rules WHERE id=? AND lease_id=? AND status='approved'",
    id,
    l.id,
  ).first<Row>();
  assert(
    r,
    409,
    'APPROVED_RULE_REQUIRED',
    'Choose an independently approved source rule for this lease.',
  );
  await issuedEvidence(env, l, r.source_document_id);
  const rev = await statement(
    env.DB,
    "SELECT source_document_id FROM commercial_lease_revisions WHERE id=? AND lease_id=? AND status='approved'",
    r.revision_id,
    l.id,
  ).first<Row>();
  assert(rev, 409, 'APPROVED_REVISION_REQUIRED', 'The lease source has not been approved.');
  await issuedEvidence(env, l, rev.source_document_id);
  assert(
    (await digest(r.rule_json)) === r.rule_sha256,
    409,
    'RULE_HASH_MISMATCH',
    'The immutable rule snapshot does not match its evidence hash.',
  );
  return { ...r, rule: ruleSchema.parse(JSON.parse(r.rule_json)) };
}

export async function commercialLifecycleCommand(
  env: Env,
  user: Principal,
  w: Workspace,
  command: string,
  input: unknown,
): Promise<Row | null> {
  if (!commands.has(command)) return null;
  const common = z
    .object({ leaseId: recordId, requestKey: z.string().min(16).max(100) })
    .parse(input);
  const l = await leaseAccess(env, user, w, common.leaseId, true),
    action = 'commercial.' + command;
  const prior = await replay(env, user, action, common.requestKey, input);
  if (prior.result) return { ...prior.result, replayed: true };
  const get = async (table: string, id: string) => {
    const r = await statement(
      env.DB,
      `SELECT * FROM ${table} WHERE id=? AND lease_id=?`,
      id,
      l.id,
    ).first<Row>();
    assert(r, 404, 'COMMERCIAL_RECORD_NOT_FOUND', 'The record is not available in this lease.');
    return r;
  };
  const commit = async (steps: D1PreparedStatement[], result: Row, ref: string) => {
    try {
      await env.DB.batch([
        ...steps,
        event(env, user, l.id, null, command, ref),
        activity(env, user, action, 'commercial_lease', l.id, l.property_id, null, {
          recordId: result.id,
        }),
        receipt(env, user, action, common.requestKey, prior.fingerprint, result),
        clearGuard(env),
      ]);
    } catch (error) {
      if (
        error instanceof Error &&
        /COMMERCIAL_|REVISION_|RULE_|CHARGE_|OBLIGATION_|CONDITION_DOCUMENT_|TASK_|EXCEPTION_|mutation_guards|action_receipts/.test(
          error.message,
        )
      )
        throw new AppError(
          409,
          'COMMERCIAL_STATE_CHANGED',
          'The source, authority, allocation or review state changed. Reload and review the existing record before retrying.',
        );
      throw error;
    }
    return result;
  };
  const reviewUpdate = (table: string, r: Row, decision: string, ref: string) =>
    statement(
      env.DB,
      `UPDATE ${table} SET status=?,reviewed_by=?,reviewed_at=?,review_reference=? WHERE id=? AND status='pending'`,
      decision,
      user.id,
      now(),
      ref,
      r.id,
    );
  if (command === 'revision') {
    assert(
      l.status === 'active',
      409,
      'LEASE_REGISTER_CLOSED',
      'The closed register preserves its source history. Record a new authorised lease rather than rewriting a closed source.',
    );
    const d = z
      .object({
        version,
        kind: z.enum(['commencement', 'variation', 'renewal', 'expiry']),
        effectiveAt: isoDate,
        startsAt: isoDate,
        endsAt: isoDate,
        optionOpensAt: isoDate.optional(),
        optionClosesAt: isoDate.optional(),
        sourceDocumentId: recordId,
        sourceReference: evidence,
        premises: notes,
        parties: notes,
        noticeReference: evidence,
        details: notes,
      })
      .parse(input);
    assert(l.version === d.version, 409, 'LEASE_CHANGED', 'Reload the current lease version.');
    await issuedEvidence(env, l, d.sourceDocumentId);
    const previous = await head(env, l.id);
    domain(() => validateLeaseTransition(d, previous ? terms(previous) : null));
    const id = uid('clv');
    return commit(
      [
        statement(
          env.DB,
          'INSERT INTO commercial_lease_revisions(id,lease_id,base_version,previous_revision_id,kind,effective_at,starts_at,ends_at,option_opens_at,option_closes_at,source_document_id,source_reference,terms_envelope,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          id,
          l.id,
          l.version,
          previous?.id ?? null,
          d.kind,
          d.effectiveAt,
          d.startsAt,
          d.endsAt,
          d.optionOpensAt ?? null,
          d.optionClosesAt ?? null,
          d.sourceDocumentId,
          d.sourceReference,
          await seal(env.DATA_ENCRYPTION_KEY, 'commercial-revision:' + id, {
            premises: d.premises,
            parties: d.parties,
            noticeReference: d.noticeReference,
            text: d.details,
          }),
          user.id,
          now(),
        ),
      ],
      { id, status: 'pending' },
      d.sourceReference,
    );
  }
  if (command === 'review-revision') {
    const d = z
        .object({
          revisionId: recordId,
          decision: z.enum(['approved', 'rejected']),
          reference: evidence,
        })
        .parse(input),
      r = await get('commercial_lease_revisions', d.revisionId);
    reviewer(user, w, r);
    if (d.decision === 'approved') {
      assert(
        l.version === r.base_version,
        409,
        'LEASE_CHANGED',
        'The proposal is based on a superseded lease version. Reject it and propose a new source-backed revision.',
      );
      await issuedEvidence(env, l, r.source_document_id);
      const previous = await head(env, l.id);
      domain(() => validateLeaseTransition(terms(r), previous ? terms(previous) : null));
      if (r.option_opens_at)
        assert(
          !(await statement(
            env.DB,
            "SELECT id FROM commercial_lease_revisions WHERE lease_id=? AND id!=? AND status='pending' AND option_opens_at<? AND option_closes_at>? LIMIT 1",
            l.id,
            r.id,
            r.option_closes_at,
            r.option_opens_at,
          ).first()),
          409,
          'OPTION_WINDOW_CONFLICT',
          'Reject superseded overlapping option proposals before approving this source.',
        );
      assert(
        !(await statement(
          env.DB,
          "SELECT id FROM commercial_lease_exceptions WHERE lease_id=? AND status='open' AND kind IN('missing_document','changed_terms','overlapping_options') LIMIT 1",
          l.id,
        ).first()),
        409,
        'LEASE_EXCEPTION_OPEN',
        'Resolve material source or option-window exceptions before approving changed terms.',
      );
    }
    return commit(
      [reviewUpdate('commercial_lease_revisions', r, d.decision, d.reference), guard(env)],
      { id: r.id, status: d.decision },
      d.reference,
    );
  }
  if (command === 'rule') {
    const d = z
        .object({
          revisionId: recordId,
          sourceDocumentId: recordId,
          sourceReference: evidence,
          details: notes,
        })
        .parse(input),
      rule = ruleSchema.parse(input);
    const rev = await get('commercial_lease_revisions', d.revisionId);
    assert(
      rev.status === 'approved' && rev.kind !== 'expiry',
      409,
      'APPROVED_REVISION_REQUIRED',
      'Choose a reviewed non-expiry lease source.',
    );
    await issuedEvidence(env, l, rev.source_document_id);
    await issuedEvidence(env, l, d.sourceDocumentId);
    const preview = domain(() => calculateReviewedCharge(rule, rule.basisFrom, rule.basisTo));
    const id = uid('cru'),
      snapshot = JSON.stringify(rule);
    return commit(
      [
        statement(
          env.DB,
          'INSERT INTO commercial_charge_rules(id,lease_id,revision_id,source_document_id,source_reference,rule_json,rule_sha256,details_envelope,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
          id,
          l.id,
          rev.id,
          d.sourceDocumentId,
          d.sourceReference,
          snapshot,
          await digest(snapshot),
          await seal(env.DATA_ENCRYPTION_KEY, 'commercial-rule:' + id, { text: d.details }),
          user.id,
          now(),
        ),
      ],
      { id, status: 'pending', preview },
      d.sourceReference,
    );
  }
  if (command === 'review-rule') {
    const d = z
        .object({
          ruleId: recordId,
          decision: z.enum(['approved', 'rejected']),
          reference: evidence,
        })
        .parse(input),
      r = await get('commercial_charge_rules', d.ruleId);
    reviewer(user, w, r);
    if (d.decision === 'approved') {
      await issuedEvidence(env, l, r.source_document_id);
      const rev = await get('commercial_lease_revisions', r.revision_id);
      await issuedEvidence(env, l, rev.source_document_id);
      assert(
        (await digest(r.rule_json)) === r.rule_sha256,
        409,
        'RULE_HASH_MISMATCH',
        'The source rule hash changed.',
      );
      const rule = ruleSchema.parse(JSON.parse(r.rule_json));
      domain(() => calculateReviewedCharge(rule, rule.basisFrom, rule.basisTo));
    }
    return commit(
      [reviewUpdate('commercial_charge_rules', r, d.decision, d.reference), guard(env)],
      { id: r.id, status: d.decision },
      d.reference,
    );
  }
  if (command === 'charge') {
    const d = z
      .object({
        mode: z.enum(['allocate', 'recalculate', 'reverse']),
        ruleId: recordId.optional(),
        adjustsChargeId: recordId.optional(),
        periodFrom: dateOnly.optional(),
        periodTo: dateOnly.optional(),
        sourceDocumentId: recordId,
        sourceReference: evidence,
      })
      .parse(input);
    await issuedEvidence(env, l, d.sourceDocumentId);
    let calc: Row,
      rule: Row,
      target: Row | null = null;
    if (d.mode === 'allocate') {
      assert(
        !d.adjustsChargeId && d.ruleId && d.periodFrom && d.periodTo,
        422,
        'CHARGE_INPUT',
        'Allocation requires a rule and an explicit period, without an adjustment target.',
      );
      rule = await approvedRule(env, l, d.ruleId);
      await rulePeriod(env, l, rule, d.periodFrom, d.periodTo);
      calc = domain(() => calculateReviewedCharge(rule.rule, d.periodFrom!, d.periodTo!));
    } else {
      assert(
        d.adjustsChargeId,
        422,
        'ORIGINAL_CHARGE_REQUIRED',
        'Choose the original approved charge.',
      );
      target = await get('commercial_lease_charges', d.adjustsChargeId);
      const baseBalance = await balance(env, target.id),
        original = JSON.parse(target.calculation_json);
      assert(
        (!d.periodFrom || d.periodFrom === original.periodFrom) &&
          (!d.periodTo || d.periodTo === original.periodTo),
        422,
        'ADJUSTMENT_PERIOD',
        'A recalculation must retain the original allocation period.',
      );
      rule = await approvedRule(
        env,
        l,
        d.mode === 'reverse' ? target.rule_id : String(d.ruleId ?? ''),
      );
      if (d.mode === 'reverse') {
        assert(
          baseBalance.totalCents > 0,
          409,
          'CHARGE_ALREADY_REVERSED',
          'The original charge has no remaining balance.',
        );
        calc = {
          periodFrom: original.periodFrom,
          periodTo: original.periodTo,
          baseBalance,
          sourceRule: rule.rule,
          subtotalCents: -baseBalance.subtotalCents,
          gstCents: -baseBalance.gstCents,
          totalCents: -baseBalance.totalCents,
        };
      } else {
        assert(
          rule.rule.obligationKey === original.sourceRule.obligationKey &&
            rule.rule.category === original.sourceRule.category,
          422,
          'ADJUSTMENT_OBLIGATION',
          'The replacement rule must refer to the same source obligation and category.',
        );
        await rulePeriod(env, l, rule, original.periodFrom, original.periodTo);
        const replacement = domain(() =>
          calculateReviewedCharge(rule.rule, original.periodFrom, original.periodTo),
        );
        calc = {
          ...replacement,
          replacement,
          baseBalance,
          subtotalCents: replacement.subtotalCents - baseBalance.subtotalCents,
          gstCents: replacement.gstCents - baseBalance.gstCents,
          totalCents: replacement.totalCents - baseBalance.totalCents,
        };
        assert(
          calc.totalCents !== 0 || calc.gstCents !== 0,
          422,
          'NO_ADJUSTMENT',
          'The approved replacement does not change the current balance.',
        );
      }
    }
    calc = {
      ...calc,
      mode: d.mode,
      ruleId: rule.id,
      ruleSha256: rule.rule_sha256,
      timeZone: 'Australia/Perth',
    };
    const id = uid('clc'),
      snapshot = JSON.stringify(calc);
    return commit(
      [
        statement(
          env.DB,
          'INSERT INTO commercial_lease_charges(id,lease_id,rule_id,adjusts_charge_id,source_document_id,source_reference,calculation_json,calculation_sha256,subtotal_cents,gst_cents,total_cents,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
          id,
          l.id,
          rule.id,
          target?.id ?? null,
          d.sourceDocumentId,
          d.sourceReference,
          snapshot,
          await digest(snapshot),
          calc.subtotalCents,
          calc.gstCents,
          calc.totalCents,
          user.id,
          now(),
        ),
      ],
      { id, status: 'pending', calculation: calc },
      d.sourceReference,
    );
  }
  if (command === 'review-charge') {
    const d = z
        .object({
          chargeId: recordId,
          decision: z.enum(['approved', 'rejected']),
          reference: evidence,
        })
        .parse(input),
      r = await get('commercial_lease_charges', d.chargeId);
    reviewer(user, w, r);
    if (d.decision === 'approved') {
      await issuedEvidence(env, l, r.source_document_id);
      const sourceRule = await approvedRule(env, l, r.rule_id);
      const sourceCalc = JSON.parse(r.calculation_json);
      if (sourceCalc.mode !== 'reverse')
        await rulePeriod(env, l, sourceRule, sourceCalc.periodFrom, sourceCalc.periodTo);
      assert(
        (await digest(r.calculation_json)) === r.calculation_sha256,
        409,
        'CALCULATION_HASH_MISMATCH',
        'The immutable calculation hash does not match.',
      );
      if (r.adjusts_charge_id)
        assert(
          JSON.stringify(await balance(env, r.adjusts_charge_id)) ===
            JSON.stringify(JSON.parse(r.calculation_json).baseBalance),
          409,
          'CHARGE_BALANCE_CHANGED',
          'Another reviewed adjustment changed the balance. Reject this stale proposal and recalculate.',
        );
      assert(
        !(await statement(
          env.DB,
          "SELECT id FROM commercial_lease_exceptions WHERE lease_id=? AND status='open' AND kind='disputed_charge' AND charge_id IN(?,?) LIMIT 1",
          l.id,
          r.id,
          r.adjusts_charge_id,
        ).first()),
        409,
        'CHARGE_DISPUTED',
        'Resolve the recorded dispute independently before approving a charge adjustment.',
      );
    }
    return commit(
      [reviewUpdate('commercial_lease_charges', r, d.decision, d.reference), guard(env)],
      { id: r.id, status: d.decision },
      d.reference,
    );
  }
  if (command === 'obligation-case') {
    const d = z
      .object({
        taskId: recordId,
        version,
        kind: z.enum(['assessment', 'completion', 'cancellation', 'reopening']),
        sourceDocumentId: recordId,
        sourceReference: evidence,
        conditionDocumentId: recordId.optional(),
        workOrderId: recordId.optional(),
        responsibility: z.enum(['lessor', 'occupier', 'shared', 'undetermined']),
        observations: notes,
        quotationReference: evidence.optional(),
        quotedCents: z.number().int().min(0).max(1e12).optional(),
        newDueAt: isoDate.optional(),
        newTitle: z.string().trim().min(3).max(160).optional(),
      })
      .parse(input);
    const t = await statement(
      env.DB,
      'SELECT * FROM commercial_lease_tasks WHERE id=? AND lease_id=?',
      d.taskId,
      l.id,
    ).first<Row>();
    assert(t, 404, 'TASK_NOT_FOUND', 'Task not found.');
    assert(
      t.version === d.version,
      409,
      'TASK_CHANGED',
      'Reload the task before proposing a material decision.',
    );
    await issuedEvidence(env, l, d.sourceDocumentId);
    if (d.conditionDocumentId) await issuedEvidence(env, l, d.conditionDocumentId);
    if (d.workOrderId)
      assert(
        await statement(
          env.DB,
          'SELECT id FROM work_orders WHERE id=? AND property_id=? AND client_id=?',
          d.workOrderId,
          l.property_id,
          l.client_id,
        ).first(),
        422,
        'WORK_ORDER_SCOPE',
        'The quoted or instructed work must belong to this property and client.',
      );
    assert(
      (d.quotedCents === undefined) === (d.quotationReference === undefined),
      422,
      'QUOTE_SOURCE_REQUIRED',
      'Supply both the quoted amount and its evidence reference, or neither.',
    );
    if (d.kind === 'reopening')
      assert(
        ['completed', 'cancelled'].includes(t.status) && d.newDueAt && d.newTitle,
        409,
        'REOPENING_SOURCE_REQUIRED',
        'Reopening needs a closed task, a reviewed new due date and a new title.',
      );
    else
      assert(
        !['completed', 'cancelled'].includes(t.status),
        409,
        'TASK_CLOSED',
        'Preserve the closed task and submit a reopening case.',
      );
    if (d.kind === 'completion')
      assert(
        t.status === 'review_required' &&
          d.conditionDocumentId &&
          d.responsibility !== 'undetermined',
        409,
        'COMPLETION_EVIDENCE_REQUIRED',
        'Completion needs a review-ready task, final condition evidence and a responsibility decision.',
      );
    const id = uid('cor');
    return commit(
      [
        statement(
          env.DB,
          'INSERT INTO commercial_obligation_reviews(id,lease_id,task_id,task_version,kind,source_document_id,source_reference,condition_document_id,work_order_id,responsibility,details_envelope,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
          id,
          l.id,
          t.id,
          t.version,
          d.kind,
          d.sourceDocumentId,
          d.sourceReference,
          d.conditionDocumentId ?? null,
          d.workOrderId ?? null,
          d.responsibility,
          await seal(env.DATA_ENCRYPTION_KEY, 'commercial-obligation:' + id, {
            observations: d.observations,
            quotationReference: d.quotationReference ?? null,
            quotedCents: d.quotedCents ?? null,
            newDueAt: d.newDueAt ?? null,
            newTitle: d.newTitle ?? null,
          }),
          user.id,
          now(),
        ),
      ],
      { id, status: 'pending' },
      d.sourceReference,
    );
  }
  if (command === 'review-obligation') {
    const d = z
        .object({
          caseId: recordId,
          decision: z.enum(['approved', 'rejected']),
          reference: evidence,
        })
        .parse(input),
      r = await get('commercial_obligation_reviews', d.caseId);
    reviewer(user, w, r);
    const steps: D1PreparedStatement[] = [
      reviewUpdate('commercial_obligation_reviews', r, d.decision, d.reference),
      guard(env),
    ];
    let successorId: string | null = null;
    if (d.decision === 'approved') {
      const t = await statement(
        env.DB,
        'SELECT * FROM commercial_lease_tasks WHERE id=? AND lease_id=?',
        r.task_id,
        l.id,
      ).first<Row>();
      assert(
        t && t.version === r.task_version,
        409,
        'TASK_CHANGED',
        'The task changed after this proposal.',
      );
      await issuedEvidence(env, l, r.source_document_id);
      if (r.condition_document_id) await issuedEvidence(env, l, r.condition_document_id);
      assert(
        !(await statement(
          env.DB,
          "SELECT id FROM commercial_lease_exceptions WHERE lease_id=? AND task_id=? AND status='open' LIMIT 1",
          l.id,
          t.id,
        ).first()),
        409,
        'TASK_DISPUTED',
        'Resolve the task exception before approving a material decision.',
      );
      if (['completion', 'cancellation', 'reopening'].includes(r.kind))
        assert(
          t.created_by !== user.id,
          403,
          'INDEPENDENT_TASK_REVIEW',
          'A task author cannot approve its closure or reopening.',
        );
      if (r.kind === 'completion' || r.kind === 'cancellation') {
        assert(
          !['completed', 'cancelled'].includes(t.status),
          409,
          'TASK_CLOSED',
          'This task is already closed.',
        );
        if (r.kind === 'completion') {
          assert(
            t.status === 'review_required' &&
              r.condition_document_id &&
              r.responsibility !== 'undetermined',
            409,
            'COMPLETION_EVIDENCE_REQUIRED',
            'Final condition evidence and responsibility are required.',
          );
          for (const work of new Set([t.work_order_id, r.work_order_id].filter(Boolean)))
            assert(
              await statement(
                env.DB,
                "SELECT id FROM work_orders WHERE id=? AND property_id=? AND client_id=? AND status='completed'",
                work,
                l.property_id,
                l.client_id,
              ).first(),
              409,
              'WORK_INCOMPLETE',
              'Complete the related canonical work before closing its obligation.',
            );
        }
        steps.push(
          statement(
            env.DB,
            'UPDATE commercial_lease_tasks SET status=?,completion_document_id=?,reviewed_by=?,reviewed_at=?,completion_reference=?,version=version+1,updated_at=? WHERE id=? AND version=?',
            r.kind === 'completion' ? 'completed' : 'cancelled',
            r.condition_document_id ?? r.source_document_id,
            user.id,
            now(),
            d.reference,
            now(),
            t.id,
            t.version,
          ),
          guard(env),
        );
      }
      if (r.kind === 'reopening') {
        assert(
          ['completed', 'cancelled'].includes(t.status),
          409,
          'TASK_NOT_CLOSED',
          'Only a closed task can be reopened as a successor.',
        );
        assert(
          !(await statement(
            env.DB,
            'SELECT successor_id FROM commercial_task_successors WHERE predecessor_id=?',
            t.id,
          ).first()),
          409,
          'TASK_ALREADY_REOPENED',
          'Use the existing successor; the original remains closed.',
        );
        const details = await unseal<Row>(
          env.DATA_ENCRYPTION_KEY,
          'commercial-obligation:' + r.id,
          r.details_envelope,
        );
        successorId = uid('clt');
        assert(
          typeof details.newDueAt === 'string' && typeof details.newTitle === 'string',
          409,
          'REOPENING_DETAILS_REQUIRED',
          'The source proposal lacks its new task details.',
        );
        steps.push(
          statement(
            env.DB,
            'INSERT INTO commercial_lease_tasks(id,lease_id,kind,title,due_at,details_envelope,work_order_id,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
            successorId,
            l.id,
            t.kind,
            details.newTitle,
            details.newDueAt,
            await seal(env.DATA_ENCRYPTION_KEY, 'commercial-task:' + successorId, {
              text: details.observations,
              predecessorId: t.id,
              reviewId: r.id,
            }),
            r.work_order_id,
            r.created_by,
            now(),
            now(),
          ),
          statement(
            env.DB,
            'INSERT INTO commercial_task_successors(predecessor_id,successor_id,review_id,created_at) VALUES(?,?,?,?)',
            t.id,
            successorId,
            r.id,
            now(),
          ),
        );
      }
    }
    return commit(steps, { id: r.id, status: d.decision, successorId }, d.reference);
  }
  if (command === 'exception') {
    const d = z
      .object({
        kind: z.enum(exceptionKinds),
        chargeId: recordId.optional(),
        taskId: recordId.optional(),
        sourceReference: evidence,
        details: notes,
      })
      .parse(input);
    if (d.chargeId) await get('commercial_lease_charges', d.chargeId);
    if (d.taskId)
      assert(
        await statement(
          env.DB,
          'SELECT id FROM commercial_lease_tasks WHERE id=? AND lease_id=?',
          d.taskId,
          l.id,
        ).first(),
        404,
        'TASK_NOT_FOUND',
        'Task not found in this lease.',
      );
    assert(
      d.kind !== 'disputed_charge' || d.chargeId,
      422,
      'CHARGE_REQUIRED',
      'A disputed charge must identify its source charge.',
    );
    assert(
      d.kind !== 'disputed_task' || d.taskId,
      422,
      'TASK_REQUIRED',
      'A disputed task must identify its source task.',
    );
    const id = uid('cex');
    return commit(
      [
        statement(
          env.DB,
          'INSERT INTO commercial_lease_exceptions(id,lease_id,kind,charge_id,task_id,source_reference,details_envelope,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
          id,
          l.id,
          d.kind,
          d.chargeId ?? null,
          d.taskId ?? null,
          d.sourceReference,
          await seal(env.DATA_ENCRYPTION_KEY, 'commercial-exception:' + id, { text: d.details }),
          user.id,
          now(),
        ),
      ],
      { id, status: 'open' },
      d.sourceReference,
    );
  }
  if (command === 'resolve-exception') {
    const d = z
        .object({ exceptionId: recordId, resolutionDocumentId: recordId, reference: evidence })
        .parse(input),
      r = await get('commercial_lease_exceptions', d.exceptionId);
    assert(
      w.kind === 'staff',
      403,
      'STAFF_REVIEW_REQUIRED',
      'An independent operations reviewer must resolve exceptions.',
    );
    operationsWrite(user);
    assert(
      r.status === 'open' && r.created_by !== user.id,
      403,
      'INDEPENDENT_EXCEPTION_REVIEW',
      'An exception author cannot resolve their own open exception.',
    );
    await issuedEvidence(env, l, d.resolutionDocumentId);
    return commit(
      [
        statement(
          env.DB,
          "UPDATE commercial_lease_exceptions SET status='resolved',resolved_by=?,resolved_at=?,resolution_reference=?,resolution_document_id=? WHERE id=? AND status='open'",
          user.id,
          now(),
          d.reference,
          d.resolutionDocumentId,
          r.id,
        ),
        guard(env),
      ],
      { id: r.id, status: 'resolved' },
      d.reference,
    );
  }
  const d = z
      .object({
        exceptionId: recordId,
        ownerId: recordId,
        priority: z.enum(['routine', 'high', 'urgent']),
        reference: evidence,
      })
      .parse(input),
    r = await get('commercial_lease_exceptions', d.exceptionId);
  assert(w.kind === 'staff', 403, 'STAFF_REVIEW_REQUIRED', 'Operations assigns exception owners.');
  operationsWrite(user);
  assert(r.status === 'open', 409, 'EXCEPTION_RESOLVED', 'This exception is already resolved.');
  assert(
    await statement(
      env.DB,
      "SELECT u.id FROM users u JOIN staff_profiles s ON s.user_id=u.id WHERE u.id=? AND u.active=1 AND u.verified_at IS NOT NULL AND s.active=1 AND s.role IN('administrator','operations_manager')",
      d.ownerId,
    ).first(),
    422,
    'EXCEPTION_OWNER_INVALID',
    'Choose an active verified operations owner.',
  );
  return commit(
    [
      statement(
        env.DB,
        'INSERT INTO commercial_exception_assignments(id,exception_id,owner_id,priority,actor_id,reference,created_at) VALUES(?,?,?,?,?,?,?)',
        uid('cea'),
        r.id,
        d.ownerId,
        d.priority,
        user.id,
        d.reference,
        now(),
      ),
    ],
    { id: r.id, ownerId: d.ownerId, priority: d.priority },
    d.reference,
  );
}

export async function commercialLifecycleData(env: Env, l: Row) {
  const load = async (table: string, order = 'created_at DESC') =>
    (
      await statement(
        env.DB,
        `SELECT * FROM ${table} WHERE lease_id=? ORDER BY ${order} LIMIT 201`,
        l.id,
      ).all<Row>()
    ).results;
  const [revisions, rules, charges, cases, exceptions] = await Promise.all([
    load('commercial_lease_revisions', 'base_version DESC,created_at DESC'),
    load('commercial_charge_rules'),
    load('commercial_lease_charges'),
    load('commercial_obligation_reviews'),
    load('commercial_lease_exceptions'),
  ]);
  const decode = async (rows: Row[], column: string, prefix: string) =>
    Promise.all(
      rows
        .slice(0, 200)
        .map(async (r) => ({
          ...r,
          [column]: undefined,
          details: await unseal(env.DATA_ENCRYPTION_KEY, prefix + r.id, r[column]),
        })),
    );
  const sourceDocuments = (
    await statement(
      env.DB,
      "SELECT DISTINCT d.id,d.title,d.version FROM documents d JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=? WHERE d.property_id=? AND d.status='issued' ORDER BY d.issued_at DESC LIMIT 200",
      l.client_id,
      l.property_id,
    ).all<Row>()
  ).results;
  const workOrders = (
    await statement(
      env.DB,
      'SELECT id,reference,status FROM work_orders WHERE property_id=? AND client_id=? ORDER BY created_at DESC LIMIT 100',
      l.property_id,
      l.client_id,
    ).all<Row>()
  ).results;
  const approvedHead = await head(env, l.id),
    current = await statement(
      env.DB,
      "SELECT * FROM commercial_lease_revisions WHERE lease_id=? AND status='approved' AND effective_at<=? ORDER BY effective_at DESC,base_version DESC LIMIT 1",
      l.id,
      now(),
    ).first<Row>();
  const signals: string[] = [];
  if (!approvedHead) signals.push('An independently approved commencement source is missing.');
  if (
    current?.option_closes_at &&
    current.option_closes_at < now() &&
    approvedHead?.kind !== 'renewal' &&
    current.kind !== 'expiry'
  )
    signals.push(
      'The recorded option window has closed. Review the source and any external exercise evidence; no option is exercised automatically.',
    );
  const pending = revisions.filter(
    (r) => r.status === 'pending' && r.option_opens_at && r.option_closes_at,
  );
  if (
    pending.some((r, i) =>
      pending.some(
        (o, j) =>
          i < j && r.option_opens_at < o.option_closes_at && r.option_closes_at > o.option_opens_at,
      ),
    )
  )
    signals.push(
      'Pending source proposals contain overlapping option windows. Record and resolve a source exception before approval.',
    );
  if (approvedHead) {
    try {
      await issuedEvidence(env, l, approvedHead.source_document_id);
    } catch {
      signals.push(
        'The approved lease source is no longer issued to this client. Review document authority before further action.',
      );
    }
  }
  const totals = await statement(
    env.DB,
    "SELECT CAST(COALESCE(sum(subtotal_cents),0) AS TEXT) AS subtotalCents,CAST(COALESCE(sum(gst_cents),0) AS TEXT) AS gstCents,CAST(COALESCE(sum(total_cents),0) AS TEXT) AS totalCents,count(*) AS count FROM commercial_lease_charges WHERE lease_id=? AND status='approved'",
    l.id,
  ).first<Row>();
  const caseRows = await decode(cases, 'details_envelope', 'commercial-obligation:');
  const exceptionRows = await decode(exceptions, 'details_envelope', 'commercial-exception:');
  for (const r of exceptionRows)
    r.assignment = await statement(
      env.DB,
      'SELECT owner_id,priority,reference,created_at FROM commercial_exception_assignments WHERE exception_id=? ORDER BY created_at DESC,id DESC LIMIT 1',
      r.id,
    ).first<Row>();
  return {
    sourceDocuments,
    workOrders,
    revisions: await decode(revisions, 'terms_envelope', 'commercial-revision:'),
    rules: (await decode(rules, 'details_envelope', 'commercial-rule:')).map((r) => ({
      ...r,
      rule_json: undefined,
      rule: JSON.parse(r.rule_json),
    })),
    charges: charges
      .slice(0, 200)
      .map((r) => ({
        ...r,
        calculation_json: undefined,
        calculation: JSON.parse(r.calculation_json),
      })),
    obligationCases: caseRows,
    exceptions: exceptionRows,
    approvedHeadId: approvedHead?.id ?? null,
    currentTerms: current ? terms(current) : null,
    signals,
    ledgerTotals: totals,
    historyTruncated: [revisions, rules, charges, cases, exceptions].some(
      (rows) => rows.length > 200,
    ),
    chargeCategories: categories,
    exceptionKinds,
  };
}

export async function commercialLedgerExport(
  env: Env,
  user: Principal,
  w: Workspace,
  leaseId: string,
  request: Request,
) {
  const l = await leaseAccess(env, user, w, recordId.parse(leaseId)),
    params = new URL(request.url).searchParams;
  const from = dateOnly.parse(params.get('from')),
    to = dateOnly.parse(params.get('to'));
  assert(to > from, 422, 'EXPORT_PERIOD', 'The exclusive end date must follow the start date.');
  assert(
    !(await statement(
      env.DB,
      "SELECT id FROM commercial_lease_charges WHERE lease_id=? AND status='approved' AND json_extract(calculation_json,'$.periodFrom')<? AND json_extract(calculation_json,'$.periodTo')>? AND (json_extract(calculation_json,'$.periodFrom')<? OR json_extract(calculation_json,'$.periodTo')>?) LIMIT 1",
      l.id,
      to,
      from,
      from,
      to,
    ).first()),
    422,
    'PARTIAL_ALLOCATION_EXPORT',
    'The range cuts across a reviewed allocation. Widen the range to include the complete source periods.',
  );
  const rows = (
    await statement(
      env.DB,
      "SELECT * FROM commercial_lease_charges WHERE lease_id=? AND status='approved' AND json_extract(calculation_json,'$.periodFrom')>=? AND json_extract(calculation_json,'$.periodTo')<=? ORDER BY created_at,id LIMIT 10001",
      l.id,
      from,
      to,
    ).all<Row>()
  ).results;
  assert(
    rows.length <= 10000,
    413,
    'EXPORT_TOO_LARGE',
    'Choose a smaller period; no financial rows have been truncated.',
  );
  const totals = { subtotal: 0n, gst: 0n, total: 0n };
  const output: Array<Array<string | number | bigint>> = [
    [
      'record_id',
      'lease_id',
      'mode',
      'original_charge_id',
      'source_document_id',
      'source_reference',
      'period_from',
      'period_to_exclusive',
      'currency',
      'subtotal_cents',
      'gst_cents',
      'total_cents',
      'calculation_sha256',
      'reviewed_by',
      'review_reference',
    ],
  ];
  for (const row of rows) {
    const c = JSON.parse(row.calculation_json);
    assert(
      (await digest(row.calculation_json)) === row.calculation_sha256,
      409,
      'CALCULATION_HASH_MISMATCH',
      'A source snapshot hash failed validation.',
    );
    for (const [key, column] of [
      ['subtotal', 'subtotal_cents'],
      ['gst', 'gst_cents'],
      ['total', 'total_cents'],
    ] as const)
      totals[key] += BigInt(row[column]);
    output.push([
      row.id,
      l.id,
      c.mode,
      row.adjusts_charge_id ?? '',
      row.source_document_id,
      row.source_reference,
      c.periodFrom,
      c.periodTo,
      'AUD',
      row.subtotal_cents,
      row.gst_cents,
      row.total_cents,
      row.calculation_sha256,
      row.reviewed_by,
      row.review_reference,
    ]);
  }
  output.push([
    'CONTROL_TOTAL',
    l.id,
    'not_a_tax_invoice',
    '',
    '',
    '',
    from,
    to,
    'AUD',
    totals.subtotal,
    totals.gst,
    totals.total,
    '',
    '',
    '',
  ]);
  const { csvRows } = await import('../../../../packages/finance/export');
  const csv = csvRows(output);
  await activity(
    env,
    user,
    'commercial.ledger_exported',
    'commercial_lease',
    l.id,
    l.property_id,
    null,
    { from, to, rows: rows.length, sha256: await digest(csv), totalCents: String(totals.total) },
  ).run();
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="commercial-ledger-${l.id}-${from}-${to}.csv"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
