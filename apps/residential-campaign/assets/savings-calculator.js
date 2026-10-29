import {calculateResidentialSavings, savingsDefaults} from './savings-model.mjs';

const form = document.getElementById('agency-savings-form');
if (form) {
  const node = (id) => document.getElementById(id);
  const money = (cents) => new Intl.NumberFormat('en-AU', {
    style: 'currency', currency: 'AUD',
    minimumFractionDigits: Number.isInteger(cents / 100) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(cents / 100) ? 0 : 2,
  }).format(cents / 100);
  const number = (name, fallback, min, max) => {
    const field = node(name);
    const value = Number(field?.value);
    return field && field.value.trim() !== '' && Number.isFinite(value) ?
      Math.max(min, Math.min(max, value)) : fallback;
  };
  const put = (id, value) => { const target = node(id); if (target) target.textContent = value; };
  const feeCheckboxes = Object.keys(savingsDefaults.include);
  const state = () => {
    const include = Object.fromEntries(feeCheckboxes.map(key => [key, Boolean(node('agency-on-' + key)?.checked)]));
    return {
      weeklyRent: number('agency-weekly-rent', 750, 0, 50000),
      months: Number(form.querySelector('input[name="tenancy-months"]:checked')?.value ?? 24),
      properties: Math.round(number('agency-property-count', 1, 1, 100)),
      commissionPct: number('agency-rate', 9, 0, 40),
      lettingWeeks: number('agency-letting-weeks', 2, 0, 12),
      advertisingEx: number('agency-advertising', 400, 0, 100000),
      entryPcrEx: number('agency-entry', 200, 0, 100000),
      routineFeeEx: number('agency-routine-fee', 100, 0, 100000),
      routineVisitsPerYear: Math.round(number('agency-routine-visits', 3, 0, 4)),
      renewalFeeEx: number('agency-renewal', 250, 0, 100000),
      exitFeeEx: number('agency-exit', 200, 0, 100000),
      statementFeeEx: number('agency-statements', 75, 0, 100000),
      adminMonthlyEx: number('agency-admin', 0, 0, 100000),
      additionalSelfManagedInc: number('self-extra-cost', 0, 0, 100000),
      arrangement: form.querySelector('input[name="arrangement"]:checked')?.value ?? 'self',
      include,
    };
  };
  const render = () => {
    const values = state();
    const result = calculateResidentialSavings(values);
    const absDiff = Math.abs(result.differenceCents);
    const pct = result.differencePercent;
    const lower = result.differenceCents >= 0;
    const retained = values.arrangement === 'retain';
    const positiveText = lower ? 'Lower modelled spending' : 'Higher modelled spending';
    put('result-period', result.months + ' months · ' + result.weeks + ' weeks · ' + result.properties +
      (result.properties === 1 ? ' property' : ' properties'));
    put('result-agency', money(result.agencyTotalCents));
    put('result-subscription', money(result.subscriptionTotalCents));
    put('result-extra', money(result.additionalTotalCents));
    put('result-retained', money(result.retainedAgencyCents));
    put('result-alternative', money(result.alternativeTotalCents));
    put('result-difference', money(absDiff));
    put('hero-difference', money(absDiff));
    put('hero-difference-label', (lower ? 'lower' : 'higher') + ' modelled spending over ' + result.months + ' months');
    put('result-alternative-label', retained ? 'Agency + ProInspect arrangement' : 'Self-managed + ProInspect arrangement');
    put('alternative-bar-label', retained ? 'Agency + ProInspect' : 'Self-managed + ProInspect');
    put('result-difference-label', positiveText + ' over ' + result.months + ' months');
    put('result-difference-pct', pct === null ? 'Not applicable with $0 agency costs' :
      Math.abs(pct).toFixed(1) + '% ' + (lower ? 'below' : 'above') + ' modelled agency fees');
    put('result-monthly-agency', money(result.agencyMonthlyEquivalentCents) + '/month');
    put('result-monthly-alternative', money(result.alternativeMonthlyEquivalentCents) + '/month');
    put('result-rental', money(result.rentalIncomeTotalCents));
    put('result-effective-rate', result.agencyEffectiveRentPercent === null ? '—' :
      result.agencyEffectiveRentPercent.toFixed(1) + '% of rent');
    put('result-properties', String(result.properties));
    put('result-weeks', String(result.weeks));
    put('result-routine', String(result.routineInspections));
    put('result-status', retained ?
      'Keeping your existing agency means its fees still apply. The ProInspect subscription is additional spending, not a replacement or saving.' :
      (values.additionalSelfManagedInc > 0 ?
        'The difference incorporates the extra self-management costs you entered. It is not a verified net saving because other uncovered costs and responsibilities may remain.' :
        'This compares modelled agency fees with subscription charges only. Self-management, rent collection, some leasing and other uncovered costs have not been priced. The figure is not a guaranteed saving.'));
    const overallMax = Math.max(result.agencyTotalCents, result.alternativeTotalCents, 1);
    const agencyBar = node('agency-bar');
    const alternativeBar = node('alternative-bar');
    if (agencyBar) {
      agencyBar.style.width = (result.agencyTotalCents / overallMax * 100).toFixed(2) + '%';
      agencyBar.setAttribute('aria-label', 'Agency fees: ' + money(result.agencyTotalCents));
    }
    if (alternativeBar) {
      alternativeBar.style.width = (result.alternativeTotalCents / overallMax * 100).toFixed(2) + '%';
      alternativeBar.setAttribute('aria-label', 'ProInspect-based arrangement: ' + money(result.alternativeTotalCents));
    }
    const headline = node('result-outcome');
    if (headline) headline.classList.toggle('negative', !lower);
    const rows = Object.fromEntries(result.breakdown.map(item => [item.key, item]));
    for (const row of document.querySelectorAll('[data-agency-fee]')) {
      const fee = rows[row.dataset.agencyFee];
      const freq = row.querySelector('[data-fee-frequency]');
      const cost = row.querySelector('[data-fee-total]');
      if (freq) freq.textContent = fee.frequency + (result.properties > 1 ? ' · × ' + result.properties + ' properties' : '');
      if (cost) cost.textContent = money(fee.totalCents);
      row.classList.toggle('excluded-fee', !fee.enabled);
    }
    put('agency-breakdown-total', money(result.agencyTotalCents));
  };
  form.addEventListener('input', render);
  form.addEventListener('change', render);
  node('agency-savings-reset')?.addEventListener('click', () => {form.reset(); render();});
  render();
}
