(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const format = (cents) => new Intl.NumberFormat('en-AU', {style:'currency',currency:'AUD',minimumFractionDigits:2,maximumFractionDigits:2}).format(cents/100);
  const integer = (value, low = 1, high = 100) => Math.max(low,Math.min(high,Math.trunc(Number(value)||low)));
  const syncPrice = () => {
    const countInput = $('#property-count');
    if (!countInput) return;
    const count = integer(countInput.value);
    const weeklyEx = count*5000, weeklyInc=count*5500;
    for (const el of $$('[data-weekly-inc]')) el.textContent = format(weeklyInc);
    for (const el of $$('[data-weekly-ex]')) el.textContent = format(weeklyEx);
    for (const el of $$('[data-annual-inc]')) el.textContent = format(weeklyInc*52);
    for (const el of $$('[data-annual-ex]')) el.textContent = format(weeklyEx*52);
    for (const el of $$('[data-props]')) el.textContent = String(count);
    const compare = $('#comparison-spend');
    const output = $('#compare-result');
    if (compare && output) {
      const raw = compare.value.trim();
      const entered = raw!=='' && Number.isFinite(Number(raw)) && Number(raw)>=0;
      if(!entered){ output.innerHTML='<p>Enter the amount you currently spend on comparable eligible services per property to estimate the difference.</p>'; output.classList.remove('negative'); }
      else {
        const paygCents=Math.round(Number(raw)*100)*count;
        const difference = paygCents-weeklyEx*52;
        output.classList.toggle('negative',difference<0);
        const summary = difference>=0 ? 'Illustrative potential difference' : 'Illustrative extra subscription cost';
        const desc = 'Calculated using your own pay-as-you-go estimate, before GST. Not a guaranteed saving or a quote for individual services.';
        output.innerHTML='<span class="micro">'+summary+'</span><span class="amount">'+format(Math.abs(difference))+'</span><p>'+desc+'</p>';
      }
    }
  };
  const count=$('#property-count');
  if(count){
    count.addEventListener('input',syncPrice);
    count.addEventListener('change',()=>{count.value=String(integer(count.value));syncPrice()});
    for(const btn of $$('[data-count-step]'))btn.addEventListener('click',()=>{count.value=String(integer(Number(count.value)+Number(btn.dataset.countStep)));syncPrice()});
  }
  const comparison=$('#comparison-spend'); if(comparison)comparison.addEventListener('input',syncPrice);
  syncPrice();
  const scopeSearch=$('#scope-search');
  if(scopeSearch){
    const empty=$('#scope-empty');
    const groups=$$('[data-scope-group]');
    const filter=()=>{const query=scopeSearch.value.trim().toLocaleLowerCase('en-AU');let matches=0;for(const group of groups){let shown=0;for(const item of group.querySelectorAll('[data-scope-item]')){const show=item.textContent.toLocaleLowerCase('en-AU').includes(query);item.hidden=!show;if(show){shown++;matches++;}}group.hidden=shown===0;}if(empty)empty.hidden=matches>0;};
    scopeSearch.addEventListener('input',filter);
  }
  const mobile=$('#mobile-menu');
  if(mobile){
    mobile.querySelectorAll('nav a').forEach(a=>a.addEventListener('click',()=>mobile.open=false));
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mobile.open){mobile.open=false;mobile.querySelector('summary').focus();}});
    document.addEventListener('pointerdown',e=>{if(mobile.open&&!mobile.contains(e.target))mobile.open=false;});
  }
})();