/* ValuCal — Pricing Engine application logic */

// ── Account setup modal (selection → contract) ──────────────────
let accountSetupSaveTimer = null;
let accountSetupValidatedTimer = null;
let accountSetupSaveRunId = 0;
/** Set when user picked “Select & create contract” while account was not ready; drives post-validate navigation to contract (do not rely on `screen` alone). */
let accountSetupOpenedFromOptionSelection = false;
let signatureModalDelayTimer = null;
let signatureModalCountdownTimer = null;
let signatureModalSecondsLeft = 4;
let contractConfirmProceedAction = null;
let proposalHistoryEvents = [];

const MSG_ACCOUNT_VALIDATED = {
  title: 'Account validated',
  sub: 'Required account information has been completed and validated.',
};

function formatHistoryTimestamp(dateObj) {
  const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
  return d.toLocaleString();
}

function logProposalEvent(title, description = '') {
  proposalHistoryEvents.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    description,
    at: new Date()
  });
}

const HISTORY_PHASE_ORDER = ['Proposal', 'Contract', 'Deal Result', 'Other'];

function getHistoryPhaseForEvent(evt) {
  const t = String(evt?.title || '').toLowerCase();
  if (
    t.includes('option') ||
    t.includes('proposal') ||
    t.includes('review & send') ||
    t.includes('review and send')
  ) return 'Proposal';
  if (
    t.includes('contract') ||
    t.includes('payment setup') ||
    t.includes('signature')
  ) return 'Contract';
  if (t.includes('deal result') || t.includes('closed-lost') || t.includes('closed won')) return 'Deal Result';
  return 'Other';
}

function renderProposalHistory() {
  const list = document.getElementById('proposal-history-list');
  if (!list) return;
  if (!proposalHistoryEvents.length) {
    list.innerHTML = '<div class="proposal-history-empty">No events yet.</div>';
    return;
  }
  const sorted = proposalHistoryEvents.slice().reverse();
  const grouped = sorted.reduce((acc, evt) => {
    const phase = getHistoryPhaseForEvent(evt);
    if (!acc[phase]) acc[phase] = [];
    acc[phase].push(evt);
    return acc;
  }, {});

  list.innerHTML = HISTORY_PHASE_ORDER
    .filter((phase) => Array.isArray(grouped[phase]) && grouped[phase].length > 0)
    .map((phase) => `
      <section class="proposal-history-phase">
        <div class="proposal-history-phase-title">${phase}</div>
        ${grouped[phase].map((evt) => `
          <div class="proposal-history-item">
            <div class="proposal-history-title">${evt.title}</div>
            ${evt.description ? `<div class="proposal-history-sub">${evt.description}</div>` : ''}
            <div class="proposal-history-date">${formatHistoryTimestamp(evt.at)}</div>
          </div>
        `).join('')}
      </section>
    `)
    .join('');
}

function openProposalHistoryModal() {
  renderProposalHistory();
  const overlay = document.getElementById('proposal-history-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeProposalHistoryModal() {
  const overlay = document.getElementById('proposal-history-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function clearSignatureCompletionSimulation() {
  if (signatureModalDelayTimer) {
    clearTimeout(signatureModalDelayTimer);
    signatureModalDelayTimer = null;
  }
  if (signatureModalCountdownTimer) {
    clearInterval(signatureModalCountdownTimer);
    signatureModalCountdownTimer = null;
  }
  signatureModalSecondsLeft = 4;
  const btn = document.getElementById('signature-complete-continue-btn');
  if (btn) btn.textContent = 'Continue (4s)';
  const overlay = document.getElementById('signature-complete-overlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function updateSignatureContinueCta() {
  const btn = document.getElementById('signature-complete-continue-btn');
  if (btn) btn.textContent = `Continue (${signatureModalSecondsLeft}s)`;
}

function continueFromSignatureCompleted() {
  if (contractSubState !== 'waiting') {
    clearSignatureCompletionSimulation();
    return;
  }
  clearSignatureCompletionSimulation();
  contractSubState = 'signed';
  logProposalEvent('Contract signed', 'Customer signature was completed.');
  touchNavDate('contract', true);
  touchNavDate('contract_sign_pay', true);
  updateContractSubState();
  renderNav();
}

function scheduleSignatureCompletionSimulation() {
  clearSignatureCompletionSimulation();
  signatureModalDelayTimer = setTimeout(() => {
    signatureModalDelayTimer = null;
    startSignatureCompletedModalCountdown();
  }, 3000);
}

function startSignatureCompletedModalCountdown() {
  if (screen !== 'contract-review' || contractSubState !== 'waiting') return;
  const overlay = document.getElementById('signature-complete-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  signatureModalSecondsLeft = 4;
  updateSignatureContinueCta();
  signatureModalCountdownTimer = setInterval(() => {
    signatureModalSecondsLeft -= 1;
    if (signatureModalSecondsLeft <= 0) {
      continueFromSignatureCompleted();
      return;
    }
    updateSignatureContinueCta();
  }, 1000);
}

function isAccountReady() {
  const badge = document.getElementById('account-badge');
  return !!(badge && badge.classList.contains('badge-ready'));
}

function applyAccountReadyState() {
  const badge = document.getElementById('account-badge');
  if (badge) {
    badge.className = 'badge-ready';
    badge.innerHTML = 'Account ready';
    badge.onclick = null;
    badge.style.cursor = 'default';
  }

  const trigger = document.getElementById('account-status-trigger');
  if (trigger) {
    trigger.onclick = null;
    trigger.style.cursor = 'default';
  }

  const banner = document.getElementById('warning-banner');
  if (banner) {
    banner.classList.add('hidden');
    const body = document.getElementById('vc-body');
    if (body) body.classList.remove('has-banner');
  }
}

function resetAccountSetupSaveUI() {
  accountSetupSaveRunId += 1;
  if (accountSetupSaveTimer) {
    clearTimeout(accountSetupSaveTimer);
    accountSetupSaveTimer = null;
  }
  if (accountSetupValidatedTimer) {
    clearTimeout(accountSetupValidatedTimer);
    accountSetupValidatedTimer = null;
  }
  const loader = document.getElementById('account-setup-validate-loader');
  if (loader) loader.classList.add('hidden');
  const spinner = document.querySelector('.account-setup-validate-spinner');
  if (spinner) spinner.classList.remove('hidden');
  const validatedIcon = document.querySelector('.account-setup-validated-icon');
  if (validatedIcon) validatedIcon.classList.add('hidden');
  const loaderText = document.querySelector('.account-setup-validate-loader-text');
  if (loaderText) loaderText.textContent = 'Validating account...';
  const btn = document.getElementById('btn-account-setup-save');
  if (btn) {
    btn.textContent = 'Save & validate';
  }
  const cancelEl = document.querySelector('.account-setup-actions .vds-btn-secondary');
  if (cancelEl) cancelEl.disabled = false;
  const closeEl = document.querySelector('.account-setup-close');
  if (closeEl) {
    closeEl.style.pointerEvents = '';
    closeEl.style.opacity = '';
  }
  ['acc-setup-zip', 'acc-setup-taxid', 'acc-setup-phone'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  });
  updateAccountSetupSaveState();
}

function openAccountSetupModal() {
  const overlay = document.getElementById('account-setup-overlay');
  if (!overlay) return;
  if (overlay.classList.contains('open')) {
    updateAccountSetupSaveState();
    return;
  }
  resetAccountSetupSaveUI();
  document.body.style.overflow = 'hidden';
  overlay.classList.add('open');
  updateAccountSetupSaveState();
}

function closeAccountSetupModal() {
  if (accountSetupSaveTimer || accountSetupValidatedTimer) {
    resetAccountSetupSaveUI();
  }
  const overlay = document.getElementById('account-setup-overlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function updateAccountSetupSaveState() {
  const zip = document.getElementById('acc-setup-zip')?.value.trim() || '';
  const taxId = document.getElementById('acc-setup-taxid')?.value.trim() || '';
  const phone = document.getElementById('acc-setup-phone')?.value.trim() || '';
  const btn = document.getElementById('btn-account-setup-save');
  if (!btn) return;
  btn.disabled = !(zip && taxId && phone);
}

/**
 * Same contract “Review & send” landing as confirmAndLockDeal, without the confirm modal.
 * Used after account setup validation when the user had already chosen a winning option.
 */
function navigateToContractReviewFromSelection() {
  clearSignatureCompletionSimulation();
  const optId = bld.selectedOptionId;
  const opt = options.find((o) => o.id === optId);
  if (!opt) return false;
  const optionNumber = options.findIndex((o) => o.id === optId) + 1;
  logProposalEvent('Contract created', `Created from Option ${Math.max(1, optionNumber)}.`);

  screen = 'contract-review';

  document.getElementById('screen-proposal-review').classList.add('hidden');
  document.getElementById('screen-proposal-selection').classList.add('hidden');
  document.getElementById('screen-drafting').classList.add('hidden');
  document.getElementById('options-grid').classList.add('hidden');

  document.getElementById('screen-contract').classList.remove('hidden');

  document.querySelector('.vc-main-stepper').classList.remove('hidden');
  document.getElementById('step-dot-1').className = 'vc-step-dot done';
  document.getElementById('step-dot-1').innerHTML =
    '<span class="material-symbols-outlined" style="font-size:14px;">check</span>';
  document.getElementById('step-label-1').classList.remove('muted');
  document.getElementById('step-dot-2').className = 'vc-step-dot active';
  document.getElementById('step-label-2').classList.remove('muted');

  document.getElementById('vc-body').style.paddingTop = '159px';

  document.getElementById('footer-send').innerText = 'Send E-Sign Link';
  document.getElementById('footer-send').disabled = false;

  const banner = document.getElementById('success-banner');
  banner.style.top = '159px';
  showSuccessBanner(
    'Contract has been created',
    'Your contract was successfully generated. Review the message and send the e-sign link.'
  );

  document.getElementById('screen-drafting').classList.add('hidden');

  touchNavDate('proposal');
  touchNavDate('proposal_selection');
  enterContractScreen(opt);
  renderNav();
  return true;
}

function saveAccountSetup() {
  const btn = document.getElementById('btn-account-setup-save');
  if (!btn || btn.disabled) return;
  if (accountSetupSaveTimer) return;
  accountSetupSaveRunId += 1;
  const thisRun = accountSetupSaveRunId;
  const loader = document.getElementById('account-setup-validate-loader');
  if (btn) {
    btn.textContent = 'Validating…';
    btn.disabled = true;
  }
  if (loader) loader.classList.remove('hidden');
  const spinner = document.querySelector('.account-setup-validate-spinner');
  if (spinner) spinner.classList.remove('hidden');
  const validatedIcon = document.querySelector('.account-setup-validated-icon');
  if (validatedIcon) validatedIcon.classList.add('hidden');
  const loaderText = document.querySelector('.account-setup-validate-loader-text');
  if (loaderText) loaderText.textContent = 'Validating account...';
  const cancelEl = document.querySelector('.account-setup-actions .vds-btn-secondary');
  if (cancelEl) cancelEl.disabled = true;
  const closeEl = document.querySelector('.account-setup-close');
  if (closeEl) {
    closeEl.style.pointerEvents = 'none';
    closeEl.style.opacity = '0.4';
  }
  ['acc-setup-zip', 'acc-setup-taxid', 'acc-setup-phone'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
  });

  accountSetupSaveTimer = setTimeout(() => {
    accountSetupSaveTimer = null;
    if (thisRun !== accountSetupSaveRunId) return;
    applyAccountReadyState();
    if (spinner) spinner.classList.add('hidden');
    if (validatedIcon) validatedIcon.classList.remove('hidden');
    if (loaderText) loaderText.textContent = 'Validated';
    const goToContract =
      accountSetupOpenedFromOptionSelection && bld.selectedOptionId != null && isAccountReady();
    accountSetupValidatedTimer = setTimeout(() => {
      accountSetupValidatedTimer = null;
      if (thisRun !== accountSetupSaveRunId) return;
      closeAccountSetupModal();
      showSuccessBanner(MSG_ACCOUNT_VALIDATED.title, MSG_ACCOUNT_VALIDATED.sub);
      if (goToContract) {
        accountSetupOpenedFromOptionSelection = false;
        setTimeout(() => openConfirmSelectionModal(), 160);
      }
    }, 700);
  }, 1800);
}
// ── PRICING DICTIONARIES ──────────────────────────────────────────
const corePricing = {
  'vtu': { name: 'VTU Only', price: 35.00 },
  'vtu-ffc': { name: 'VTU + Forward Facing Camera', price: 65.00 },
  'vtu-dual': { name: 'VTU + Dual Camera', price: 75.00 },
  'asset-powered': { name: 'Powered Asset', price: 39.00 },
  'asset-nonpowered': { name: 'Non-Powered Asset', price: 19.00 },
};
const featurePricing = { 'driver-id': 2.00, 'privacy': 1.00, 'adas': 5.00, 'evc': 15.00, 'logbook': 3.00, 'sd-256': 5.00, 'monitor': 12.00 };
const featureLabels = {
  'sd-256': '256 GB SD Card',
  'adas': 'ADAS',
  'evc': 'Extended View Cameras',
  'monitor': 'In-Cab Monitor',
  'driver-id': 'Driver ID',
  'privacy': 'Privacy Button',
  'logbook': 'Logbook'
};

// ── VOLUME TIERS ──────────────────────────────────────────────────
const volumeTiers = [
  { min: 1,   max: 9,    label: '1-9',    discount: 0.00 },
  { min: 10,  max: 19,   label: '10-19',  discount: 0.05 },
  { min: 20,  max: 49,   label: '20-49',  discount: 0.10 },
  { min: 50,  max: 99,   label: '50-99',  discount: 0.15 },
  { min: 100, max: 9999, label: '100+',   discount: 0.20 },
];

function getNaturalTierIndex(qty) {
  const idx = volumeTiers.findIndex(t => qty >= t.min && qty <= t.max);
  return idx === -1 ? 0 : idx;
}

function getEffectiveTier(qty, forcedTierIndex = -1) {
  const natural = getNaturalTierIndex(qty);
  // If forcedTierIndex is provided, it must be at least the natural one to apply higher discount
  const effective = forcedTierIndex === -1 ? natural : Math.max(natural, forcedTierIndex);
  return { ...volumeTiers[effective], index: effective, naturalIndex: natural };
}

function getApprovalRole(skip) {
  if (skip === 1) return 'Associate Director';
  if (skip >= 2) return 'Director';
  return 'System';
}

function getTermMultiplier(term) {
  const t = parseInt(term);
  if (t === 24) return 0.9;
  if (t === 36) return 0.8;
  if (t === 48) return 0.75;
  if (t === 60) return 0.7;
  return 1.0;
}

function getPromoMultiplier(coreKey, promoType) {
  const isVideo = coreKey === 'vtu-ffc' || coreKey === 'vtu-dual';
  return (promoType === 'Media' && isVideo) ? 0.8 : 1.0;
}

function formatMoney(n) {
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function calcBundle(bundle, termStr, promoType, forcedTierIndex = -1, tierQty = null) {
  const term = parseInt(termStr) || 36;
  const termMult  = getTermMultiplier(term);
  const qtyBasis  = tierQty == null ? bundle.qty : tierQty;
  const tierObj   = getEffectiveTier(qtyBasis, forcedTierIndex);
  const tierMult  = 1 - tierObj.discount;
  const promoMult = getPromoMultiplier(bundle.coreKey, promoType);
  const unitPrice = bundle.basePrice * termMult * tierMult * promoMult;
  const monthly   = unitPrice * bundle.qty;
  return { unitPrice, monthly, tier: tierObj, tierMult, promoMult, termMult };
}

function calcOption(opt, promoType, forcedTierIndex = -1) {
  let totalMonthly = 0, totalUnits = 0;
  opt.bundles.forEach(b => { totalUnits += b.qty; });
  opt.bundles.forEach(b => {
    const { monthly } = calcBundle(b, opt.term, promoType, forcedTierIndex, totalUnits);
    totalMonthly += monthly;
  });
  const avgUnit = totalUnits > 0 ? totalMonthly / totalUnits : 0;
  return { totalMonthly, totalUnits, avgUnit };
}

// ── DATA & STATE ──────────────────────────────────────────────────
let screen = 'drafting';


// ── FIELD VALIDATION HELPERS ────────────────────────────────────
function showFieldError(fieldId, msg) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  el.style.borderColor = '#EE001E';
  el.style.borderWidth = '2px';
  let errEl = document.getElementById(fieldId + '-err');
  if (!errEl) {
    errEl = document.createElement('div');
    errEl.id = fieldId + '-err';
    errEl.style.cssText = 'color:#EE001E;font-size:11px;margin-top:4px;';
    el.parentNode.appendChild(errEl);
  }
  errEl.textContent = msg;
}
function clearFieldError(fieldId) {
  const el = document.getElementById(fieldId);
  if (el) { el.style.borderColor = ''; el.style.borderWidth = ''; }
  const errEl = document.getElementById(fieldId + '-err');
  if (errEl) errEl.remove();
}

// ── MARK DEAD DEAL ───────────────────────────────────────────────
function updateMarkDeadBtn() {
  const hasAnyBundle = options.some(opt => opt.bundles && opt.bundles.length > 0);
  ['btn-mark-dead-draft', 'btn-mark-dead-selection'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !hasAnyBundle;
  });
}

function openMarkDeadModal() {
  document.getElementById('mark-dead-overlay').classList.add('open');
  updateMarkDeadConfirmBtn();
}

function closeMarkDeadModal() {
  document.getElementById('mark-dead-overlay').classList.remove('open');
  document.getElementById('dead-reason-select').value = '';
  updateMarkDeadConfirmBtn();
}

function updateMarkDeadConfirmBtn() {
  const select = document.getElementById('dead-reason-select');
  const btn = document.getElementById('btn-confirm-rejection');
  if (!select || !btn) return;
  btn.disabled = !select.value;
}

function confirmMarkDead() {
  const reason = document.getElementById('dead-reason-select')?.value;
  if (!reason) {
    alert('Please select a reason before confirming.');
    return;
  }
  closeMarkDeadModal();
  // Navigate to deal result
  enterDealResult('rejected');
}

// ── APPROVAL SNACKBAR ────────────────────────────────────────────
function updateApprovalSnackbar() {
  const wrap = document.getElementById('approval-snackbar-wrap');
  if (!wrap) return;
  const isForced  = proposalData.forcedTierIndex !== -1;
  const isApproved = proposalData.approvalStatus === 'Approved';
  const isPending  = proposalData.approvalStatus === 'Pending';
  const hasOptions = Array.isArray(options) && options.some(opt => opt.bundles && opt.bundles.length > 0);

  if (!isForced || isApproved) {
    wrap.innerHTML = '';
    // Re-enable all option buttons
    document.querySelectorAll('.btn-select-contract').forEach(btn => {
      btn.disabled = false;
      btn.textContent = 'Select & create contract';
    });
    return;
  }

  if (isPending) {
    wrap.innerHTML = `
      <div class="approval-snackbar success">
        <div class="approval-snackbar-left">
          <span class="material-symbols-outlined approval-snackbar-icon">check_circle</span>
          <div>
          <div class="approval-snackbar-text">Approval request has been processed.</div>
          <div class="approval-snackbar-sub">Your request is under review. You'll be notified once approved.</div>
          </div>
        </div>
      </div>`;
    // Keep buttons disabled while pending
    document.querySelectorAll('.btn-select-contract').forEach(btn => {
      btn.disabled = true;
      btn.textContent = 'Requires approval';
    });
    return;
  }

  // Show warning snackbar
  wrap.innerHTML = `
    <div class="approval-snackbar warning">
      <div class="approval-snackbar-left">
        <span class="material-symbols-outlined approval-snackbar-icon">warning</span>
        <div>
        <div class="approval-snackbar-text">This configuration requires administrative approval.</div>
        <div class="approval-snackbar-sub">${hasOptions ? 'A forced tier override has been applied to this proposal.' : 'Add at least one option before requesting approval.'}</div>
        </div>
      </div>
      <button class="btn-request-approval-snack" onclick="requestApproval()" ${hasOptions ? '' : 'disabled'}>Request approval</button>
    </div>`;

  // Disable all option buttons
  document.querySelectorAll('.btn-select-contract').forEach(btn => {
    btn.disabled = true;
    btn.textContent = 'Requires approval';
  });
}

function requestApproval() {
  if (!Array.isArray(options) || !options.some(opt => opt.bundles && opt.bundles.length > 0)) return;
  proposalData.approvalStatus = 'Pending';
  updateApprovalSnackbar();
}

function openProposalDocFromNav(event) {
  if (event) event.stopPropagation();
  openProposalPdfTab();
}

function openContractDocFromNav(event) {
  if (event) event.stopPropagation();
  openContractPdfTab();
}

// ═══════════════════════════════════════════════════════════════
// HEADER NAV — faithful to Figma 6496:48400
// ═══════════════════════════════════════════════════════════════
function renderNav() {
  const el = document.getElementById('vc-nav');
  if (!el) return;
  touchCurrentStepDates();

  // ── Determine current nav state ──────────────────────────────
  const cSub = (typeof contractSubState !== 'undefined') ? contractSubState : 'pre-send';

  // Map app screen → { phase, activeMajor, activeSub }
  let activeMajor = 'proposal'; // 'proposal' | 'contract' | 'payment' | 'result'
  let activeSub   = 'drafting'; // sub-step key within the active major step

  if      (screen === 'drafting')        { activeMajor = 'proposal';  activeSub = 'drafting'; }
  else if (screen === 'review')          { activeMajor = 'proposal';  activeSub = 'review'; }
  else if (screen === 'selection')       { activeMajor = 'proposal';  activeSub = 'selection'; }
  else if (screen === 'contract-review') {
    // Contract review-send remains under Contract.
    // Signature completed / payment setup moves the active major step to Payment setup.
    if (cSub === 'pre-send' || cSub === 'waiting') {
      activeMajor = 'contract';
      activeSub = cSub === 'pre-send' ? 'review-send' : 'sign-pay';
    } else {
      activeMajor = 'payment';
      activeSub = 'sign-pay';
    }
  }
  else if (screen === 'deal-result')     { activeMajor = 'result'; activeSub = 'result'; }

  // Which majors are done?
  const majorOrder  = ['proposal', 'contract', 'payment', 'result'];
  const activeIdx   = majorOrder.indexOf(activeMajor);
  const majorState  = (key) => {
    const i = majorOrder.indexOf(key);
    if (i < activeIdx)  return 'done';
    if (i === activeIdx) return 'active';
    return 'pending';
  };

  // Dates per major (set when completed)
  const dates = window._navDates || {};

  // ── SVG builders ─────────────────────────────────────────────

  // Checkmark SVG for done circles
  const checkSvg = `<svg width="14" height="11" viewBox="0 0 14 11" fill="none">
    <path d="M1.5 5.5L5.5 9.5L12.5 1.5" stroke="white" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  function escapeHtmlAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeHtmlText(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function substepTooltipHtml(subs, phase = '') {
    if (!Array.isArray(subs) || subs.length === 0) return '';
    return subs.map((s) => {
      const isSkippedProposalReview = phase === 'proposal' && s.key === 'review' && !s.date;
      const displayDate = isSkippedProposalReview ? 'Skipped' : (s.date || '--');
      return `<div class="ns-tooltip-row"><strong>${escapeHtmlText(s.label)}</strong>: ${escapeHtmlText(displayDate)}</div>`;
    }).join('');
  }

  // Info icon with custom tooltip card
  function infoIcon(tooltipHtml = '') {
    return `<span class="ns-info-wrap" role="img" aria-label="Info">
      <svg class="ns-info-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1" fill="none"/>
        <circle cx="8" cy="4.8" r="0.9" fill="currentColor"/>
        <path d="M8 7.2V12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
      <span class="ns-tooltip-card" role="tooltip" aria-label="Step details">
        <span class="ns-tooltip-body">${tooltipHtml || '<div class="ns-tooltip-row">Completion details</div>'}</span>
      </span>
    </span>`;
  }

  function substepTooltip(subs, phase = '', extraHtml = '') {
    const body = `${substepTooltipHtml(subs, phase)}${extraHtml || ''}`;
    return infoIcon(body);
  }

  // Chevron shape — the overlapping arrow separator
  // fill = background of the tab to its LEFT, border matches its right edge context
  function chevron(bgFill, borderColor) {
    return `<div class="ns-chevron">
      <svg viewBox="0 0 12 72" fill="none" xmlns="http://www.w3.org/2000/svg"
        width="12" height="72"
        style="display:block;position:absolute;top:0;left:0;width:12px;height:72px;">
        <path d="M0 24L12 36L0 48Z" fill="${bgFill}"/>
        <path d="M0 0V24L12 36L0 48V72" stroke="${borderColor}" stroke-width="1" fill="none"/>
      </svg>
    </div>`;
  }

  // ── Step circle HTML ─────────────────────────────────────────
  function circle(state, num) {
    if (state === 'done')    return `<div class="ns-circle done">${checkSvg}</div>`;
    if (state === 'active')  return `<div class="ns-circle active">${num}</div>`;
    return `<div class="ns-circle pending">${num}</div>`;
  }

  // ── Step label+date block ────────────────────────────────────
  function stepInfo(state, label, date, showInfo, tooltipHtml = '') {
    const dateStr = date || '--';
    const info    = showInfo ? tooltipHtml : '';
    return `<div class="ns-label ${state}">${label}</div>
            <div class="ns-date">${dateStr}${info}</div>`;
  }

  // ── Sub-steps strip builder ───────────────────────────────────
  function subStrip(subs, activeSubKey, allDone, layout) {
    const isPair = layout === 'pair';
    const activeSubIdx = subs.findIndex(s => s.key === activeSubKey);
    const canOpenSelectionFromReview = screen === 'review';
    let dotsHtml = '';
    subs.forEach((s, i) => {
      let st = allDone || i < activeSubIdx ? 'done'
               : i === activeSubIdx ? 'active' : 'pending';
      if (screen === 'review' && s.key === 'selection' && hasVisitedSelectionStep() && st === 'pending') {
        st = 'done';
      }
      const defaultDate = '--';
      const isClickableSelection = s.key === 'selection' && canOpenSelectionFromReview;
      const isActiveSub = i === activeSubIdx;
      const activeMark = isActiveSub ? ' ns-sub--active' : '';
      const subClass = isClickableSelection
        ? `ns-sub ns-sub--to-selection${activeMark}`
        : `ns-sub${activeMark}`;
      const a11y = isClickableSelection
        ? ' role="link" tabindex="0" title="Open option selection (without sending yet)" onclick="returnToOptionSelectionFromReview()" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();returnToOptionSelectionFromReview();}"'
        : '';
      dotsHtml += `<div class="${subClass}"${a11y}>
        <div class="ns-sub-dot ${st}"></div>
        <div class="ns-sub-name">${s.label}</div>
        <div class="ns-sub-date">${s.date || defaultDate}</div>
      </div>`;
    });
    const subsClass = isPair ? 'ns-subs ns-subs--pair' : 'ns-subs';
    return `<div class="${subsClass}">
      <div class="ns-subs-inner">
        <div class="ns-subs-line"></div>
        ${dotsHtml}
      </div>
    </div>`;
  }

  // ── Build each major step ─────────────────────────────────────

  const proposalSubs = [
    { key:'drafting',   label:'Drafting', date: dates.proposal_drafting },
    { key:'review',     label:'Review & send', date: dates.proposal_review },
    { key:'selection',  label:'Selection', date: dates.proposal_selection },
  ];
  const contractSubs = [
    { key:'review-send', label:'Review & send', date: dates.contract_review_send },
    { key:'sign-pay',    label:'Signature', date: dates.contract_sign_pay },
  ];

  const proposalDocHtml = document.getElementById('prop-doc-viewer')?.innerHTML || '';
  const contractDocHtml =
    document.getElementById('contract-doc-viewer')?.innerHTML ||
    document.getElementById('contract-doc-viewer2')?.innerHTML ||
    '';
  const canViewProposalDoc = !!dates.proposal_review || !!proposalDocHtml.trim();
  const canViewContractDoc = !!dates.contract_review_send || !!contractDocHtml.trim();
  const proposalDocLink = canViewProposalDoc
    ? `<div class="ns-tooltip-doc-row"><button type="button" class="ns-tooltip-doc-link" onclick="openProposalDocFromNav(event)"><span class="material-symbols-outlined ns-tooltip-doc-icon" aria-hidden="true">description</span><span class="ns-tooltip-doc-text">View doc</span></button></div>`
    : '';
  const contractDocLink = canViewContractDoc
    ? `<div class="ns-tooltip-doc-row"><button type="button" class="ns-tooltip-doc-link" onclick="openContractDocFromNav(event)"><span class="material-symbols-outlined ns-tooltip-doc-icon" aria-hidden="true">description</span><span class="ns-tooltip-doc-text">View doc</span></button></div>`
    : '';

  let html = '';

  // ── STEP 1: Proposal ──────────────────────────────────────────
  const pState = majorState('proposal');
  const pChevronFill    = pState === 'active' ? '#F8F3E9'
                        : pState === 'done'   ? '#fff'
                        :                       '#F8F7F5';
  const pChevronBorder  = pState === 'active' ? '#DDDAD4'
                        : pState === 'done'   ? '#DDDAD4'
                        :                       '#DDDAD4';

  if (pState === 'active') {
    // Active Proposal: stone tab + chevron + sub-steps
    html += `<div class="ns-wrap ns-first" style="z-index:4;">
      <div class="ns-cell ns-active" style="padding-right:0;">
        <div class="ns-content">
          ${circle('active', '1')}
          ${stepInfo('active', 'Proposal', '--', false)}
        </div>
      </div>
      ${chevron('#F8F3E9', '#DDDAD4')}
      ${subStrip(proposalSubs, activeSub, false, 'triple')}
      ${chevron('#fff', '#DDDAD4')}
    </div>`;
  } else {
    // Done Proposal: white tab, green circle, date + info
    html += `<div class="ns-wrap ns-first" style="z-index:4;">
      <div class="ns-cell ns-done" style="padding-left:8px;">
        <div class="ns-content">
          ${circle('done', '1')}
          ${stepInfo('done', 'Proposal', dates.proposal_selection || dates.proposal || '--', true, substepTooltip(proposalSubs, 'proposal', proposalDocLink))}
        </div>
      </div>
      ${chevron('#fff', '#DDDAD4')}
    </div>`;
  }

  // ── STEP 2: Contract ──────────────────────────────────────────
  const cState = majorState('contract');

  if (cState === 'active') {
    html += `<div class="ns-wrap active-phase" style="z-index:3;">
      <div class="ns-cell ns-active" style="padding-right:0;padding-left:6px;">
        <div class="ns-content">
          ${circle('active', '2')}
          ${stepInfo('active', 'Contract', dates.contract || '--', false)}
        </div>
      </div>
      ${chevron('#F8F3E9', '#DDDAD4')}
      ${subStrip(contractSubs, activeSub, false, 'pair')}
      ${chevron('#fff', '#DDDAD4')}
    </div>`;
  } else if (cState === 'done') {
    html += `<div class="ns-wrap active-phase" style="z-index:3;">
      <div class="ns-cell ns-done" style="padding-left:6px;">
        <div class="ns-content">
          ${circle('done', '2')}
          ${stepInfo('done', 'Contract', dates.contract || '--', true, substepTooltip(contractSubs, 'contract', contractDocLink))}
        </div>
      </div>
      ${chevron('#fff', '#DDDAD4')}
    </div>`;
  } else {
    html += `<div class="ns-wrap collapsed-phase" style="z-index:3;">
      <div class="ns-cell ns-pending" style="padding-left:6px;">
        <div class="ns-content">
          ${circle('pending', '2')}
          ${stepInfo('pending', 'Contract', '--', false)}
        </div>
      </div>
      ${chevron('#F8F7F5', '#DDDAD4')}
    </div>`;
  }

  // ── STEP 3: Payment setup ─────────────────────────────────────
  const paState = majorState('payment');

  if (paState === 'active') {
    html += `<div class="ns-wrap active-phase" style="z-index:2;">
      <div class="ns-cell ns-active" style="padding-left:16px;">
        <div class="ns-content">
          ${circle('active', '3')}
          ${stepInfo('active', 'Payment setup', dates.payment || '--', false)}
        </div>
      </div>
      ${chevron('#F8F3E9', '#DDDAD4')}
    </div>`;
  } else if (paState === 'done') {
    html += `<div class="ns-wrap active-phase" style="z-index:2;">
      <div class="ns-cell ns-done" style="padding-left:16px;">
        <div class="ns-content">
          ${circle('done', '3')}
          ${stepInfo('done', 'Payment setup', dates.payment || '--', false)}
        </div>
      </div>
      ${chevron('#fff', '#DDDAD4')}
    </div>`;
  } else {
    html += `<div class="ns-wrap collapsed-phase" style="z-index:2;">
      <div class="ns-cell ns-pending" style="padding-left:16px;">
        <div class="ns-content">
          ${circle('pending', '3')}
          ${stepInfo('pending', 'Payment setup', '--', false)}
        </div>
      </div>
      ${chevron('#F8F7F5', '#DDDAD4')}
    </div>`;
  }

  // ── STEP 4: Deal result ───────────────────────────────────────
  // Last step — no chevron, has border
  const rState = majorState('result');
  html += `<div class="ns-wrap collapsed-phase" style="z-index:1;">
    <div class="ns-cell ns-pending ns-last" style="padding-left:16px;${rState==='active'?'background:#F8F3E9;border-bottom:1px solid #000;':rState==='done'?'background:#fff;':''}">
      <div class="ns-content">
        ${circle(rState, '4')}
        ${stepInfo(rState, 'Deal result', rState==='done'?(dates.result||'--'):rState==='active'?(dates.result || '--'):'--', rState==='done')}
      </div>
    </div>
  </div>`;

  el.innerHTML = html;
  updateReviewBackToSelectionHint();
}

// Store nav dates when steps complete
window._navDates = window._navDates || {};
function navToday() {
  return new Date().toLocaleDateString();
}
function touchNavDate(key, overwrite = false) {
  if (!key) return;
  window._navDates = window._navDates || {};
  if (overwrite || !window._navDates[key]) window._navDates[key] = navToday();
}
function touchCurrentStepDates() {
  touchNavDate('proposal_drafting');
  if (screen === 'review') {
    touchNavDate('proposal_review');
  } else if (screen === 'selection') {
    touchNavDate('proposal_selection');
  } else if (screen === 'contract-review') {
    if (contractSubState === 'pre-send' || contractSubState === 'waiting') {
      touchNavDate('contract_review_send');
    } else {
      touchNavDate('contract_sign_pay');
    }
  } else if (screen === 'deal-result') {
    touchNavDate('result');
  }
}

/** True after the user has reached Selection at least once (e.g. sent from Review, or came back from Contract). */
function hasVisitedSelectionStep() {
  return !!(window._navDates && window._navDates['proposal_selection']);
}

function updateReviewBackToSelectionHint() {
  const btn = document.getElementById('btn-skip-to-selection');
  if (!btn) return;
  const canSkip = screen === 'review';
  btn.classList.toggle('hidden', !canSkip);
  btn.disabled = !canSkip;
}

/**
 * From Review: go to Finalize selection without sending the proposal (or again if already sent).
 * Does not run handleSend / success banner.
 */
function returnToOptionSelectionFromReview() {
  if (screen !== 'review') return;
  screen = 'selection';
  document.getElementById('screen-proposal-review').classList.add('hidden');
  document.getElementById('screen-proposal-selection').classList.remove('hidden');
  const sendBtn = document.getElementById('footer-send');
  sendBtn.innerText = 'Select Winning Option';
  sendBtn.classList.add('hidden');
  sendBtn.disabled = true;
  const d2 = document.getElementById('substep-dot-2');
  const d3 = document.getElementById('substep-dot-3');
  const l2 = document.getElementById('substep-line-2');
  const l3 = document.getElementById('substep-label-3');
  if (d2) d2.className = 'prop-step-dot done';
  if (d3) d3.className = 'prop-step-dot active';
  if (l2) l2.className = 'prop-line done';
  if (l3) l3.classList.remove('muted');
  document.getElementById('footer-back')?.classList.remove('hidden');
  document.getElementById('footer-back')?.classList.add('visible');
  renderSelectionOptions();
  updateMarkDeadBtn();
  updateSendBtn();
  renderNav();
}

let options = [];
let nextOptId = 1;

let proposalData = {
  name: 'New Proposal',
  promoType: 'Media',
  forcedTierIndex: -1, 
  approvalStatus: 'None' // 'None', 'Pending', 'Approved'
};
let proposalWasSentToCustomer = false;

let bld = { targetOptId: null, targetBundleId: null, qty: 15, coreKey: null, coreName: null, corePrice: 0, selectedFeatures: [] };

// ── UI HELPERS ──────────────────────────────────
function dismissBanner() {
  const b = document.getElementById('warning-banner');
  if (b) b.classList.add('hidden');
  document.getElementById('vc-body')?.classList.remove('has-banner');
}

function dismissSuccessBanner() {
  document.getElementById('success-banner')?.classList.add('hidden');
  document.getElementById('vc-body')?.classList.remove('has-banner');
}

let bannerTimer = null;
function showSuccessBanner(title, sub) {
  if (bannerTimer) clearTimeout(bannerTimer);
  document.getElementById('success-title').innerText = title;
  document.getElementById('success-sub').innerText = sub;
  document.getElementById('success-banner').classList.remove('hidden');
  document.getElementById('vc-body').classList.add('has-banner');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  bannerTimer = setTimeout(dismissSuccessBanner, 4500);
}
function dismissGlobalBanner() {
  document.getElementById('global-approval-banner').classList.add('hidden');
}

// ── MENU INTERACTION ────────────────────────────
function toggleSidebar(open) {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (open) {
    sidebar.classList.add('active');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  } else {
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function openCaseStudiesPage(event) {
  if (event) event.preventDefault();
  toggleSidebar(false);
  openCaseStudiesModal();
}

function openResourcesPage(event) {
  if (event) event.preventDefault();
  toggleSidebar(false);
  openResourcesModal();
}

function openCaseStudiesModal() {
  const overlay = document.getElementById('case-studies-overlay');
  const frame = document.getElementById('case-studies-frame');
  if (!overlay || !frame) return;
  if (frame.getAttribute('src') === 'about:blank') {
    frame.setAttribute('src', 'case studies/caseStudies.html');
  }
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCaseStudiesModal() {
  const overlay = document.getElementById('case-studies-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function openResourcesModal() {
  const overlay = document.getElementById('resources-overlay');
  const frame = document.getElementById('resources-frame');
  if (!overlay || !frame) return;
  if (frame.getAttribute('src') === 'about:blank') {
    frame.setAttribute('src', 'resources/valuCalResources.html');
  }
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeResourcesModal() {
  const overlay = document.getElementById('resources-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

// ── CONFIGURE BUNDLE ────────────────────────────
function openConfigureBundle(optId, bundleId) {
  bld.targetOptId = optId || null;
  bld.targetBundleId = bundleId || null;
  
  // Set term label based on option
  const term = optId ? (options.find(o => o.id === optId)?.term || 36) : 36;
  document.getElementById('preview-term-badge').innerText = `${term} month term contract`;
  
  // Sync promo select with proposal state
  const currentPromo = proposalData.promoType === 'Media' ? 'media' : 'none';
  selectBundlePromo(currentPromo, true);

  if (bundleId) {
    const opt = options.find(o => o.id === optId);
    const bundle = opt.bundles.find(b => b.id === bundleId);
    bld.qty = bundle.qty;
    bld.selectedFeatures = Array.isArray(bundle.features) ? [...bundle.features] : [];
    selectCore(bundle.coreKey);
    Object.keys(featurePricing).forEach(featureKey => {
      const checkbox = document.getElementById(`addon-${featureKey}`);
      if (checkbox) checkbox.checked = bld.selectedFeatures.includes(featureKey);
    });
    syncAddonControls();
    document.getElementById('qty-display').innerText = bld.qty;
    document.getElementById('btn-create').innerText = 'Update Bundle';
  } else {
    bld.qty = 15;
    bld.coreKey = null;
    bld.selectedFeatures = [];
    document.getElementById('core-label').innerText = 'Select core';
    document.getElementById('core-label').parentElement.classList.remove('selected');
    document.getElementById('qty-display').innerText = bld.qty;
    document.getElementById('addons-section').classList.add('hidden');
    Object.keys(featurePricing).forEach(featureKey => {
      const checkbox = document.getElementById(`addon-${featureKey}`);
      if (checkbox) checkbox.checked = false;
    });
    document.getElementById('btn-create').innerText = 'Create Bundle';
    document.getElementById('btn-create').disabled = true;
    document.getElementById('preview-lines').classList.add('hidden');
    document.getElementById('preview-price-val').innerText = '--';
  }
  
  document.getElementById('bundle-overlay').classList.add('open');
}

function closeBundleModal() { document.getElementById('bundle-overlay').classList.remove('open'); }
function toggleCoreDropdown() { 
  document.getElementById('core-dropdown').classList.toggle('hidden');
  document.getElementById('bundle-promo-dropdown').classList.add('hidden');
}
function togglePromoDropdown() {
  document.getElementById('bundle-promo-dropdown').classList.toggle('hidden');
  document.getElementById('core-dropdown').classList.add('hidden');
}

function isVehicleCore(coreKey) {
  return coreKey === 'vtu' || coreKey === 'vtu-ffc' || coreKey === 'vtu-dual';
}

function isVideoCore(coreKey) {
  return coreKey === 'vtu-ffc' || coreKey === 'vtu-dual';
}

function getFeatureState(coreKey, selectedFeatures = []) {
  const isVehicle = isVehicleCore(coreKey);
  const isVideo = isVideoCore(coreKey);
  const hasEvc = selectedFeatures.includes('evc');
  return {
    'driver-id': { visible: isVehicle, enabled: isVehicle },
    'privacy': { visible: isVehicle, enabled: isVehicle },
    'logbook': { visible: isVehicle, enabled: isVehicle },
    'sd-256': { visible: isVideo, enabled: isVideo },
    'adas': { visible: isVideo, enabled: isVideo },
    'evc': { visible: isVideo, enabled: isVideo },
    'monitor': { visible: isVideo, enabled: isVideo && hasEvc }
  };
}

function syncAddonControls() {
  const section = document.getElementById('addons-section');
  if (!section) return;
  const state = getFeatureState(bld.coreKey, bld.selectedFeatures || []);
  let visibleCount = 0;
  Object.keys(featurePricing).forEach(featureKey => {
    const checkbox = document.getElementById(`addon-${featureKey}`);
    const row = checkbox ? checkbox.closest('.addon-checkbox') : null;
    if (!checkbox || !row) return;
    const cfg = state[featureKey] || { visible: false, enabled: false };
    if (cfg.visible) visibleCount += 1;
    row.style.display = cfg.visible ? 'flex' : 'none';
    checkbox.disabled = !cfg.enabled;
    if (!cfg.visible || !cfg.enabled) checkbox.checked = false;
  });
  section.style.display = visibleCount > 0 ? 'block' : 'none';
  bld.selectedFeatures = Object.keys(featurePricing).filter(featureKey => {
    const checkbox = document.getElementById(`addon-${featureKey}`);
    return checkbox && checkbox.checked;
  });
}

function onAddonChange() {
  syncAddonControls();
  updateBundlePreview();
}

function selectBundlePromo(val, silent = false) {
  const labelEl = document.getElementById('bundle-promo-label');
  const btnEl = document.getElementById('bundle-promo-btn');
  const text = val === 'media' ? 'Media Promo (−20%)' : 'Select';
  
  labelEl.innerText = text;
  if (val !== 'none') btnEl.classList.add('selected');
  else btnEl.classList.remove('selected');
  
  document.getElementById('bundle-promo-dropdown').classList.add('hidden');
  if (!silent) updateBundlePreview();
}

function selectCore(key) {
  const core = corePricing[key];
  bld.coreKey = key;
  bld.coreName = core.name;
  bld.corePrice = core.price;
  document.getElementById('core-label').innerText = core.name;
  document.getElementById('core-label').parentElement.classList.add('selected');
  document.getElementById('core-dropdown').classList.add('hidden');
  document.getElementById('addons-section').classList.remove('hidden');
  document.getElementById('addons-section').style.display = 'block';
  bld.selectedFeatures = [];
  Object.keys(featurePricing).forEach(featureKey => {
    const checkbox = document.getElementById(`addon-${featureKey}`);
    if (checkbox) checkbox.checked = false;
  });
  syncAddonControls();
  document.getElementById('btn-create').disabled = false;
  updateBundlePreview();
}

function changeQty(d) {
  bld.qty = Math.max(1, bld.qty + d);
  document.getElementById('qty-display').innerText = bld.qty;
  updateBundlePreview();
}

function updateBundlePreview() {
  if(!bld.coreKey) return;
  
  const optId = bld.targetOptId;
  const term = optId ? (options.find(o => o.id === optId)?.term || 36) : 36;
  const promoVal = document.getElementById('bundle-promo-label').innerText;
  const promoType = promoVal.includes('Media') ? 'Media' : 'Standard';
  const forcedTier = proposalData.forcedTierIndex;
  
  syncAddonControls();
  const addOnBase = (bld.selectedFeatures || []).reduce((sum, featureKey) => sum + (featurePricing[featureKey] || 0), 0);
  const basePrice = bld.corePrice + addOnBase;
  const dummyBundle = { basePrice, qty: bld.qty, coreKey: bld.coreKey };
  const { monthly } = calcBundle(dummyBundle, term, promoType, forcedTier);
  
  document.getElementById('preview-price-val').innerText = Math.round(monthly).toLocaleString();
  document.getElementById('preview-lines').classList.remove('hidden');
  const featureLines = (bld.selectedFeatures || []).map(featureKey =>
    `<div class="preview-line"><span>${featureLabels[featureKey] || featureKey}</span><span>+$${featurePricing[featureKey].toFixed(2)}</span></div>`
  ).join('');
  document.getElementById('preview-lines').innerHTML = `
    <div class="preview-line"><span>${bld.coreName}</span><span>$${bld.corePrice.toFixed(2)}</span></div>
    ${featureLines}
    <div class="preview-line"><strong>Bundle subtotal (base)</strong><strong>$${basePrice.toFixed(2)}</strong></div>
  `;
}

function createBundle() {
  const wasEditingExistingBundle = !!bld.targetOptId && !!bld.targetBundleId;
  const wasAddingToExistingOption = !!bld.targetOptId && !bld.targetBundleId;
  const optId = bld.targetOptId || nextOptId++;
  syncAddonControls();
  const selectedFeatures = [...(bld.selectedFeatures || [])];
  const addOnBase = selectedFeatures.reduce((sum, featureKey) => sum + (featurePricing[featureKey] || 0), 0);
  const bundleData = { 
    id: bld.targetBundleId || Date.now(), 
    coreKey: bld.coreKey, 
    coreName: bld.coreName, 
    basePrice: bld.corePrice + addOnBase,
    baseCorePrice: bld.corePrice,
    features: selectedFeatures,
    qty: bld.qty 
  };
  
  if (bld.targetOptId) {
     const opt = options.find(o => o.id === bld.targetOptId);
     if(opt) {
       if (bld.targetBundleId) {
         const idx = opt.bundles.findIndex(b => b.id === bld.targetBundleId);
         opt.bundles[idx] = bundleData;
       } else {
         opt.bundles.push(bundleData);
       }
     }
  } else {
     options.push({ id: optId, name: 'Option ' + (options.length + 1), term: 36, bundles: [bundleData] });
  }
  
  closeBundleModal();
  renderOptions();
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('options-grid').classList.remove('hidden');
  const optionNumber = options.findIndex((o) => o.id === optId) + 1;
  if (!bld.targetOptId) {
    logProposalEvent('Option created', `Option ${Math.max(1, optionNumber)} was created.`);
  } else if (wasEditingExistingBundle) {
    logProposalEvent('Option edited', `Option ${Math.max(1, optionNumber)} configuration was updated.`);
  } else if (wasAddingToExistingOption) {
    logProposalEvent('Option edited', `A new bundle was added to Option ${Math.max(1, optionNumber)}.`);
  }
}

// ── RENDER OPTIONS ────────────────────────────
function renderOptions() {
  setTimeout(() => { if (typeof updateApprovalSnackbar === 'function') { updateApprovalSnackbar(); updateMarkDeadBtn(); } }, 0);
  const grid = document.getElementById('options-grid');
  grid.innerHTML = '';

  // Update Header Labels
  const nameEls = document.querySelectorAll('.header-prop-name');
  nameEls.forEach(el => el.innerText = proposalData.name);
  
  const promoEls = document.querySelectorAll('.header-prop-promo');
  promoEls.forEach(el => el.innerText = proposalData.promoType);
  
  // Tier Label with inline Approval Required if forced
  const tierEls = document.querySelectorAll('.header-prop-tier');
  const tierText = proposalData.forcedTierIndex === -1 ? 'Standard' : volumeTiers[proposalData.forcedTierIndex].label;
  const isForced = proposalData.forcedTierIndex !== -1;
  const isApproved = proposalData.approvalStatus === 'Approved';
  
  tierEls.forEach(el => {
    if (isForced && !isApproved) {
      el.innerHTML = `${tierText} <span class="tier-status tier-status-pending">(Approval required)</span>`;
    } else if (isForced && isApproved) {
      el.innerHTML = `${tierText} <span class="tier-status tier-status-approved">(Approved)</span>`;
    } else {
      el.innerText = tierText;
    }
  });

  // Hide Global Approval Banner as requested (moving to inline indicator)
  const banner = document.getElementById('global-approval-banner');
  if (banner) banner.classList.add('hidden');
  
  // Ensure layout doesn't keep extra padding if no other banners are present
  const warningBanner = document.getElementById('warning-banner');
  if (!warningBanner || warningBanner.classList.contains('hidden')) {
    document.getElementById('vc-body').classList.remove('has-banner');
  }

  // Update button state
  updateSendBtn();

  options.forEach((opt, i) => {
    const { totalMonthly, totalUnits, avgUnit } = calcOption(opt, proposalData.promoType, proposalData.forcedTierIndex);
    const tierObj = getEffectiveTier(totalUnits, proposalData.forcedTierIndex);
    const tier = tierObj;
    const skip = tier.index - tier.naturalIndex;
    const requiresApproval = skip > 0 && proposalData.approvalStatus !== 'Approved';

    let bundlesHtml = '';
    opt.bundles.forEach(b => {
      const { unitPrice, monthly, tier: bt } = calcBundle(b, opt.term, proposalData.promoType, proposalData.forcedTierIndex, totalUnits);
      const hasDisc   = bt.discount > 0;
      const isVideo   = b.coreKey === 'vtu-ffc' || b.coreKey === 'vtu-dual';
      const promoApplied = proposalData.promoType === 'Media' && isVideo;
      const featureKeys = Array.isArray(b.features) ? b.features : [];
      const videoFeatureKeys = ['sd-256', 'adas', 'evc', 'monitor'];
      const vehicleFeatureKeys = ['driver-id', 'privacy', 'logbook'];
      const videoFeatures = featureKeys
        .filter(k => videoFeatureKeys.includes(k))
        .map(k => featureLabels[k] || k);
      const vehicleFeatures = featureKeys
        .filter(k => vehicleFeatureKeys.includes(k))
        .map(k => featureLabels[k] || k);
      const featureMeta = `
        ${videoFeatures.length ? `<div class="bundle-feature-line"><strong>Video:</strong> ${videoFeatures.join(', ')}</div>` : ''}
        ${vehicleFeatures.length ? `<div class="bundle-feature-line"><strong>Vehicle features:</strong> ${vehicleFeatures.join(', ')}</div>` : ''}
      `;
      let discBadges = '';
      if (hasDisc)    discBadges += `<span class="disc-badge">${(bt.discount*100)}% Volume disc</span> `;
      if (promoApplied) discBadges += `<span class="disc-badge" style="background:#0076CE">Media Promo −20%</span>`;

      bundlesHtml += `
        <div class="bundle-row">
          <div class="bundle-row-actions">
             <button class="btn-circle-action" onclick="openConfigureBundle(${opt.id}, ${b.id})">
               <span class="material-symbols-outlined" style="font-size:18px;">edit</span>
             </button>
             <button class="btn-circle-action" onclick="deleteBundle(${opt.id}, ${b.id})">
               <span class="material-symbols-outlined" style="font-size:18px;">delete</span>
             </button>
          </div>
          <div class="bundle-row-name">${b.coreName} <span style="float:right;font-weight:400;font-size:11px;color:var(--gray-600)">QTY: ${b.qty}</span></div>
          ${featureMeta}
          <div class="bundle-row-price">${formatMoney(monthly)}<span>/month</span></div>
          <div class="bundle-row-unit">${formatMoney(unitPrice)}/unit</div>
          <div style="margin-top:6px;">${discBadges}</div>
        </div>`;
    });

    let tierBadgeHtml = '';
    if (tier && tier.discount > 0) {
      tierBadgeHtml = `<span class="tier-badge">Tier ${tier.label}</span>`;
    } else if (totalUnits > 0) {
      tierBadgeHtml = `<span class="tier-badge" style="background:var(--gray-100);color:var(--gray-600);">Tier ${tier ? tier.label : '1-9'}</span>`;
    }

    const card = document.createElement('div');
    card.className = 'option-card';
    
    let actionHtml = '';
    if (requiresApproval) {
      const role = getApprovalRole(skip);
      const isPending = proposalData.approvalStatus === 'Pending';
      actionHtml = `
        <button class="btn-request-approval ${isPending ? 'approved' : ''}" onclick="handleRequestApproval()">
          ${isPending ? 'Approval Requested' : 'Request approval'}
        </button>
        <div class="approval-sublabel ${isPending ? 'approved' : ''}">
          ${isPending ? 'Awaiting ' + role + ' decision' : 'Requires ' + role + ' Approval'}
        </div>
      `;
    } else {
      actionHtml = `
        <button class="btn-select-contract btn-select-contract--lg" onclick="selectOption(${opt.id})">Select &amp; create contract</button>
        <div class="select-note">Selecting on behalf of client — goes directly to Contract management</div>
      `;
    }

    card.innerHTML = `
      <div class="option-card-header">
         <span>Option ${i+1}</span>
         <div class="option-card-header-actions">
          <button title="Delete" onclick="deleteOption(${opt.id})"><span class="material-symbols-outlined" style="color:white;font-size:14px;">delete</span></button>
          <button title="Duplicate" onclick="duplicateOption(${opt.id})"><span class="material-symbols-outlined" style="color:white;font-size:14px;">content_copy</span></button>
         </div>
      </div>
      <div class="option-card-body">
         <div class="field-label">Contract term</div>
         <select class="term-select" onchange="updateTerm(${opt.id}, this.value)">
           <option value="24" ${opt.term==24?'selected':''}>24 months</option>
           <option value="36" ${opt.term==36?'selected':''}>36 months</option>
           <option value="48" ${opt.term==48?'selected':''}>48 months</option>
           <option value="60" ${opt.term==60?'selected':''}>60 months</option>
         </select>
         <div class="monthly-total">
           <div class="field-label" style="margin-top:12px;display:flex;align-items:center;justify-content:space-between;">
             <span>Monthly total</span>
             <div style="display:flex; align-items:center; gap:8px;">
               ${tierBadgeHtml}
               <span style="color:var(--gray-600); font-size:11px; font-weight:400; text-transform:uppercase;">QTY: ${totalUnits}</span>
             </div>
           </div>
           <div class="monthly-amount">${formatMoney(totalMonthly)}<span>/month</span></div>
           <div class="per-unit">${formatMoney(avgUnit)}/unit (avg)</div>
         </div>
         
         ${actionHtml}

         <div class="bundles-list">
            <div class="bundles-label"><span class="material-symbols-outlined" style="font-size:20px;">package_2</span> Bundle configured (${opt.bundles.length})</div>
            ${bundlesHtml || '<div style="font-size:11px;color:var(--gray-400);padding:16px;text-align:center;">No Bundles yet</div>'}
            <button class="btn-add-bundle" onclick="openConfigureBundle(${opt.id})">+ Add Bundle</button>
         </div>
      </div>`;
    grid.appendChild(card);
  });

  const addCard = document.createElement('div');
  addCard.className = 'add-option-card';
  addCard.onclick = () => openConfigureBundle();
  addCard.innerHTML = `+ Add option ${options.length + 1}`;
  grid.appendChild(addCard);
}

// ── EDIT PROPOSAL MODAL ─────────────────────────
function openEditProposalModal() {
  document.getElementById('edit-prop-name').value = proposalData.name;
  document.getElementById('edit-prop-promo').value = proposalData.promoType;
  document.getElementById('edit-prop-tier').value = proposalData.forcedTierIndex;
  document.getElementById('edit-proposal-overlay').classList.add('open');
}

function closeEditProposalModal() {
  document.getElementById('edit-proposal-overlay').classList.remove('open');
}

function saveProposalInfo() {
  proposalData.name = document.getElementById('edit-prop-name').value;
  proposalData.promoType = document.getElementById('edit-prop-promo').value;
  const oldTier = proposalData.forcedTierIndex;
  proposalData.forcedTierIndex = parseInt(document.getElementById('edit-prop-tier').value);
  
  if(oldTier !== proposalData.forcedTierIndex) {
    proposalData.approvalStatus = 'None';
    updateApprovalSnackbar();
  }

  closeEditProposalModal();
  renderOptions();
  logProposalEvent('Option edited', 'Proposal information was updated.');
}

function handleRequestApproval() {
  if (proposalData.approvalStatus === 'Approved') return;
  proposalData.approvalStatus = 'Pending';
  renderOptions();
  if (screen === 'selection') renderSelectionOptions();
  setTimeout(() => {
    proposalData.approvalStatus = 'Approved';
    renderOptions();
    if (screen === 'selection') renderSelectionOptions();
    showSuccessBanner('The manager approved', 'The volume tier override has been authorized and is now active for this proposal.');
  }, 4000);
}

function toggleMoreMenu() {
  let screenId = 'more-menu-draft';
  if (screen === 'review') screenId = 'more-menu-review';
  if (screen === 'selection') screenId = 'more-menu-selection';
  const menu = document.getElementById(screenId);
  if (menu) {
    menu.classList.toggle('hidden');
    if (screen === 'selection') {
      const trigger = document.querySelector('#screen-proposal-selection .btn-more-dots');
      const isOpen = !menu.classList.contains('hidden');
      trigger?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }
  }
}

function closeSelectionMoreMenu() {
  const menu = document.getElementById('more-menu-selection');
  if (menu) {
    menu.classList.add('hidden');
    const trigger = document.querySelector('#screen-proposal-selection .btn-more-dots');
    trigger?.setAttribute('aria-expanded', 'false');
  }
}

function selectionMenuEditProposal() {
  closeSelectionMoreMenu();
  // Editing from Selection returns user to Drafting first.
  screen = 'drafting';
  document.getElementById('screen-proposal-selection').classList.add('hidden');
  document.getElementById('screen-proposal-review').classList.add('hidden');
  document.getElementById('screen-contract').classList.add('hidden');
  document.getElementById('screen-deal-result').classList.add('hidden');
  document.getElementById('screen-drafting').classList.remove('hidden');
  document.getElementById('vc-body').style.paddingTop = '159px';
  document.getElementById('success-banner').style.top = '159px';
  const sendBtn = document.getElementById('footer-send');
  sendBtn.classList.remove('hidden');
  sendBtn.innerText = 'Review and Send';
  sendBtn.onclick = handleSend;
  updateSendBtn();
  const backBtn = document.getElementById('footer-back');
  backBtn.classList.remove('visible');
  renderOptions();
  const hasOptions = Array.isArray(options) && options.length > 0;
  document.getElementById('empty-state')?.classList.toggle('hidden', hasOptions);
  document.getElementById('options-grid')?.classList.toggle('hidden', !hasOptions);
  updateMarkDeadBtn();
  renderNav();
}

function viewProposalHistory() {
  closeSelectionMoreMenu();
  document.getElementById('more-menu-contract')?.classList.add('hidden');
  document.getElementById('more-menu-contract2')?.classList.add('hidden');
  openProposalHistoryModal();
}

function markDealDead() {
  alert('Deal marked as dead');
  let screenId = 'more-menu-draft';
  if (screen === 'review') screenId = 'more-menu-review';
  if (screen === 'selection') screenId = 'more-menu-selection';
  const menu = document.getElementById(screenId);
  if (menu) menu.classList.add('hidden');
}

// ── OPTION ACTIONS ──────────────────────────────
function duplicateOption(id) {
  const src = options.find(o => o.id === id);
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = nextOptId++;
  copy.name = 'Option ' + (options.length + 1);
  options.push(copy);
  renderOptions();
  const optionNumber = options.findIndex((o) => o.id === copy.id) + 1;
  logProposalEvent('Option created', `Option ${Math.max(1, optionNumber)} was duplicated.`);
}

function deleteBundle(optId, bundleId) {
  const opt = options.find(o => o.id === optId);
  if (opt) {
    opt.bundles = opt.bundles.filter(b => b.id !== bundleId);
    renderOptions();
  }
}

function updateTerm(id, val) {
  const opt = options.find(o => o.id === id);
  if (opt) {
    opt.term = parseInt(val);
    renderOptions();
    const optionNumber = options.findIndex((o) => o.id === id) + 1;
    logProposalEvent('Option edited', `Option ${Math.max(1, optionNumber)} term was updated to ${val} months.`);
  }
}

function selectOption(id) {
  bld.selectedOptionId = id;
  const optionNumber = options.findIndex((o) => o.id === id) + 1;
  logProposalEvent('Option selected', `Option ${Math.max(1, optionNumber)} was selected.`);
  if (!isAccountReady()) {
    accountSetupOpenedFromOptionSelection = true;
    requestAnimationFrame(() => openAccountSetupModal());
    return;
  }
  accountSetupOpenedFromOptionSelection = false;
  openConfirmSelectionModal();
}

// ══════════════════════════════════════════════════════════════
// FULFILLMENT MODULE (Advanced)
// ══════════════════════════════════════════════════════════════
let ffMainTab   = 'addresses';
let ffActiveTab = 'addresses';
let ffReturnPending = false;

// Addresses & Contacts
let ffAddresses = [{ id: 1, saved: false, addr1: '', addr2: '', city: '', state: '', zip: '', country: 'United States' }];
let ffContacts  = [{ id: 1, saved: false, name: '', phone: '', email: '' }];

// Vehicles — keyed by bundle id
// Bundles come from the active selected option
let ffVehicles  = {};
let ffSelected  = [];
let ffBulkOn    = false;
let ffBulkType  = '';
let ffBulkF     = { shippingId:'', shippingContactId:'', installAddressId:'', installContactId:'', sameAsShipping: false };
let ffInputMethod = 'vin';
let ffVinInput  = '';
let ffYmm       = { year:'', make:'', model:'', qty: 1 };
let ffDot       = '';
let ffSearch    = '';
let ffBundleForms = {};

function getFFBundleForm(bundleId) {
  if (!ffBundleForms[bundleId]) {
    ffBundleForms[bundleId] = {
      shipAddr1: '',
      shipAddr2: '',
      shipCity: '',
      shipCountry: 'United States',
      shipZip: '',
      contactName: '',
      contactPhone: '',
      contactEmail: '',
      installSameAsShipping: true,
      shipAddressId: '',
      shipContactId: '',
      installAddressId: '',
      installContactId: '',
    };
  }
  return ffBundleForms[bundleId];
}

function getBundles() {
  const opt = options.find(o => o.id === (typeof selectedOptionId !== 'undefined' ? selectedOptionId : null));
  if (opt && opt.bundles && opt.bundles.length > 0) return opt.bundles;
  // Fallback: use first option with bundles
  const fallback = options.find(o => o.bundles && o.bundles.length > 0);
  if (fallback) return fallback.bundles;
  return [{ id: 'default', coreName: 'Bundle 1', qty: 10 }];
}

function ensureVehicleArrays() {
  getBundles().forEach(b => { if (!ffVehicles[b.id]) ffVehicles[b.id] = []; });
}

function openFulfillmentModal() {
  ensureVehicleArrays();
  ffMainTab = 'vehicles';
  ffActiveTab = getBundles()[0]?.id || 'default';
  ffReturnPending = false;
  document.getElementById('fftab-addresses').className = 'ff-tab';
  document.getElementById('fftab-vehicles').className  = 'ff-tab active';
  document.getElementById('fulfillment-overlay').classList.add('open');
  renderFF();
}

function closeFulfillmentModal() {
  document.getElementById('fulfillment-overlay').classList.remove('open');
}

function switchFulfillmentMainTab(tab) {
  ffMainTab = tab;
  ffActiveTab = tab === 'addresses' ? 'addresses' : (getBundles()[0]?.id || 'default');
  ffReturnPending = false;
  document.getElementById('fftab-addresses').className = 'ff-tab' + (tab === 'addresses' ? ' active' : '');
  document.getElementById('fftab-vehicles').className  = 'ff-tab' + (tab === 'vehicles'  ? ' active' : '');
  renderFF();
}

function switchFulfillmentTab(tabId) { /* legacy compat — no-op */ }

function ffSetTab(tab, pending = false) {
  ffActiveTab = tab;
  if (pending) ffReturnPending = true;
  renderFF();
}
function ffGoToAddresses(pending = false) {
  ffMainTab = 'addresses'; ffActiveTab = 'addresses';
  if (pending) ffReturnPending = true;
  document.getElementById('fftab-addresses').className = 'ff-tab active';
  document.getElementById('fftab-vehicles').className  = 'ff-tab';
  renderFF();
}
function ffGoToVehicles() {
  ffMainTab = 'vehicles';
  ffActiveTab = getBundles()[0]?.id || 'default';
  ffReturnPending = false;
  document.getElementById('fftab-addresses').className = 'ff-tab';
  document.getElementById('fftab-vehicles').className  = 'ff-tab active';
  renderFF();
}

function renderFF() { renderFFSidebar(); renderFFContent(); }

// ── SIDEBAR ──
function renderFFSidebar() {
  const s = document.getElementById('ff-sidebar');
  const bundles = getBundles();
  s.innerHTML = bundles.map(b => {
    const bv = ffVehicles[b.id] || [];
    const ready = bv.filter(v => isVehicleReadyForBundle(v, b)).length;
    return `<div class="ff-sidebar-item ${ffActiveTab===b.id?'active':''}" onclick="ffSetTab('${b.id}')">
      <div class="ff-sidebar-item-label">${b.coreName}</div>
      <div class="ff-sidebar-item-sub">${ready} / ${b.qty} assigned</div>
    </div>`;
  }).join('');
}

// ── CONTENT ──
function renderFFContent() {
  const c = document.getElementById('ff-body');
  const activeBundleId = ffActiveTab === 'addresses' || ffActiveTab === 'contacts'
    ? (getBundles()[0]?.id || 'default')
    : ffActiveTab;
  c.innerHTML = renderFFVehicles(activeBundleId);
}

// ── ADDRESSES ──
function renderFFAddresses() {
  const cards = ffAddresses.map((a, i) => `
    <div class="ff-card">
      <div class="ff-card-header">
        <div class="ff-card-title">Location ${i+1}</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="${a.saved?'ff-badge-saved':'ff-badge-unsaved'}">${a.saved?'✓ Saved':'Not saved'}</span>
          ${ffAddresses.length > 1 ? `<button class="ff-remove-btn" onclick="ffRemoveAddress(${a.id})"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>` : ''}
        </div>
      </div>
      <div class="ff-form-grid">
        <div class="ff-form-group" style="grid-column:span 2"><label class="ff-label">Address line 1 *</label>
          <input class="ff-input" type="text" value="${a.addr1}" placeholder="123 Main St" onchange="ffUpdateAddr(${a.id},'addr1',this.value)" ${a.saved?'disabled':''}></div>
        <div class="ff-form-group" style="grid-column:span 2"><label class="ff-label">Address line 2</label>
          <input class="ff-input" type="text" value="${a.addr2}" placeholder="Suite, floor…" onchange="ffUpdateAddr(${a.id},'addr2',this.value)" ${a.saved?'disabled':''}></div>
        <div class="ff-form-group"><label class="ff-label">Country</label>
          <select class="ff-select" onchange="ffUpdateAddr(${a.id},'country',this.value)" ${a.saved?'disabled':''}>
            <option ${(a.country||'United States')==='United States'?'selected':''}>United States</option>
            <option ${a.country==='Canada'?'selected':''}>Canada</option>
            <option ${a.country==='Mexico'?'selected':''}>Mexico</option>
          </select></div>
        <div class="ff-form-group"><label class="ff-label">City</label>
          <input class="ff-input" type="text" value="${a.city}" placeholder="Tampa" onchange="ffUpdateAddr(${a.id},'city',this.value)" ${a.saved?'disabled':''}></div>
        <div class="ff-form-group"><label class="ff-label">State</label>
          <input class="ff-input" type="text" value="${a.state}" placeholder="FL" onchange="ffUpdateAddr(${a.id},'state',this.value)" ${a.saved?'disabled':''}></div>
        <div class="ff-form-group"><label class="ff-label">Zip *</label>
          <input class="ff-input" type="text" value="${a.zip}" placeholder="33602" onchange="ffUpdateAddr(${a.id},'zip',this.value)" ${a.saved?'disabled':''}></div>
      </div>
      <div class="ff-action-row">
        <span style="font-size:12px;color:var(--gray-600);">${a.saved?'':'Fill address and zip to save'}</span>
        <button class="ff-save-btn ${a.saved?'done':''}" onclick="ffSaveAddress(${a.id})">${a.saved?'✓ Saved':'Validate &amp; save'}</button>
      </div>
    </div>`).join('');

  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">
      <div><div style="font-size:15px;font-weight:700;margin-bottom:3px;">Account locations</div>
        <div style="font-size:12px;color:var(--gray-600);">Addresses used for shipping and installation.</div></div>
      ${ffReturnPending ? `<button class="ff-return-btn" onclick="ffGoToVehicles()">↩ Return to Vehicles</button>` : ''}
    </div>
    ${cards}
    <button class="ff-add-btn" onclick="ffAddAddress()">+ Add another location</button>`;
}

function ffUpdateAddr(id, f, v) { ffAddresses = ffAddresses.map(a => a.id===id ? {...a,[f]:v} : a); }
function ffSaveAddress(id) {
  const a = ffAddresses.find(x => x.id===id);
  if (!a.addr1 || !a.zip) { alert('Please fill address line 1 and zip.'); return; }
  const name = a.addr1 + (a.city?', '+a.city:'') + (a.zip?' '+a.zip:'');
  ffAddresses = ffAddresses.map(x => x.id===id ? {...x, saved:true, name} : x);
  renderFF();
}
function ffRemoveAddress(id) { if (ffAddresses.length>1) { ffAddresses=ffAddresses.filter(a=>a.id!==id); renderFF(); } }
function ffAddAddress() { ffAddresses.push({id:Date.now(),saved:false,name:'',addr1:'',addr2:'',city:'',state:'',zip:'',country:'United States'}); renderFF(); }

// ── CONTACTS ──
function renderFFContacts() {
  const cards = ffContacts.map((c, i) => `
    <div class="ff-card">
      <div class="ff-card-header">
        <div class="ff-card-title">Contact ${i+1}</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="${c.saved?'ff-badge-saved':'ff-badge-unsaved'}">${c.saved?'✓ Saved':'Not saved'}</span>
          ${ffContacts.length>1?`<button class="ff-remove-btn" onclick="ffRemoveContact(${c.id})"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>`:''}
        </div>
      </div>
      <div class="ff-form-grid">
        <div class="ff-form-group"><label class="ff-label">Name *</label>
          <input class="ff-input" type="text" value="${c.name}" placeholder="John Smith" onchange="ffUpdateContact(${c.id},'name',this.value)" ${c.saved?'disabled':''}></div>
        <div class="ff-form-group"><label class="ff-label">Phone</label>
          <input class="ff-input" type="text" value="${c.phone}" placeholder="+1 (555) 000-0000" onchange="ffUpdateContact(${c.id},'phone',this.value)" ${c.saved?'disabled':''}></div>
        <div class="ff-form-group" style="grid-column:span 2"><label class="ff-label">Email</label>
          <input class="ff-input" type="email" value="${c.email}" placeholder="john@company.com" onchange="ffUpdateContact(${c.id},'email',this.value)" ${c.saved?'disabled':''}></div>
      </div>
      <div class="ff-action-row"><span></span>
        <button class="ff-save-btn ${c.saved?'done':''}" onclick="ffSaveContact(${c.id})">${c.saved?'✓ Saved':'Save contact'}</button>
      </div>
    </div>`).join('');

  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">
      <div><div style="font-size:15px;font-weight:700;margin-bottom:3px;">Account contacts</div>
        <div style="font-size:12px;color:var(--gray-600);">Contacts for receiving and coordinating installation.</div></div>
      ${ffReturnPending ? `<button class="ff-return-btn" onclick="ffGoToVehicles()">↩ Return to Vehicles</button>` : ''}
    </div>
    ${cards}
    <button class="ff-add-btn" onclick="ffAddContact()">+ Add another contact</button>`;
}

function ffUpdateContact(id,f,v){ffContacts=ffContacts.map(c=>c.id===id?{...c,[f]:v}:c);}
function ffSaveContact(id){
  const c=ffContacts.find(x=>x.id===id);
  if(!c.name){alert('Please enter a name.');return;}
  ffContacts=ffContacts.map(x=>x.id===id?{...x,saved:true}:x);renderFF();
}
function ffRemoveContact(id){if(ffContacts.length>1){ffContacts=ffContacts.filter(c=>c.id!==id);renderFF();}}
function ffAddContact(){ffContacts.push({id:Date.now(),saved:false,name:'',phone:'',email:''});renderFF();}

function ffUpdateBundleForm(bundleId, field, value) {
  const form = getFFBundleForm(bundleId);
  form[field] = value;
}

function ffValidateBundleDetails(bundleId) {
  const form = getFFBundleForm(bundleId);
  if (!form.shipAddr1 || !form.shipCity || !form.shipZip) {
    alert('Please complete shipping address (Address 1, City, Zip/Postal Code).');
    return;
  }
  if (!form.contactName || !form.contactPhone) {
    alert('Please complete contact name and phone.');
    return;
  }

  const addressId = Date.now();
  const addressName = `${form.shipAddr1}${form.shipCity ? ', ' + form.shipCity : ''}${form.shipZip ? ' ' + form.shipZip : ''}`;
  ffAddresses.push({
    id: addressId,
    saved: true,
    name: addressName,
    addr1: form.shipAddr1,
    addr2: form.shipAddr2,
    city: form.shipCity,
    state: '',
    zip: form.shipZip,
    country: form.shipCountry || 'United States',
  });

  const contactId = Date.now() + 1;
  ffContacts.push({
    id: contactId,
    saved: true,
    name: form.contactName,
    phone: form.contactPhone,
    email: form.contactEmail,
  });

  form.shipAddressId = String(addressId);
  form.shipContactId = String(contactId);
  form.installAddressId = form.installSameAsShipping ? String(addressId) : form.installAddressId;
  form.installContactId = form.installSameAsShipping ? String(contactId) : form.installContactId;

  showSuccessBanner('Address validated', 'Shipping and contact details were saved for assignment.');
  renderFFContent();
}

// ── VEHICLES ──
function bundleRequiresInstallation(bundle) {
  return bundle && bundle.coreKey !== 'asset-nonpowered';
}

function isVehicleReadyForBundle(v, bundle) {
  const hasShipping = v.shippingId && v.shippingContactId && v.vehicleName;
  if (!hasShipping) return false;
  if (!bundleRequiresInstallation(bundle)) return true;
  return v.installAddressId && v.installContactId;
}

function getGlobalVinSet(excludeBundleId = null, excludeVehicleId = null) {
  const set = new Set();
  Object.keys(ffVehicles).forEach(bundleId => {
    if (excludeBundleId && String(bundleId) === String(excludeBundleId)) return;
    (ffVehicles[bundleId] || []).forEach(v => {
      if (excludeVehicleId && String(v.id) === String(excludeVehicleId)) return;
      if (!v.vin) return;
      set.add(v.vin.trim().toUpperCase());
    });
  });
  return set;
}

function canAddVehiclesToBundle(bundleId) {
  const savedA = ffAddresses.filter(a => a.saved).length;
  const savedC = ffContacts.filter(c => c.saved).length;
  if (savedA === 0 || savedC === 0) {
    alert('Please save at least one address and one contact before assigning vehicles.');
    ffGoToAddresses(true);
    return false;
  }
  const bundle = getBundles().find(b => String(b.id) === String(bundleId));
  const used = (ffVehicles[bundleId] || []).length;
  if (bundle && used >= bundle.qty) {
    alert(`Quantity cap reached for this bundle (${bundle.qty}).`);
    return false;
  }
  return true;
}

function renderFFVehicles(bundleId) {
  const bundle   = getBundles().find(b => b.id === bundleId) || { id: bundleId, coreName: 'Bundle', qty: 10 };
  const bv       = ffVehicles[bundleId] || [];
  const form     = getFFBundleForm(bundleId);
  const requiresInstall = bundleRequiresInstallation(bundle);
  if (!requiresInstall && ffBulkType === 'installation') ffBulkType = '';
  const readyN   = bv.filter(v => isVehicleReadyForBundle(v, bundle)).length;
  const partialN = bv.filter(v => (v.shippingId||v.shippingContactId||v.installAddressId||v.installContactId||v.vehicleName) && !isVehicleReadyForBundle(v, bundle)).length;
  const selInB   = ffSelected.filter(id => bv.find(v => v.id===id));
  const savedA   = ffAddresses.filter(a=>a.saved);
  const savedC   = ffContacts.filter(c=>c.saved);
  const aOpts = `<option value="">Select address…</option>${savedA.map(a=>`<option value="${a.id}">${a.name||'Location '+a.id}</option>`).join('')}<option value="ADD_NEW" style="font-weight:700;color:#009EDB">+ Add new</option>`;
  const cOpts = `<option value="">Select contact…</option>${savedC.map(c=>`<option value="${c.id}">${c.name||'Contact '+c.id}</option>`).join('')}<option value="ADD_NEW" style="font-weight:700;color:#009EDB">+ Add new</option>`;
  const atQtyCap = bv.length >= bundle.qty;

  const filtered = bv.filter(v => {
    if (!ffSearch) return true;
    const s = ffSearch.toLowerCase();
    return (v.vin||'').toLowerCase().includes(s)||(v.ymm||'').toLowerCase().includes(s)||(v.vehicleName||'').toLowerCase().includes(s);
  });

  // Input method
  const methodMeta = {
    vin: { title: 'Option A: Bulk add via VIN', helper: 'Paste one or multiple VINs separated by commas.' },
    ymm: { title: 'Option B: Manual YMM entry', helper: 'Add vehicles by year, make, model and quantity.' },
    dot: { title: 'Option C: DOT fleet lookup', helper: 'Search by US DOT Number and add vehicles.' },
  };
  let inputHtml = '';
  if (ffInputMethod === 'vin') {
    const lines = ffVinInput.split(',').map(s=>s.trim()).filter(Boolean);
    const valid = lines.filter(v=>v.length===17).length;
    inputHtml = `<div class="ff-form-group" style="margin:0">
      <label class="ff-label" style="display:flex;justify-content:space-between;">
        <span>Paste one or multiple VINs</span>
        ${lines.length?`<span style="color:${valid===lines.length?'#1B5E20':'#dc2626'};font-weight:700">${valid}/${lines.length} valid</span>`:''}
      </label>
      <textarea class="ff-textarea" style="min-height:52px;" placeholder="Paste one or multiple VINs (comma-separated)..." oninput="ffVinInput=this.value;">${ffVinInput}</textarea>
      <button class="ff-save-btn" style="margin-top:7px;" onclick="ffProcessVins('${bundleId}')" ${atQtyCap?'disabled':''}>Process &amp; Add</button>
    </div>`;
  } else if (ffInputMethod === 'ymm') {
    inputHtml = `<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
      <div class="ff-form-group" style="flex:1;min-width:65px;margin:0"><label class="ff-label">Year</label><input class="ff-input" type="text" placeholder="2024" value="${ffYmm.year}" onchange="ffYmm.year=this.value" ></div>
      <div class="ff-form-group" style="flex:1.5;min-width:90px;margin:0"><label class="ff-label">Make</label><input class="ff-input" type="text" placeholder="Ford" value="${ffYmm.make}" onchange="ffYmm.make=this.value" ></div>
      <div class="ff-form-group" style="flex:2;min-width:110px;margin:0"><label class="ff-label">Model</label><input class="ff-input" type="text" placeholder="F-150" value="${ffYmm.model}" onchange="ffYmm.model=this.value" ></div>
      <div class="ff-form-group" style="margin:0;width:auto;"><label class="ff-label">QTY</label>
        <div style="display:flex;align-items:center;border:1.5px solid var(--gray-200);border-radius:999px;height:36px;padding:0 8px;gap:6px;background:white;">
          <button style="border:none;background:none;cursor:pointer;font-size:15px" onclick="ffYmm.qty=Math.max(1,ffYmm.qty-1);renderFFContent()">−</button>
          <span style="font-size:13px;font-weight:700;min-width:18px;text-align:center">${ffYmm.qty}</span>
          <button style="border:none;background:none;cursor:pointer;font-size:15px" onclick="ffYmm.qty++;renderFFContent()">+</button>
        </div>
      </div>
      <button class="ff-save-btn" style="height:36px;border-radius:999px;padding:0 18px;" onclick="ffAddYMM('${bundleId}')" ${atQtyCap?'disabled':''}>Add</button>
    </div>`;
  } else {
    inputHtml = `<div style="display:flex;gap:8px;">
      <input class="ff-input" type="text" placeholder="Enter US DOT Number (e.g., 1234567)" value="${ffDot}" onchange="ffDot=this.value" style="flex:1;height:36px;">
      <button class="ff-save-btn" style="height:36px;border-radius:999px;padding:0 16px;font-size:11px;" onclick="ffAddDOT('${bundleId}')" ${atQtyCap?'disabled':''}>Lookup</button>
    </div>`;
  }

  // Bulk bar
  let bulkHtml = '';
  if (bv.length > 0) {
    if (!ffBulkOn) {
      bulkHtml = `<button class="ff-btn-start-bulk" onclick="ffBulkOn=true;renderFFContent()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
        Bulk action
      </button>`;
    } else {
      const actSel = `<select class="ff-select" style="width:190px;" onchange="ffBulkType=this.value;renderFFContent()">
        <option value="">Select action…</option>
        <option value="shipping" ${ffBulkType==='shipping'?'selected':''}>Shipping info</option>
        ${requiresInstall ? `<option value="installation" ${ffBulkType==='installation'?'selected':''}>Installation info</option>` : ''}
      </select>`;
      let flds = '';
      if (ffBulkType==='shipping') flds=`
        <div><select class="ff-select" style="min-width:160px;" onchange="ffBulkField('shippingId',this.value,'addresses')">${aOpts}</select></div>
        <div><select class="ff-select" style="min-width:160px;" onchange="ffBulkField('shippingContactId',this.value,'contacts')">${cOpts}</select></div>
        <label style="font-size:11px;display:flex;align-items:center;gap:5px;cursor:pointer;white-space:nowrap"><input type="checkbox" class="vds-checkbox-ff" ${ffBulkF.sameAsShipping?'checked':''} onchange="ffBulkF.sameAsShipping=this.checked"> Same as install</label>`;
      else if (ffBulkType==='installation') flds=`
        <div><select class="ff-select" style="min-width:160px;" onchange="ffBulkField('installAddressId',this.value,'addresses')">${aOpts}</select></div>
        <div><select class="ff-select" style="min-width:160px;" onchange="ffBulkField('installContactId',this.value,'contacts')">${cOpts}</select></div>`;
      bulkHtml = `<div class="ff-bulk-bar ff-fadein">
        <div class="ff-bulk-hdr">
          <span class="ff-bulk-title">Bulk action</span>
          <button class="ff-remove-btn" onclick="ffBulkOn=false;ffBulkType='';renderFFContent()"><svg width="14" height="14" viewBox="0 0 15.185 15.185" fill="currentColor"><path d="M 8.889 7.593 L 15.185 13.889 L 13.889 15.185 L 7.593 8.889 L 1.296 15.185 L 0 13.889 L 6.296 7.593 L 0 1.296 L 1.296 0 L 7.593 6.296 L 13.889 0 L 15.185 1.296 L 8.889 7.593 Z"/></svg></button>
        </div>
        <div class="ff-bulk-fields">${actSel}${flds}</div>
        <div class="ff-bulk-footer">
          <span class="ff-bulk-count">Selected: <strong style="color:#009EDB">${selInB.length}</strong></span>
          <button class="ff-bulk-apply" ${selInB.length===0||!ffBulkType?'disabled':''} onclick="ffApplyBulk('${bundleId}')">Apply</button>
        </div>
      </div>`;
    }
  }

  // Vehicle rows
  let rowsHtml = '';
  if (filtered.length === 0) {
    rowsHtml = `<div class="ff-empty-state">Add vehicles above to begin assignment</div>`;
  } else {
    rowsHtml = `<div class="ff-select-all-row">
      <label style="display:flex;align-items:center;gap:7px;font-size:11px;font-weight:700;color:var(--gray-600);cursor:pointer">
        <input type="checkbox" class="vds-checkbox-ff" ${selInB.length>0&&selInB.length===bv.length?'checked':''} onchange="ffToggleAll('${bundleId}',this.checked)"> Select all
      </label>
      <div class="ff-filter-wrap">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input class="ff-filter" type="text" placeholder="Filter VIN / YMM…" value="${ffSearch}" oninput="ffSearch=this.value;renderFFContent()">
      </div>
    </div>
    <table class="ff-v-table">
      ${filtered.map(v => `
        <tbody>
          <tr class="ff-v-head"><td colspan="2">
            <div style="display:flex;align-items:center;gap:18px;">
              <input type="checkbox" class="vds-checkbox-ff" ${ffSelected.includes(v.id)?'checked':''} onchange="ffToggleSel('${v.id}',this.checked)">
              <div style="display:flex;gap:22px;">
                <div><div class="ff-v-meta">YMM</div><div style="font-size:13px;font-weight:700">${v.ymm||'Vehicle'}</div></div>
                <div><div class="ff-v-meta">VIN</div><div style="font-family:monospace;font-size:12px">${v.vin}</div></div>
                <div><div class="ff-v-meta">Class</div><div style="font-size:12px">${v.cls||'MD'}</div></div>
                <div><div class="ff-v-meta">Telematics</div><span class="ff-badge-telematics">${v.telematics||'Standard'}</span></div>
              </div>
            </div>
          </td><td style="text-align:right;width:32px">
            <button class="ff-v-remove" onclick="ffRemoveVehicle('${bundleId}','${v.id}')"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
          </td></tr>
          <tr class="ff-v-sub"><td colspan="3">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div class="ff-form-group"><label class="ff-label">Vehicle name</label><input class="ff-input" type="text" placeholder="Reference name" value="${v.vehicleName||''}" onchange="ffUpdateVeh('${bundleId}','${v.id}','vehicleName',this.value)" ></div>
              <div class="ff-form-group"><label class="ff-label">License plate</label><input class="ff-input" type="text" placeholder="ABC-1234" value="${v.plate||''}" onchange="ffUpdateVeh('${bundleId}','${v.id}','plate',this.value)" ></div>
            </div>
          </td></tr>
          <tr class="ff-v-sub last"><td colspan="3">
            ${requiresInstall ? `<div style="text-align:right;margin-bottom:7px;padding-bottom:7px;border-bottom:1px solid #f9f9f9">
              <button class="ff-text-link" onclick="ffCopyShipping('${bundleId}','${v.id}')">Copy shipping → installation</button>
            </div>` : ''}
            <div class="ff-v-grid">
              <div class="ff-form-group"><label class="ff-label">Shipping address</label>
                <select class="ff-select"  onchange="ffVehicleDrop('${bundleId}','${v.id}','shippingId',this.value,'addresses')">
                  ${aOpts.replace(`value="${v.shippingId||''}"`,`value="${v.shippingId||''}" selected`)}
                </select></div>
              <div class="ff-form-group"><label class="ff-label">Shipping contact</label>
                <select class="ff-select"  onchange="ffVehicleDrop('${bundleId}','${v.id}','shippingContactId',this.value,'contacts')">
                  ${cOpts.replace(`value="${v.shippingContactId||''}"`,`value="${v.shippingContactId||''}" selected`)}
                </select></div>
              ${requiresInstall ? `<div class="ff-form-group"><label class="ff-label">Install address</label>
                <select class="ff-select"  onchange="ffVehicleDrop('${bundleId}','${v.id}','installAddressId',this.value,'addresses')">
                  ${aOpts.replace(`value="${v.installAddressId||''}"`,`value="${v.installAddressId||''}" selected`)}
                </select></div>
              <div class="ff-form-group"><label class="ff-label">Install contact</label>
                <select class="ff-select"  onchange="ffVehicleDrop('${bundleId}','${v.id}','installContactId',this.value,'contacts')">
                  ${cOpts.replace(`value="${v.installContactId||''}"`,`value="${v.installContactId||''}" selected`)}
                </select></div>` : ''}
            </div>
          </td></tr>
        </tbody></table></div>`).join('')}
    </div>`;
  }

  return `
    <div style="padding-bottom:16px;border-bottom:1px solid var(--gray-200);">
      <div class="ff-panel-title" style="font-size:22px;">Shipping Details</div>
      <div style="display:grid;grid-template-columns:1fr;gap:10px;margin-top:12px;">
        <div class="ff-form-group"><label class="ff-label">Address 1</label><input class="ff-input" type="text" value="${form.shipAddr1}" onchange="ffUpdateBundleForm('${bundleId}','shipAddr1',this.value)"></div>
        <div class="ff-form-group"><label class="ff-label">Address 2</label><input class="ff-input" type="text" value="${form.shipAddr2}" onchange="ffUpdateBundleForm('${bundleId}','shipAddr2',this.value)"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px;">
        <div class="ff-form-group"><label class="ff-label">Country</label>
          <select class="ff-select" onchange="ffUpdateBundleForm('${bundleId}','shipCountry',this.value)">
            <option ${(form.shipCountry||'United States')==='United States'?'selected':''}>United States</option>
            <option ${form.shipCountry==='Canada'?'selected':''}>Canada</option>
            <option ${form.shipCountry==='Mexico'?'selected':''}>Mexico</option>
          </select>
        </div>
        <div class="ff-form-group"><label class="ff-label">City</label>
          <select class="ff-select" onchange="ffUpdateBundleForm('${bundleId}','shipCity',this.value)">
            <option value="" ${!form.shipCity ? 'selected' : ''}>Select city</option>
            <option ${form.shipCity==='New York'?'selected':''}>New York</option>
            <option ${form.shipCity==='Los Angeles'?'selected':''}>Los Angeles</option>
            <option ${form.shipCity==='Chicago'?'selected':''}>Chicago</option>
            <option ${form.shipCity==='Houston'?'selected':''}>Houston</option>
            <option ${form.shipCity==='Miami'?'selected':''}>Miami</option>
            <option ${form.shipCity==='Tampa'?'selected':''}>Tampa</option>
          </select>
        </div>
        <div class="ff-form-group"><label class="ff-label">Zip/Postal Code</label><input class="ff-input" type="text" value="${form.shipZip}" onchange="ffUpdateBundleForm('${bundleId}','shipZip',this.value)"></div>
      </div>
      <button class="ff-save-btn" style="margin-top:10px;" onclick="ffValidateBundleDetails('${bundleId}')">Validate Address</button>
      <div style="border-top:1px solid var(--gray-200);margin:16px 0;"></div>
      <div class="ff-panel-title" style="font-size:22px;">Contact</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;">
        <div class="ff-form-group"><label class="ff-label">Contact Name</label><input class="ff-input" type="text" value="${form.contactName}" onchange="ffUpdateBundleForm('${bundleId}','contactName',this.value)"></div>
        <div class="ff-form-group"><label class="ff-label">Phone</label><input class="ff-input" type="text" value="${form.contactPhone}" onchange="ffUpdateBundleForm('${bundleId}','contactPhone',this.value)"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr;gap:10px;margin-top:10px;">
        <div class="ff-form-group"><label class="ff-label">Email</label><input class="ff-input" type="email" value="${form.contactEmail}" onchange="ffUpdateBundleForm('${bundleId}','contactEmail',this.value)"></div>
      </div>
      ${requiresInstall ? `<div style="border-top:1px solid var(--gray-200);margin:16px 0;"></div>
      <div class="ff-panel-title" style="font-size:22px;">Installation Details</div>
      <label style="font-size:12px;display:flex;align-items:center;gap:8px;margin-top:10px;">
        <input type="checkbox" class="vds-checkbox-ff" ${form.installSameAsShipping ? 'checked' : ''} onchange="ffUpdateBundleForm('${bundleId}','installSameAsShipping',this.checked)">
        Installation Address is the same as shipping
      </label>` : ''}
    </div>
    <div style="padding-top:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span class="ff-panel-title" style="font-size:20px;">Vehicle Assignment</span>
        <div style="width:190px;">
          <div class="ff-progress-row"><span>${readyN} / ${bundle.qty} Assigned</span><span style="color:var(--gray-400)">${bv.length} added</span></div>
          <div class="ff-progress-track">
            <div class="ff-progress-green" style="width:${Math.min((readyN/bundle.qty)*100,100)}%"></div>
            <div class="ff-progress-orange" style="width:${Math.min(((readyN+partialN)/bundle.qty)*100,100)}%"></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:3px;font-size:9px;">
            <span style="display:flex;align-items:center;gap:3px"><span style="width:6px;height:6px;background:#1B5E20;border-radius:1px;display:inline-block"></span> Ready</span>
            <span style="display:flex;align-items:center;gap:3px"><span style="width:6px;height:6px;background:#f97316;border-radius:1px;display:inline-block"></span> Partial</span>
          </div>
        </div>
      </div>
      <div class="ff-method-tabs ff-method-tabs--vehicle">
        <button class="ff-method-tab ff-method-tab--vehicle ${ffInputMethod==='vin'?'active':''}" onclick="ffInputMethod='vin';renderFFContent()">Option A: Bulk add via VIN</button>
        <button class="ff-method-tab ff-method-tab--vehicle ${ffInputMethod==='ymm'?'active':''}" onclick="ffInputMethod='ymm';renderFFContent()">Option B: Manual YMM entry</button>
        <button class="ff-method-tab ff-method-tab--vehicle ${ffInputMethod==='dot'?'active':''}" onclick="ffInputMethod='dot';renderFFContent()">Option C: DOT fleet lookup</button>
      </div>
      <div class="ff-method-panel">
        <div class="ff-method-panel-title">${methodMeta[ffInputMethod].title}</div>
        <div class="ff-method-panel-helper">${methodMeta[ffInputMethod].helper}</div>
        ${inputHtml}
      </div>
    </div>
    <div class="ff-panel" style="min-height:260px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span class="ff-panel-title">Inventory Assignment</span>
        <span style="font-size:11px;color:var(--gray-600)">${bv.length} vehicles</span>
      </div>
      ${bulkHtml}
      ${rowsHtml}
    </div>`;
}

// Vehicle actions
function detectTelematics(make, year) {
  const y = parseInt(year, 10);
  const mk = (make || '').trim().toLowerCase();
  if (!Number.isFinite(y)) return 'Standard';
  if ((mk === 'ford' || mk === 'lincoln') && y >= 2020) return 'OEM Detected';
  if (['chevrolet', 'gmc', 'buick', 'cadillac'].includes(mk) && y >= 2015) return 'OEM Detected';
  return 'Standard';
}

function ffProcessVins(bId) {
  if (!ffVinInput.trim()) return;
  if (!canAddVehiclesToBundle(bId)) return;
  const globalVins = getGlobalVinSet();
  const bundle = getBundles().find(b => String(b.id) === String(bId));
  const form = getFFBundleForm(bId);
  const qtyCap = bundle ? bundle.qty : Infinity;
  let remaining = Math.max(0, qtyCap - (ffVehicles[bId] || []).length);
  let duplicateCount = 0;
  let overCapCount = 0;
  ffVinInput.split(',').map(s=>s.trim()).filter(Boolean).forEach(vin => {
    const normalized = vin.toUpperCase();
    if (globalVins.has(normalized)) { duplicateCount += 1; return; }
    if (remaining <= 0) { overCapCount += 1; return; }
    ffVehicles[bId].push({
      id:Date.now()+Math.random(),
      vin:normalized,ymm:'Vehicle',cls:'MD',telematics:'Standard',vehicleName:'',plate:'',
      shippingId:form.shipAddressId || '',
      shippingContactId:form.shipContactId || '',
      installAddressId:(form.installSameAsShipping ? (form.shipAddressId || '') : (form.installAddressId || '')),
      installContactId:(form.installSameAsShipping ? (form.shipContactId || '') : (form.installContactId || ''))
    });
    globalVins.add(normalized);
    remaining -= 1;
  });
  if (duplicateCount > 0) alert(`${duplicateCount} duplicate VIN(s) were ignored.`);
  if (overCapCount > 0) alert(`${overCapCount} vehicle(s) were ignored due to bundle quantity cap.`);
  ffVinInput=''; renderFF();
}
function ffAddYMM(bId) {
  if (!ffYmm.year||!ffYmm.make||!ffYmm.model) { alert('Fill Year, Make and Model.'); return; }
  if (!canAddVehiclesToBundle(bId)) return;
  const bundle = getBundles().find(b => String(b.id) === String(bId));
  const form = getFFBundleForm(bId);
  const qtyCap = bundle ? bundle.qty : Infinity;
  const remaining = Math.max(0, qtyCap - (ffVehicles[bId] || []).length);
  const addCount = Math.min(ffYmm.qty, remaining);
  const telematics = detectTelematics(ffYmm.make, ffYmm.year);
  for(let i=0;i<addCount;i++) {
    ffVehicles[bId].push({
      id:Date.now()+Math.random(),
      vin:`TBD-${Date.now().toString(36)}-${i}`,
      ymm:`${ffYmm.year} ${ffYmm.make} ${ffYmm.model}`,
      cls:'MD',
      year: ffYmm.year,
      make: ffYmm.make,
      telematics,
      vehicleName:'',
      plate:'',
      shippingId:form.shipAddressId || '',
      shippingContactId:form.shipContactId || '',
      installAddressId:(form.installSameAsShipping ? (form.shipAddressId || '') : (form.installAddressId || '')),
      installContactId:(form.installSameAsShipping ? (form.shipContactId || '') : (form.installContactId || ''))
    });
  }
  if (addCount < ffYmm.qty) alert(`${ffYmm.qty - addCount} vehicle(s) were ignored due to bundle quantity cap.`);
  ffYmm={year:'',make:'',model:'',qty:1}; renderFF();
}
function ffAddDOT(bId) {
  if (!ffDot) { alert('Enter a DOT number.'); return; }
  if (!canAddVehiclesToBundle(bId)) return;
  const globalVins = getGlobalVinSet();
  const bundle = getBundles().find(b => String(b.id) === String(bId));
  const form = getFFBundleForm(bId);
  const qtyCap = bundle ? bundle.qty : Infinity;
  let remaining = Math.max(0, qtyCap - (ffVehicles[bId] || []).length);
  let duplicateCount = 0;
  let overCapCount = 0;
  ['1HGBH41JXMN109186','2T1BURHE0JC074678','3VWDA2AJ4EM350125'].forEach(vin => {
    const normalized = vin.toUpperCase();
    if (globalVins.has(normalized)) { duplicateCount += 1; return; }
    if (remaining <= 0) { overCapCount += 1; return; }
    ffVehicles[bId].push({
      id:Date.now()+Math.random(),vin:normalized,ymm:'DOT Fleet Vehicle',cls:'MD',telematics:'Standard',vehicleName:'',plate:'',
      shippingId:form.shipAddressId || '',
      shippingContactId:form.shipContactId || '',
      installAddressId:(form.installSameAsShipping ? (form.shipAddressId || '') : (form.installAddressId || '')),
      installContactId:(form.installSameAsShipping ? (form.shipContactId || '') : (form.installContactId || ''))
    });
    globalVins.add(normalized);
    remaining -= 1;
  });
  if (duplicateCount > 0) alert(`${duplicateCount} duplicate VIN(s) were ignored.`);
  if (overCapCount > 0) alert(`${overCapCount} vehicle(s) were ignored due to bundle quantity cap.`);
  ffDot=''; renderFF();
}
function ffRemoveVehicle(bId,vId) { ffVehicles[bId]=ffVehicles[bId].filter(v=>v.id!==vId); ffSelected=ffSelected.filter(id=>id!==vId); renderFF(); }
function ffUpdateVeh(bId,vId,f,v) { ffVehicles[bId]=ffVehicles[bId].map(vh=>vh.id===vId?{...vh,[f]:v}:vh); }
function ffToggleSel(vId,checked) { ffSelected=checked?[...ffSelected,vId]:ffSelected.filter(id=>id!==vId); renderFFContent(); }
function ffToggleAll(bId,checked) {
  const ids=ffVehicles[bId].map(v=>v.id);
  ffSelected=checked?[...new Set([...ffSelected,...ids])]:ffSelected.filter(id=>!ids.includes(id));
  renderFFContent();
}
function ffCopyShipping(bId,vId) { ffVehicles[bId]=ffVehicles[bId].map(v=>v.id===vId?{...v,installAddressId:v.shippingId,installContactId:v.shippingContactId}:v); renderFFContent(); }
function ffVehicleDrop(bId,vId,f,val,tab) {
  if (val==='ADD_NEW') { ffGoToAddresses(true); return; }
  ffVehicles[bId]=ffVehicles[bId].map(v=>v.id===vId?{...v,[f]:val}:v); renderFFContent();
}
function ffBulkField(f,val,tab) {
  if (val==='ADD_NEW') { ffGoToAddresses(true); return; }
  ffBulkF[f]=val; renderFFContent();
}
function ffApplyBulk(bId) {
  ffVehicles[bId]=ffVehicles[bId].map(v=>{
    if (!ffSelected.includes(v.id)) return v;
    const u={};
    if (ffBulkType==='shipping') {
      if(ffBulkF.shippingId) u.shippingId=ffBulkF.shippingId;
      if(ffBulkF.shippingContactId) u.shippingContactId=ffBulkF.shippingContactId;
      if(ffBulkF.sameAsShipping){u.installAddressId=u.shippingId||v.shippingId;u.installContactId=u.shippingContactId||v.shippingContactId;}
    } else if(ffBulkType==='installation'){
      if(ffBulkF.installAddressId) u.installAddressId=ffBulkF.installAddressId;
      if(ffBulkF.installContactId) u.installContactId=ffBulkF.installContactId;
    }
    return{...v,...u};
  });
  ffSelected=[]; renderFF();
}

function saveFulfillmentConfig() {
  const totalVehicles = Object.values(ffVehicles).reduce((sum, arr) => sum + arr.length, 0);
  const savedAddrs = ffAddresses.filter(a => a.saved).length;

  if (savedAddrs === 0 && totalVehicles === 0) {
    alert('Please add at least one address and some vehicles to continue.');
    return;
  }

  // Show syncing state  
  const saveBtn = document.querySelector('.fulfillment-footer .vds-btn-primary');
  if (saveBtn) { saveBtn.textContent = 'Syncing...'; saveBtn.disabled = true; }

  setTimeout(() => {
    const badge = document.getElementById('account-badge');
    if (badge) { badge.className = 'vds-badge vds-badge-green badge-ready'; badge.textContent = 'Account ready'; }
    const banner = document.getElementById('warning-banner');
    if (banner) { banner.classList.add('hidden'); const body = document.getElementById('vc-body'); if(body) body.classList.remove('has-banner'); }
    closeFulfillmentModal();
    if (typeof showSuccessBanner === 'function') showSuccessBanner('Fulfillment configured', 'Addresses and vehicles synchronized successfully.');
    if (saveBtn) { saveBtn.textContent = 'Save Configuration'; saveBtn.disabled = false; }
    if (typeof updateFulfillmentBtn === 'function') updateFulfillmentBtn();
  }, 1200);
}

// Legacy compat stubs (from zip) — replaced by above
function addMockLocation() { ffAddresses.push({id:Date.now(),saved:true,name:'Warehouse B · 456 Supply Dr, Austin TX 73301',addr1:'456 Supply Dr',addr2:'',city:'Austin',state:'TX',zip:'73301',country:'United States'}); openFulfillmentModal(); }
function addMockContact() { ffContacts.push({id:Date.now(),saved:true,name:'Mark Sloan',phone:'+1 555 111 2222',email:'mark@client.com'}); openFulfillmentModal(); }
function addMockVin() { ffAddYMM('default'); }
function deleteFulfillmentItem() {}
function renderFulfillmentTables() {}

function showToast(msg) { if (typeof showSuccessBanner === 'function') showSuccessBanner(msg, ''); }


function closeConfirmModal() {
  document.getElementById('confirm-selection-overlay').classList.remove('open');
}

function getSelectedOptionSummary() {
  const selectedId = bld.selectedOptionId;
  const opt = options.find((o) => o.id === selectedId);
  if (!opt) return null;
  const optionNumber = Math.max(1, options.findIndex((o) => o.id === selectedId) + 1);
  const { totalMonthly } = calcOption(opt, proposalData.promoType, proposalData.forcedTierIndex);
  return {
    optionLabel: `Option ${optionNumber}`,
    optionValue: `${formatMoney(totalMonthly)}/month`
  };
}

function openConfirmSelectionModal() {
  const overlay = document.getElementById('confirm-selection-overlay');
  if (!overlay) return;
  const body = document.getElementById('confirm-selection-body');
  const summary = getSelectedOptionSummary();
  if (body) {
    if (summary) {
      body.innerHTML = `You selected <strong>${summary.optionLabel}</strong> with a value of <strong>${summary.optionValue}</strong>.<br><br>This will lock the quoting session and initiate the contract generation process.`;
    } else {
      body.textContent = 'This will lock the quoting session and initiate the contract generation process.';
    }
  }
  overlay.classList.add('open');
}

function confirmAndLockDeal() {
  closeConfirmModal();
  navigateToContractReviewFromSelection();
}

// ── CONTRACT SUB-STATE ─────────────────────────────────────────
// States: 'waiting' → 'signed' → 'payment' → 'closed'
let contractSubState = 'waiting';
let selectedOpt = null;

function enterContractScreen(opt) {
  clearSignatureCompletionSimulation();
  selectedOpt = opt;
  contractSubState = 'pre-send'; // before sending e-sign
  touchNavDate('contract_review_send');
  // Show phase 1 (message form), hide phase 2
  document.getElementById('contract-phase-review').classList.remove('hidden');
  document.getElementById('contract-phase-signpay').classList.add('hidden');
  document.getElementById('contract-sub-stepper')?.classList.add('hidden');
  // Stepper: step 1 active
  const d1 = document.getElementById('c-dot-1');
  const d2 = document.getElementById('c-dot-2');
  const l1 = document.getElementById('c-line-1');
  if (d1) d1.className = 'c-step-dot active';
  if (document.getElementById('c-dot-label-2')) document.getElementById('c-dot-label-2').className = 'c-step-label muted';
  if (d2) d2.className = 'c-step-dot pending';
  if (l1) l1.className = 'c-line';
  // Footer
  document.getElementById('footer-send').classList.remove('hidden');
  document.getElementById('footer-send').innerText = 'Send E-Sign Link';
  document.getElementById('footer-send').disabled = false;
  document.getElementById('footer-back').classList.add('visible');
  renderContractDoc(opt);
}

function isFulfillmentComplete() {
  // All bundles must have at least 1 vehicle and required assignments.
  // Non-powered assets only require shipping + contact + vehicle name.
  const bundles = getBundles();
  if (!bundles || bundles.length === 0) return false;
  return bundles.every(b => {
    const bv = ffVehicles[b.id] || [];
    const requiresInstall = bundleRequiresInstallation(b);
    return bv.length > 0 && bv.every(v => {
      const hasShipping = v.shippingId && v.shippingContactId && v.vehicleName;
      if (!hasShipping) return false;
      if (!requiresInstall) return true;
      return v.installAddressId && v.installContactId;
    });
  });
}

function getFulfillmentProgressPercent() {
  const bundles = getBundles();
  if (!bundles || bundles.length === 0) return 10;

  let totalRequired = 0;
  let totalAdded = 0;
  let totalReady = 0;

  bundles.forEach((b) => {
    const qty = Math.max(0, Number(b.qty) || 0);
    if (qty === 0) return;
    totalRequired += qty;
    const bv = ffVehicles[b.id] || [];
    totalAdded += Math.min(bv.length, qty);
    const readyCount = bv.filter((v) => isVehicleReadyForBundle(v, b)).length;
    totalReady += Math.min(readyCount, qty);
  });

  if (totalRequired === 0) return 10;
  if (isFulfillmentComplete()) return 100;

  // Weighted progress: adding vehicles moves progress, fully configured vehicles move it faster.
  const weightedRatio = ((totalAdded * 0.55) + (totalReady * 0.45)) / totalRequired;
  const pct = Math.round(weightedRatio * 100);
  return Math.max(10, Math.min(99, pct));
}

function hasAnyFulfillmentVehicle() {
  const bundles = getBundles();
  if (!bundles || bundles.length === 0) return false;
  return bundles.some((b) => {
    const bv = ffVehicles[b.id] || [];
    return bv.length > 0;
  });
}

function updateDealResultFulfillmentCta() {
  const primaryBtn = document.getElementById('deal-result-primary-btn');
  if (!primaryBtn) return;
  if (!/Continue fulfillment process/i.test(primaryBtn.textContent || '')) return;
  const pct = getFulfillmentProgressPercent();
  primaryBtn.textContent = `Continue fulfillment process (${pct}%)`;
}

function updateFulfillmentBtn() {
  const btn = document.querySelector('.sp-fulfillment-btn');
  const progress = getFulfillmentProgressPercent();
  const hasVehicles = hasAnyFulfillmentVehicle();

  if (btn) {
    if (progress >= 100) {
      btn.className = 'sp-fulfillment-btn ready';
    } else {
      btn.className = 'sp-fulfillment-btn';
    }
    btn.textContent = hasVehicles
      ? `Continue fulfillment process (${progress}%)`
      : 'Configure fulfillment';
  }

  updateDealResultFulfillmentCta();
}

function updateContractSubState() {
  updateContractSimulationMenuVisibility();
  const statusText = document.getElementById('sp-status-text');
  const dot2 = document.getElementById('c-dot-2');
  const line2 = document.getElementById('c-line-2');
  const dot3 = document.getElementById('c-dot-3');
  const date2 = document.getElementById('contract-date-2');

  if (contractSubState === 'waiting') {
    showSuccessBanner('Contract sent', 'The DocuSign link has been sent to the client for digital signature.');
    if (statusText) statusText.textContent = 'Contact the customer to confirm receipt and assist with the digital signature';

  } else if (contractSubState === 'signed') {
    clearSignatureCompletionSimulation();
    showSuccessBanner('Contract signed', 'The customer has successfully signed via DocuSign. They will now be redirected to the payment setup portal.');
    if (statusText) statusText.textContent = 'Contact the customer to finalize their payment setup.';
    if (date2) date2.textContent = new Date().toLocaleDateString();

  } else if (contractSubState === 'payment') {
    clearSignatureCompletionSimulation();
    touchNavDate('contract');
    touchNavDate('contract_sign_pay');
    touchNavDate('payment');
    showSuccessBanner('Payment method configured.', '');
    logProposalEvent('Payment setup configured', 'Payment setup was completed.');
    if (statusText) statusText.textContent = 'Signature and payment setup configured.';
    if (dot2) dot2.className = 'c-step-dot done';
    if (line2) line2.className = 'c-line done';
    if (dot3) dot3.className = 'c-step-dot active';
    if (date2) date2.textContent = new Date().toLocaleDateString();

    // Auto-navigate to Deal Result after 4 seconds
    setTimeout(() => enterDealResult(), 4000);
  }

  updateFulfillmentBtn();
}

function enterDealResult(mode = 'won') {
  clearSignatureCompletionSimulation();
  // Hide all main screens, show deal result
  document.getElementById('screen-drafting').classList.add('hidden');
  document.getElementById('screen-proposal-review').classList.add('hidden');
  document.getElementById('screen-proposal-selection').classList.add('hidden');
  document.getElementById('screen-contract').classList.add('hidden');
  document.getElementById('screen-deal-result').classList.remove('hidden');
  dismissSuccessBanner();

  // Update main stepper — both steps done
  const dot1 = document.getElementById('step-dot-1');
  const dot2m = document.getElementById('step-dot-2');
  if (dot1) { dot1.className = 'vc-step-dot done'; dot1.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">check</span>'; }
  if (dot2m) { dot2m.className = 'vc-step-dot done'; dot2m.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">check</span>'; }

  // Set deal result dates
  const today = new Date().toLocaleDateString();
  const d1 = document.getElementById('deal-date-1');
  const d2 = document.getElementById('deal-date-2');
  const d3 = document.getElementById('deal-date-3');
  if (d1) d1.textContent = today;
  if (d2) d2.textContent = today;
  if (d3) d3.textContent = today;

  // Footer — hide send, hide back
  document.getElementById('footer-send').classList.add('hidden');
  document.getElementById('footer-back').classList.remove('visible');
  document.getElementById('footer-back').style.display = 'none';

  touchNavDate('result', true);
  const iconWrap = document.getElementById('deal-result-icon');
  const title = document.getElementById('deal-result-title');
  const subtitle = document.getElementById('deal-result-subtitle');
  const primaryBtn = document.getElementById('deal-result-primary-btn');
  const subStepper = document.getElementById('deal-result-substepper');
  const closeRow = document.getElementById('deal-result-close-row');
  if (subStepper) subStepper.style.display = 'none';

  if (iconWrap && title && subtitle && primaryBtn) {
    if (mode === 'rejected') {
      if (closeRow) closeRow.style.display = 'none';
      iconWrap.innerHTML = `<svg width="52" height="56" viewBox="0 0 52 56" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="2" width="36" height="46" rx="3" stroke="#000" stroke-width="2"/>
        <line x1="12" y1="16" x2="32" y2="16" stroke="#000" stroke-width="2" stroke-linecap="round"/>
        <line x1="12" y1="24" x2="32" y2="24" stroke="#000" stroke-width="2" stroke-linecap="round"/>
        <line x1="12" y1="32" x2="22" y2="32" stroke="#000" stroke-width="2" stroke-linecap="round"/>
        <circle cx="38" cy="44" r="11" fill="#000"/>
        <path d="M33.5 39.5L42.5 48.5M42.5 39.5L33.5 48.5" stroke="white" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
      title.innerHTML = 'Deal marked as closed-lost';
      subtitle.innerHTML = 'The quoting session has been closed based on the selected rejection reason.';
      primaryBtn.textContent = 'Start a new proposal';
      primaryBtn.onclick = () => closeDealResult();
    } else {
      if (closeRow) closeRow.style.display = 'flex';
      iconWrap.innerHTML = `<svg width="52" height="56" viewBox="0 0 52 56" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="2" width="36" height="46" rx="3" stroke="#000" stroke-width="2"/>
        <line x1="12" y1="16" x2="32" y2="16" stroke="#000" stroke-width="2" stroke-linecap="round"/>
        <line x1="12" y1="24" x2="32" y2="24" stroke="#000" stroke-width="2" stroke-linecap="round"/>
        <line x1="12" y1="32" x2="22" y2="32" stroke="#000" stroke-width="2" stroke-linecap="round"/>
        <circle cx="38" cy="44" r="11" fill="#000"/>
        <path d="M33 44l3.5 3.5L43 40.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
      title.innerHTML = 'Contract signed and payment<br>configured';
      subtitle.innerHTML = 'The contract is fully executed and the payment method has been set up.<br>Ready for hardware fulfillment.';
      primaryBtn.textContent = `Continue fulfillment process (${getFulfillmentProgressPercent()}%)`;
      primaryBtn.onclick = () => openFulfillmentModal();
    }
  }
  screen = 'deal-result';
  renderNav();
}

function closeDealResult() {
  document.getElementById('more-menu-deal-result')?.classList.add('hidden');
  // Return to drafting and restore full drafting UI state
  proposalWasSentToCustomer = false;
  screen = 'drafting';
  document.getElementById('screen-proposal-selection')?.classList.add('hidden');
  document.getElementById('screen-proposal-review')?.classList.add('hidden');
  document.getElementById('screen-contract')?.classList.add('hidden');
  document.getElementById('screen-deal-result').classList.add('hidden');
  document.getElementById('screen-drafting').classList.remove('hidden');
  document.getElementById('vc-body').style.paddingTop = '159px';
  document.getElementById('success-banner').style.top = '159px';

  const sendBtn = document.getElementById('footer-send');
  sendBtn.classList.remove('hidden');
  sendBtn.textContent = 'Review and Send';
  sendBtn.onclick = handleSend;
  updateSendBtn();

  const back = document.getElementById('footer-back');
  back.style.display = '';
  back.classList.remove('visible');

  renderOptions();
  const hasOptions = Array.isArray(options) && options.length > 0;
  document.getElementById('empty-state')?.classList.toggle('hidden', hasOptions);
  document.getElementById('options-grid')?.classList.toggle('hidden', !hasOptions);
  updateMarkDeadBtn();
  renderNav();
}

function viewSignedContract() {
  document.getElementById('more-menu-deal-result')?.classList.add('hidden');
  // Go back to contract screen in read-only mode
  document.getElementById('screen-deal-result').classList.add('hidden');
  document.getElementById('screen-contract').classList.remove('hidden');
  document.getElementById('footer-back').classList.add('visible');
  screen = 'contract-review';
}

function simulateContractSigned() {
  if (contractSubState !== 'waiting') return;
  clearSignatureCompletionSimulation();
  document.getElementById('more-menu-contract')?.classList.add('hidden');
  document.getElementById('more-menu-contract2')?.classList.add('hidden');
  startSignatureCompletedModalCountdown();
}
function simulatePaymentSetup() {
  if (contractSubState !== 'signed' && contractSubState !== 'waiting') return;
  clearSignatureCompletionSimulation();
  contractSubState = 'payment';
  document.getElementById('more-menu-contract')?.classList.add('hidden');
  document.getElementById('more-menu-contract2')?.classList.add('hidden');
  updateContractSubState();
  renderNav();
}

function openContractModifyConfirmModal() {
  document.getElementById('more-menu-contract')?.classList.add('hidden');
  document.getElementById('more-menu-contract2')?.classList.add('hidden');
  const t = document.getElementById('contract-modify-title');
  const b = document.getElementById('contract-modify-body');
  const p = document.getElementById('contract-modify-proceed-btn');
  if (t) t.textContent = 'Modify proposal?';
  if (b) b.textContent = 'If you modify the proposal, you will return to the Proposal section and the current contract progress will be discarded. Are you sure you want to proceed?';
  if (p) p.textContent = 'Proceed';
  contractConfirmProceedAction = 'modify-proposal';
  document.getElementById('contract-modify-overlay')?.classList.add('open');
}

function closeContractModifyConfirmModal() {
  contractConfirmProceedAction = null;
  document.getElementById('contract-modify-overlay')?.classList.remove('open');
}

function proceedContractModifyFromContract() {
  if (contractConfirmProceedAction === 'view-contract') {
    closeContractModifyConfirmModal();
    viewSignedContract();
    return;
  }
  closeContractModifyConfirmModal();
  clearSignatureCompletionSimulation();
  contractSubState = 'pre-send';
  logProposalEvent('Contract returned to drafting', 'Contract flow was sent back to Drafting.');
  selectionMenuEditProposal();
}

function openDealResultViewContractConfirmModal() {
  document.getElementById('more-menu-deal-result')?.classList.add('hidden');
  const t = document.getElementById('contract-modify-title');
  const b = document.getElementById('contract-modify-body');
  const p = document.getElementById('contract-modify-proceed-btn');
  if (t) t.textContent = 'Open contract?';
  if (b) b.textContent = 'You are about to open the signed contract view from Deal result. Are you sure you want to proceed?';
  if (p) p.textContent = 'Proceed';
  contractConfirmProceedAction = 'view-contract';
  document.getElementById('contract-modify-overlay')?.classList.add('open');
}

function toggleDealResultMenu(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const m = document.getElementById('more-menu-deal-result');
  if (!m) return;
  const shouldOpen = m.classList.contains('hidden');
  m.classList.toggle('hidden', !shouldOpen);
}

function updateContractSimulationMenuVisibility() {
  const showContractSigned = contractSubState === 'waiting';
  const showPaymentSetup = contractSubState === 'signed';
  const hasAnyAction = showContractSigned || showPaymentSetup;

  ['contract', 'contract2'].forEach((suffix) => {
    document.getElementById(`sim-title-${suffix}`)?.classList.toggle('hidden', !hasAnyAction);
    document.getElementById(`sim-contract-signed-${suffix}`)?.classList.toggle('hidden', !showContractSigned);
    document.getElementById(`sim-payment-setup-${suffix}`)?.classList.toggle('hidden', !showPaymentSetup);
  });
}

function toggleContractMenu2(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  updateContractSimulationMenuVisibility();
  const m1 = document.getElementById('more-menu-contract');
  const m2 = document.getElementById('more-menu-contract2');
  if (!m2) return;
  m1?.classList.add('hidden');
  const shouldOpen = m2.classList.contains('hidden');
  m2.classList.toggle('hidden', !shouldOpen);
}

function toggleContractMenu(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  updateContractSimulationMenuVisibility();
  const m1 = document.getElementById('more-menu-contract');
  const m2 = document.getElementById('more-menu-contract2');
  if (!m1) return;
  m2?.classList.add('hidden');
  const shouldOpen = m1.classList.contains('hidden');
  m1.classList.toggle('hidden', !shouldOpen);
}

document.addEventListener('click', () => {
  document.getElementById('more-menu-contract')?.classList.add('hidden');
  document.getElementById('more-menu-contract2')?.classList.add('hidden');
  document.getElementById('more-menu-deal-result')?.classList.add('hidden');
});

  function renderContractDoc(opt) {
  const { totalMonthly, totalUnits } = calcOption(opt, proposalData.promoType, proposalData.forcedTierIndex);
  const dateStr = new Date().toLocaleDateString();
  
  const rowsHtml = opt.bundles.map(b => {
    const { unitPrice, monthly } = calcBundle(b, opt.term, proposalData.promoType, proposalData.forcedTierIndex, totalUnits);
    return `
      <tr>
        <td>${b.coreName}</td>
        <td>${b.qty}</td>
        <td>${formatMoney(unitPrice)}</td>
        <td>${formatMoney(monthly)}</td>
      </tr>
    `;
  }).join('');

  document.getElementById('contract-doc-viewer').innerHTML = `
    <div class="doc-header">
      <div>
        <div class="doc-logo-box">V</div>
        <div class="doc-title" style="margin-top:16px;">Purchase Agreement</div>
        <div class="doc-ref">Ref: CPQ-8492-A</div>
      </div>
      <div style="text-align: right;">
        <div style="font-weight: 800; font-size: 15px;">Acme Logistics Corp</div>
        <div style="color: var(--gray-500); font-size: 12px; margin-top: 4px;">
          123 Industrial Pkwy<br>
          Tampa, FL 33602<br>
          Date: ${dateStr}
        </div>
      </div>
    </div>

    <div class="doc-section-title">Agreement Terms</div>
    <div class="doc-grid">
      <div class="doc-field">
        <label>Contract Length</label>
        <div style="font-weight:600;">${opt.term} Months</div>
      </div>
      <div class="doc-field">
        <label>Billing Cycle</label>
        <div style="font-weight:600;">Monthly</div>
      </div>
      <div class="doc-field">
        <label>Promo Applied</label>
        <div style="color: var(--green); font-weight:700;">${proposalData.promoType} Promo (20% Off)</div>
      </div>
    </div>

    <div class="doc-section-title">Hardware & Services</div>
    <table class="doc-table">
      <thead>
        <tr>
          <th>Description</th>
          <th>Qty</th>
          <th>Unit Price</th>
          <th>Total/Mo</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="doc-total-row">
      <div style="text-align: right;">
        <div style="color: var(--gray-500); font-size: 11px;">Total monthly investment</div>
        <div style="font-size: 24px; font-weight: 900;">${formatMoney(totalMonthly)}</div>
      </div>
    </div>
  `;
  
  // Message form:
  // - If proposal was sent, keep recipient prefilled for continuity
  // - If jumped directly from selection (without sending), keep recipient empty
  const msgTo = document.getElementById('contract-msg-to');
  if (msgTo) msgTo.value = proposalWasSentToCustomer ? 'acme.logistics@acmecorp.com' : '';
  const msgSub = document.getElementById('contract-msg-subject');
  if (msgSub) msgSub.value = '';
  const msgBody = document.getElementById('contract-msg-body');
  if (msgBody) {
    msgBody.value = '';
    updateContractCharCount(msgBody);
  }
  updateContractSendBtn();
}

function escapeForInlineScript(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/<\/script>/gi, '<\\/script>')
    .replace(/\$\{/g, '\\${');
}

let pdfViewerActiveFilename = 'document.pdf';

function closePdfViewerModal() {
  const overlay = document.getElementById('pdf-viewer-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function openPdfViewerModal({ title, sourceHtml, filename }) {
  if (!sourceHtml || !sourceHtml.trim()) return;
  const overlay = document.getElementById('pdf-viewer-overlay');
  const titleEl = document.getElementById('pdf-viewer-title');
  const contentEl = document.getElementById('pdf-viewer-content');
  if (!overlay || !titleEl || !contentEl) return;
  titleEl.textContent = title || 'Document preview';
  contentEl.innerHTML = sourceHtml;
  pdfViewerActiveFilename = filename || 'document.pdf';
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

async function ensureHtml2PdfLoaded() {
  if (window.html2pdf) return true;
  const existing = document.getElementById('html2pdf-lib');
  if (existing) {
    await new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('load failed')), { once: true });
    });
    return !!window.html2pdf;
  }
  const script = document.createElement('script');
  script.id = 'html2pdf-lib';
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
  document.head.appendChild(script);
  await new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = reject;
  });
  return !!window.html2pdf;
}

async function downloadPdfFromModal() {
  const content = document.getElementById('pdf-viewer-content');
  const btn = document.getElementById('pdf-viewer-download-btn');
  if (!content || !btn) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Preparing...';
  try {
    const ready = await ensureHtml2PdfLoaded();
    if (!ready || !window.html2pdf) return;
    await window.html2pdf()
      .set({
        margin: 10,
        filename: pdfViewerActiveFilename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
      })
      .from(content)
      .save();
  } catch (err) {
    console.error('PDF generation failed', err);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function printPdfFromModal() {
  const content = document.getElementById('pdf-viewer-content');
  if (!content) return;
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Print preview</title><link rel="stylesheet" href="styles.css"></head><body><div class="doc-viewer">${content.innerHTML}</div></body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 150);
}

function openProposalPdfTab() {
  const source = document.getElementById('prop-doc-viewer')?.innerHTML || '';
  openPdfViewerModal({
    title: 'Proposal preview',
    sourceHtml: source,
    filename: 'Fleet_Solutions_Proposal.pdf',
  });
}

function openContractPdfTab() {
  const source =
    document.getElementById('contract-doc-viewer')?.innerHTML ||
    document.getElementById('contract-doc-viewer2')?.innerHTML ||
    '';
  openPdfViewerModal({
    title: 'Purchase Agreement',
    sourceHtml: source,
    filename: 'Purchase_Agreement.pdf',
  });
}

function updateContractSendBtn() {
  const to = document.getElementById('contract-msg-to')?.value.trim();
  const sub = document.getElementById('contract-msg-subject')?.value.trim();
  const body = document.getElementById('contract-msg-body')?.value.trim();
  const btn = document.getElementById('footer-send');
  if (btn && screen === 'contract-review') btn.disabled = !(to && sub && body);
}

  function updateContractCharCount(el) {
  document.getElementById('contract-char-count').innerText = el.value.length + '/2000';
}

function deleteOption(id) {
  const optionNumber = options.findIndex((o) => o.id === id) + 1;
  options = options.filter(o => o.id !== id);
  if(options.length === 0) {
    document.getElementById('empty-state').classList.remove('hidden');
    document.getElementById('options-grid').classList.add('hidden');
  } else {
    renderOptions();
  }
  logProposalEvent('Option edited', `Option ${Math.max(1, optionNumber)} was removed.`);
}

function handleSend() {
  if(screen === 'drafting') {
    logProposalEvent('Review & send started', 'Proposal moved to Review & send.');
    touchNavDate('proposal_review', true);
    screen = 'review';
    document.getElementById('screen-drafting').classList.add('hidden');
    document.getElementById('screen-proposal-review').classList.remove('hidden');
    document.getElementById('footer-send').innerText = 'Send Proposal';
    document.getElementById('footer-send').disabled = false;
    document.getElementById('footer-back').classList.remove('hidden');
    document.getElementById('footer-back').classList.add('visible');
    
    // Global stepper is relevant
    // sub-stepper removed — nav is in header

    // Update Steppers
    document.getElementById('substep-dot-1').className = 'prop-step-dot done';
    document.getElementById('substep-date-1').innerText = new Date().toLocaleDateString();
    document.getElementById('substep-dot-2').className = 'prop-step-dot active';
    document.getElementById('substep-line-1').className = 'prop-line done';
    document.getElementById('substep-label-2').classList.remove('muted');
    
    showSuccessBanner('Proposal generated', 'Your Fleet Solutions Proposal is ready for final review.');
    renderProposalDoc();
    updateSendBtn();
    renderNav();
  } else if (screen === 'review') {
    const isResend = proposalWasSentToCustomer === true;
    proposalWasSentToCustomer = true;
    logProposalEvent(isResend ? 'Proposal re-sent' : 'Proposal sent', 'Proposal email was sent from Review & send.');
    touchNavDate('proposal_selection', true);
    screen = 'selection';
    document.getElementById('screen-proposal-review').classList.add('hidden');
    document.getElementById('screen-proposal-selection').classList.remove('hidden');
    
    document.getElementById('substep-dot-2').className = 'prop-step-dot done';
    document.getElementById('substep-date-2').innerText = new Date().toLocaleDateString();
    document.getElementById('substep-dot-3').className = 'prop-step-dot active';
    document.getElementById('substep-line-2').className = 'prop-line done';
    document.getElementById('substep-label-3').classList.remove('muted');

    showSuccessBanner('Proposal sent successfully', 'Your Fleet Solutions Proposal has been sent to acme.logistics@acmecorp.com');
    
    const sendBtn = document.getElementById('footer-send');
    sendBtn.innerText = 'Select Winning Option';
    sendBtn.classList.add('hidden'); // Only Back button in Step 3 footer
    sendBtn.disabled = true; // Wait for selection
    
    renderSelectionOptions();
    updateMarkDeadBtn();
    renderNav();
  } else if (screen === 'contract-review') {
    // Validate message fields
    const to = document.getElementById('contract-msg-to').value.trim();
    if (!to) { alert('Please enter a recipient email.'); return; }
    // Switch to phase 2: Sign & Payment
    document.getElementById('contract-phase-review').classList.add('hidden');
    document.getElementById('contract-phase-signpay').classList.remove('hidden');
    document.getElementById('contract-sub-stepper')?.classList.add('hidden');
    // Sync doc viewer 2
    const v1 = document.getElementById('contract-doc-viewer');
    const v2 = document.getElementById('contract-doc-viewer2');
    if (v1 && v2) v2.innerHTML = v1.innerHTML;
    // Stepper: step 1 done → step 2 active
    const d1 = document.getElementById('c-dot-1');
    const d2 = document.getElementById('c-dot-2');
    const l1 = document.getElementById('c-line-1');
    if (d1) { d1.className = 'c-step-dot done'; }
    if (l1) l1.className = 'c-line done';
    if (d2) d2.className = 'c-step-dot active';
    if (document.getElementById('c-dot-label-2')) document.getElementById('c-dot-label-2').className = 'c-step-label';
    const date1 = document.getElementById('contract-date-1');
    if (date1) date1.textContent = new Date().toLocaleDateString();
    // Set state and update chips
    contractSubState = 'waiting';
    logProposalEvent('Contract sent', 'Contract was sent for signature and payment setup.');
    touchNavDate('contract_review_send', true);
    touchNavDate('contract_sign_pay', true);
    updateContractSubState();
    document.getElementById('footer-send').classList.add('hidden');
    document.getElementById('footer-back').classList.add('visible');
    renderNav();
  }
}

function renderSolOptions() {
  const grid = document.getElementById('sol-options-grid');
  grid.innerHTML = options.map((opt, i) => {
    const { totalMonthly } = calcOption(opt, proposalData.promoType, proposalData.forcedTierIndex);
    const itemsHtml = opt.bundles.map(b => `<div class="sol-option-item">${b.qty}x ${b.coreName}</div>`).join('');
    return `
      <div class="sol-option-card">
        <div class="sol-option-label"><span>Option ${i+1}</span><span style="color:var(--gray-400); font-weight:400;">${opt.term} Mos</span></div>
        <div class="sol-option-price">${formatMoney(totalMonthly)}<span>/mo</span></div>
        <div class="sol-option-hw">Included hardware</div>
        ${itemsHtml}
      </div>`;
  }).join('');
}

function renderSelectionOptions() {
  const grid = document.getElementById('selection-grid');
  grid.innerHTML = options.map((opt, i) => {
    const { totalMonthly, totalUnits, avgUnit } = calcOption(opt, proposalData.promoType, proposalData.forcedTierIndex);
    const tier = getEffectiveTier(totalUnits, proposalData.forcedTierIndex);
    const skip = tier.index - tier.naturalIndex;
    const requiresApproval = skip > 0 && proposalData.approvalStatus !== 'Approved';

    let tierBadgeHtml = '';
    if (tier && tier.discount > 0) {
      tierBadgeHtml = `<span class="tier-badge">Tier ${tier.label}</span>`;
    } else if (totalUnits > 0) {
      tierBadgeHtml = `<span class="tier-badge" style="background:var(--gray-100);color:var(--gray-600);">Tier ${tier ? tier.label : '1-9'}</span>`;
    }

    let actionHtml = '';
    if (requiresApproval) {
      const role = getApprovalRole(skip);
      const isPending = proposalData.approvalStatus === 'Pending';
      actionHtml = `
        <button class="btn-request-approval ${isPending ? 'approved' : ''}" onclick="handleRequestApproval()">
          ${isPending ? 'Approval Requested' : 'Request approval'}
        </button>
        <div class="approval-sublabel ${isPending ? 'approved' : ''}">
          ${isPending ? 'Awaiting ' + role + ' decision' : 'Requires ' + role + ' Approval'}
        </div>
      `;
    } else {
      actionHtml = `
        <button class="btn-select-contract btn-select-contract--lg" onclick="selectOption(${opt.id})">Select &amp; create contract</button>
        <div class="select-note">Selecting on behalf of client — goes directly to Contract management</div>
      `;
    }

    const videoFeatureKeys = ['sd-256', 'adas', 'evc', 'monitor'];
    const vehicleFeatureKeys = ['driver-id', 'privacy', 'logbook'];

    let bundlesHtml = '';
    opt.bundles.forEach(b => {
      const { unitPrice, monthly, tier: bt } = calcBundle(b, opt.term, proposalData.promoType, proposalData.forcedTierIndex, totalUnits);
      const hasDisc = bt.discount > 0;
      const isVideo = b.coreKey === 'vtu-ffc' || b.coreKey === 'vtu-dual';
      const promoApplied = proposalData.promoType === 'Media' && isVideo;
      const featureKeys = Array.isArray(b.features) ? b.features : [];
      const videoFeatures = featureKeys
        .filter(k => videoFeatureKeys.includes(k))
        .map(k => featureLabels[k] || k);
      const vehicleFeatures = featureKeys
        .filter(k => vehicleFeatureKeys.includes(k))
        .map(k => featureLabels[k] || k);
      const featureMeta = `
        ${videoFeatures.length ? `<div class="bundle-feature-line"><strong>Video:</strong> ${videoFeatures.join(', ')}</div>` : ''}
        ${vehicleFeatures.length ? `<div class="bundle-feature-line"><strong>Vehicle features:</strong> ${vehicleFeatures.join(', ')}</div>` : ''}
      `;
      let discBadges = '';
      if (hasDisc) discBadges += `<span class="disc-badge">${(bt.discount*100)}% Volume disc</span> `;
      if (promoApplied) discBadges += `<span class="disc-badge" style="background:#0076CE">Media Promo −20%</span>`;

      bundlesHtml += `
        <div class="bundle-row">
          <div class="bundle-row-name">${b.coreName} <span style="float:right;font-weight:400;font-size:11px;color:var(--gray-600)">QTY: ${b.qty}</span></div>
          ${featureMeta}
          <div class="bundle-row-price">${formatMoney(monthly)}<span>/month</span></div>
          <div class="bundle-row-unit">${formatMoney(unitPrice)}/unit</div>
          <div style="margin-top:6px;">${discBadges}</div>
        </div>`;
    });

    return `
      <div class="option-card option-card--readonly">
        <div class="option-card-header">
          <span>Option ${i+1}</span>
        </div>
        <div class="option-card-body">
          <div class="term-readonly-block">
            <div class="field-label term-readonly-label">Contract term</div>
            <div class="term-readonly-value">${opt.term} months</div>
          </div>
          <div class="monthly-total">
            <div class="field-label" style="margin-top:12px;display:flex;align-items:center;justify-content:space-between;">
              <span>Monthly total</span>
              <div style="display:flex; align-items:center; gap:8px;">
                ${tierBadgeHtml}
                <span style="color:var(--gray-600); font-size:11px; font-weight:400; text-transform:uppercase;">QTY: ${totalUnits}</span>
              </div>
            </div>
            <div class="monthly-amount">${formatMoney(totalMonthly)}<span>/month</span></div>
            <div class="per-unit">${formatMoney(avgUnit)}/unit (avg)</div>
          </div>
          ${actionHtml}
          <div class="bundles-list">
            <div class="bundles-label"><span class="material-symbols-outlined" style="font-size:20px;">package_2</span> Bundle configured (${opt.bundles.length})</div>
            ${bundlesHtml || '<div style="font-size:11px;color:var(--gray-400);padding:16px;text-align:center;">No Bundles yet</div>'}
          </div>
        </div>
      </div>`;
  }).join('');
}

  function toggleMaterialsMenu() {
  document.getElementById('materials-menu').classList.toggle('hidden');
}
function toggleMaterial(el) {
  const cb = el.querySelector('input');
  cb.checked = !cb.checked;
}

function renderProposalDoc() {
  const viewer = document.getElementById('prop-doc-viewer');
  const dateStr = new Date().toLocaleDateString();
  
  let optionsHtml = options.map((opt, i) => {
    const { totalMonthly, avgUnit, totalUnits } = calcOption(opt, proposalData.promoType, proposalData.forcedTierIndex);
    return `
      <div style="margin-bottom: 24px; padding: 20px; border: 1px solid var(--gray-200); border-radius: 8px;">
        <div style="font-weight:700; margin-bottom:8px; display:flex; justify-content:space-between;">
          <span>Option ${i+1}</span>
          <span style="color:var(--gray-400); font-weight:400; font-size:11px;">TERM: ${opt.term} MOS</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:baseline;">
          <div style="font-size:18px; font-weight:800;">${formatMoney(totalMonthly)}/mo</div>
          <div style="font-size:12px; color:var(--gray-600);">${formatMoney(avgUnit)} avg unit cost</div>
        </div>
        <div style="font-size:11px; margin-top:4px; color:var(--gray-500);">Qty: ${totalUnits} total units</div>
      </div>
    `;
  }).join('');

  viewer.innerHTML = `
    <div class="doc-header">
      <div>
        <div class="doc-logo-box">V</div>
        <div class="doc-title" style="margin-top:16px;">Fleet Solutions Proposal</div>
        <div class="doc-ref">Ref: PROP-9284</div>
      </div>
      <div style="text-align: right;">
        <div style="font-weight: 800; font-size: 15px;">Acme Logistics Corp</div>
        <div style="color: var(--gray-500); font-size: 12px; margin-top: 4px;">
          123 Industrial Pkwy<br>
          Tampa, FL 33602<br>
          Date: ${dateStr}
        </div>
      </div>
    </div>
    <div class="doc-section-title">Summary of Investment Options</div>
    ${optionsHtml}
    <div style="margin-top:40px; font-size:12px; color:var(--gray-600); line-height:1.6; border-top:1px solid var(--gray-100); padding-top:20px;">
      <p>This proposal is non-binding until a formal agreement is signed.</p>
    </div>
  `;
  
  document.getElementById('prop-msg-subject').value = "";
  document.getElementById('prop-msg-body').value = "";
}

function goBack() { 
  if(screen==='review') { 
    screen='drafting'; 
    document.getElementById('screen-proposal-review').classList.add('hidden');
    document.getElementById('screen-drafting').classList.remove('hidden');
    // // sub-stepper removed // Keep stepper visible
    document.getElementById('footer-back').classList.remove('visible');
    document.getElementById('footer-send').innerText = 'Review and Send';
    document.getElementById('footer-send').onclick = handleSend;
    document.getElementById('vc-body').style.paddingTop = '159px';
    
    // Reset banner top just in case
    document.getElementById('success-banner').style.top = '159px';
    
    // Reset sub-stepper visual state for next time
    document.getElementById('substep-dot-1').className = 'prop-step-dot active';
    document.getElementById('substep-dot-2').className = 'prop-step-dot pending';
    document.getElementById('substep-dot-3').className = 'prop-step-dot pending';
    document.getElementById('substep-line-1').className = 'prop-line';
    document.getElementById('substep-line-2').className = 'prop-line';
    document.getElementById('substep-label-2').classList.add('muted');
    document.getElementById('substep-label-3').classList.add('muted');
    
    renderOptions();
    renderNav();
  } else if (screen === 'selection') {
    screen = 'review';
    renderNav();
    document.getElementById('screen-proposal-selection').classList.add('hidden');
    document.getElementById('screen-proposal-review').classList.remove('hidden');
    document.getElementById('footer-send').innerText = 'Send Proposal';
    document.getElementById('footer-send').onclick = handleSend;

    document.getElementById('substep-dot-2').className = 'prop-step-dot active';
    document.getElementById('substep-dot-3').className = 'prop-step-dot pending';
    document.getElementById('substep-line-2').className = 'prop-line';
    document.getElementById('substep-label-3').classList.add('muted');
    
    document.getElementById('footer-send').classList.remove('hidden'); // Show send button again
    
    renderProposalDoc();
  } else if (screen === 'contract-review') {
    // If in phase 2 (sign&pay), go back to phase 1 (review form)
    const phase2 = document.getElementById('contract-phase-signpay');
    if (phase2 && !phase2.classList.contains('hidden')) {
      clearSignatureCompletionSimulation();
      phase2.classList.add('hidden');
      document.getElementById('contract-phase-review').classList.remove('hidden');
      document.getElementById('contract-sub-stepper')?.classList.add('hidden');
      contractSubState = 'pre-send';
      // Restore stepper to step 1
      const d1=document.getElementById('c-dot-1');const d2=document.getElementById('c-dot-2');const l1=document.getElementById('c-line-1');
      if(d1)d1.className='c-step-dot active';if(d2)d2.className='c-step-dot pending';if(l1)l1.className='c-line';
      if(document.getElementById('c-dot-label-2'))document.getElementById('c-dot-label-2').className='c-step-label muted';
      document.getElementById('footer-send').classList.remove('hidden');
      document.getElementById('footer-send').innerText='Send E-Sign Link';
      return;
    }
    screen = 'selection'; 
    document.getElementById('screen-contract').classList.add('hidden');
    document.getElementById('screen-proposal-selection').classList.remove('hidden');
    // sub-stepper removed — nav is in header
    document.getElementById('vc-body').style.paddingTop = '159px';
    document.getElementById('success-banner').style.top = '159px';
    document.getElementById('footer-send').innerText = 'Select Winning Option';
    document.getElementById('footer-back').classList.remove('hidden');
    
    const sendBtn = document.getElementById('footer-send');
    sendBtn.onclick = () => {
       sendBtn.disabled = true;
    };
    
    renderSelectionOptions();
    updateMarkDeadBtn();
  }
}
function updateCharCount(el) { 
  document.getElementById('char-count').innerText = el.value.length; 
  updateSendBtn();
}
function updateSendBtn() {
  const btn = document.getElementById('footer-send');
  if (screen === 'drafting') {
    const hasAnyBundle = options.some(opt => opt.bundles && opt.bundles.length > 0);
    btn.disabled = !hasAnyBundle;
  } else if (screen === 'review') {
    const to = document.getElementById('prop-msg-to').value.trim();
    btn.disabled = (to === "");
  } else if (screen === 'selection') {
    btn.innerText = 'Select Winning Option';
    btn.disabled = true; // Enabled when a card is selected
  } else if (screen === 'contract-review') {
    const to = document.getElementById('contract-msg-to').value.trim();
    btn.disabled = (to === ""); 
  }
}

// ── Initial render ──────────────────────────────────────────────
renderNav();
renderOptions();
updateApprovalSnackbar();
updateMarkDeadBtn();