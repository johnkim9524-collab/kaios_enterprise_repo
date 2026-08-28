import {
  readMobileProjection,
  normalizeIntelligenceState,
  normalizeReleaseState,
  mobileStructuralVerticals,
} from '/mobile/projection-client.js';

const BLOCKED = new Set(['WAITING', 'STALE', 'INVALID', 'RIGHTS_BLOCKED', 'NOT_AVAILABLE', 'NO_PROJECTION']);
const PUBLIC_REASONS = new Set(['INITIALIZING', 'REVALIDATING', 'SCHEDULED_REVALIDATION', 'DOCUMENT_HIDDEN', 'PAGE_HIDDEN', 'NO_GOVERNED_PROJECTION', 'NO_PROJECTION', 'RIGHTS_BLOCKED', 'STALE', 'INVALID', 'LOAD_FAILURE', 'MOBILE_PROJECTION_TIMEOUT', 'MOBILE_VERIFIED_CAPABILITY_ADMISSION']);
const q = (selector, root = document) => root.querySelector(selector);
const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
const label = value => String(value ?? 'NOT_AVAILABLE').replaceAll('_', ' ');
const publicReason = value => PUBLIC_REASONS.has(value) ? value : 'LOAD_FAILURE';
const text = (selector, value) => { const node = q(selector); if (node) node.textContent = label(value); };

function renderVerticals(verticals = []) {
  const root = q('[data-mobile-verticals]');
  if (!root) return;
  root.replaceChildren(...verticals.slice(0, 8).map((vertical, index) => {
    const item = document.createElement('article');
    item.className = 'm-vertical-item';
    item.setAttribute('role', 'listitem');
    const number = document.createElement('span');
    number.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('b');
    name.textContent = vertical?.label ?? 'Unavailable vertical';
    const state = document.createElement('em');
    state.textContent = label(vertical?.structural_state ?? 'UNAVAILABLE');
    item.append(number, name, state);
    return item;
  }));
}

function renderSignals(signals = [], projectionState) {
  const root = q('[data-mobile-signals]');
  if (!root) return 'NOT_AVAILABLE';
  const safeSlots = [
    { label: 'Market scale' }, { label: 'Venue depth' }, { label: 'Transaction activity' },
    { label: 'Liquidity' }, { label: 'Demand / scarcity' }, { label: 'Momentum' }
  ];
  const available = safeSlots.map((fallback, index) => signals[index] ?? fallback);
  let liveCount = 0;
  root.replaceChildren(...available.map(signal => {
    const live = projectionState === 'LIVE_APPROVED' && normalizeIntelligenceState(signal?.state) === 'LIVE_APPROVED';
    if (live) liveCount += 1;
    const item = document.createElement('article');
    item.className = 'm-signal';
    const name = document.createElement('small');
    name.textContent = signal?.label ?? 'Signal';
    const value = document.createElement('strong');
    value.textContent = live && signal?.value != null ? String(signal.value) : 'NOT VERIFIED';
    const meta = document.createElement('span');
    meta.textContent = live ? `${label(signal.confidence)} · ${label(signal.as_of)}` : 'Evidence required';
    item.append(name, value, meta);
    return item;
  }));
  if (!signals.length || liveCount === 0) return projectionState === 'LIVE_APPROVED' ? 'NOT_AVAILABLE' : projectionState;
  return liveCount === available.length ? 'LIVE_APPROVED' : 'WAITING';
}

function renderEvidence(methodology = {}, projectionState) {
  const root = q('[data-mobile-evidence]');
  if (!root) return;
  const live = projectionState === 'LIVE_APPROVED';
  const values = [
    ['Coverage', live ? methodology.coverage : projectionState],
    ['Independence', live ? methodology.independence : 'NOT VERIFIED'],
    ['Freshness', live ? methodology.freshness : 'NOT AVAILABLE'],
    ['Rights', methodology.rights ?? 'WAITING'],
    ['Methodology', live ? methodology.methodology_version : 'WITHHELD'],
    ['Lineage', live ? methodology.lineage_version : 'WITHHELD']
  ];
  root.replaceChildren(...values.map(([name, value]) => {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = name;
    detail.textContent = label(value);
    row.append(term, detail);
    return row;
  }));
}

function render(data) {
  const projection = data?.projection ?? {};
  const state = normalizeIntelligenceState(projection.state);
  const release = normalizeReleaseState(data?.release?.state);
  document.documentElement.dataset.state = state;
  document.documentElement.dataset.mobileReady = 'true';
  text('[data-header-state]', state);
  text('[data-projection-state]', state);
  text('[data-projection-asof]', projection.as_of ?? '—');
  text('[data-rights-state]', projection.rights_state ?? 'WAITING');
  text('[data-dialog-projection]', state);
  text('[data-dialog-assessment]', projection.assessment_id ?? 'NOT STARTED');
  text('[data-dialog-freshness]', projection.freshness ?? 'NOT AVAILABLE');
  text('[data-dialog-asof]', projection.as_of ?? 'NOT AVAILABLE');
  text('[data-dialog-rights]', projection.rights_state ?? 'WAITING');
  text('[data-dialog-release]', release);
  text('[data-dialog-reason]', publicReason(data?.audit?.reason_category ?? (BLOCKED.has(state) ? state : 'LOAD_FAILURE')));
  const briefCopy = state === 'LIVE_APPROVED'
    ? 'A governed Projection is available. Every visible claim remains evidence-, freshness- and rights-bound.'
    : state === 'WAITING'
      ? 'Projection is being verified. Structural scope remains visible; market claims stay withheld.'
      : state === 'NO_PROJECTION'
        ? 'No governed Projection is available. Structure remains visible; market claims stay withheld.'
        : 'A governed Projection could not be verified. Structure remains visible; market claims stay withheld.';
  text('[data-brief-copy]', briefCopy);

  renderVerticals(data?.verticals ?? []);
  text('[data-signal-state]', renderSignals(data?.signals ?? [], state));
  renderEvidence(data?.evidence_methodology ?? {}, state);

  const k100 = data?.kidult_100 ?? {};
  const k100State = normalizeIntelligenceState(k100.state ?? 'NOT_AVAILABLE');
  const k100Live = state === 'LIVE_APPROVED'
    && k100State === 'LIVE_APPROVED'
    && Number.isFinite(k100.index_value)
    && typeof k100.as_of === 'string'
    && typeof k100.methodology_version === 'string';
  text('[data-k100-state]', k100Live ? 'LIVE APPROVED' : k100State);
  text('[data-k100-value]', k100Live && Number.isFinite(k100.index_value) ? k100.index_value : '—');
  text('[data-k100-note]', k100Live ? `As of ${label(k100.as_of)} · ${label(k100.methodology_version)}` : 'Ranking waits for approved evidence.');
}

function renderClosed(state, reason) {
  render({
    projection: { state, rights_state: 'WAITING', freshness: state === 'STALE' ? 'STALE' : 'NOT_AVAILABLE' },
    release: { state: 'HOLD' },
    verticals: [...mobileStructuralVerticals], signals: [], kidult_100: { state },
    evidence_methodology: {}, audit: { reason_category: reason }
  });
}

function renderFailure(reason = 'LOAD FAILURE') {
  renderClosed('INVALID', reason);
}

function renderPending(reason = 'INITIALIZING') {
  render({
    projection: { state: 'WAITING', rights_state: 'WAITING', freshness: 'NOT_AVAILABLE' },
    release: { state: 'HOLD' },
    verticals: [...mobileStructuralVerticals], signals: [], kidult_100: { state: 'WAITING' },
    evidence_methodology: {}, audit: { reason_category: reason }
  });
}

const dialog = q('#mobile-status-dialog');
qa('[data-open-status]').forEach(button => button.addEventListener('click', () => {
  if (!dialog?.open) dialog?.showModal();
}));
dialog?.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

const navSections = qa('.m-bottom-nav a[href^="#"]')
  .map(link => ({ link, section: q(link.getAttribute('href')) }))
  .filter(item => item.section);
const signalLink = q('.m-bottom-nav a[href="#signals"]');
const kidult100 = q('#kidult-100');
if (signalLink && kidult100) navSections.push({ link: signalLink, section: kidult100 });
const activateNav = active => {
  const activeLink = navSections.find(({ section }) => section === active)?.link;
  qa('.m-bottom-nav a').forEach(link => {
    if (link === activeLink) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
};
const activateHashNav = () => {
  const matching = navSections.find(({ link }) => link.getAttribute('href') === location.hash);
  if (matching) activateNav(matching.section);
};
navSections.forEach(({ link, section }) => link.addEventListener('click', () => activateNav(section)));
addEventListener('hashchange', activateHashNav);
queueMicrotask(activateHashNav);
const navObserver = 'IntersectionObserver' in globalThis
  ? new IntersectionObserver(entries => {
      // A declared hash is the navigation source of truth, including history/BFCache restores.
      // Scroll observation is used only before the user selects an explicit mobile section.
      if (navSections.some(({ link }) => link.getAttribute('href') === location.hash)) {
        activateHashNav();
        return;
      }
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
        activateNav(q('#evidence'));
        return;
      }
      const visible = entries.filter(entry => entry.isIntersecting).sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (visible) activateNav(visible.target);
    }, { rootMargin: '-18% 0px -62% 0px', threshold: [0, .15, .4] })
  : null;
navSections.forEach(({ section }) => navObserver?.observe(section));

let controller = null;
let timer = null;
let disposed = false;
let requestEpoch = 0;
let closedStateStreak = 0;
const MAX_REVALIDATE_MS = 300_000;

function boundedRevalidationDelay(data) {
  if (data?.projection?.state === 'LIVE_APPROVED') {
    closedStateStreak = 0;
    return Math.min(MAX_REVALIDATE_MS, Math.max(5_000, Number(data?.runtime_revalidate_after_ms) || 5_000));
  }
  closedStateStreak = Math.min(3, closedStateStreak + 1);
  const base = Math.max(60_000, Number(data?.runtime_revalidate_after_ms) || 60_000);
  return Math.min(MAX_REVALIDATE_MS, base * (2 ** (closedStateStreak - 1)));
}

function jittered(delay) {
  const spread = Math.max(1, Math.floor(delay * .15));
  const bytes = new Uint32Array(1);
  globalThis.crypto?.getRandomValues?.(bytes);
  return Math.min(MAX_REVALIDATE_MS, delay + (bytes[0] % spread));
}

async function refresh({ initial = false } = {}) {
  if (disposed || controller || (!initial && document.visibilityState === 'hidden')) return;
  if (initial) {
    renderPending('REVALIDATING');
    delete document.documentElement.dataset.mobileReady;
  } else {
    document.documentElement.dataset.revalidating = 'true';
  }
  const epoch = ++requestEpoch;
  const localController = new AbortController();
  controller = localController;
  let timedOut = false;
  let nextDelay = 60_000;
  const timeout = setTimeout(() => {
    timedOut = true;
    localController.abort();
  }, 8_000);
  try {
    const data = await readMobileProjection({
      url: '/api/mobile/v1/projection',
      controlUrl: '/mobile/data/no-projection.json',
      signal: localController.signal
    });
    nextDelay = boundedRevalidationDelay(data);
    if (!disposed && epoch === requestEpoch && controller === localController) render(data);
  } catch (error) {
    closedStateStreak = Math.min(3, closedStateStreak + 1);
    nextDelay = Math.min(MAX_REVALIDATE_MS, 60_000 * (2 ** (closedStateStreak - 1)));
    if (!disposed && epoch === requestEpoch && controller === localController) {
      if (timedOut) renderFailure('MOBILE_PROJECTION_TIMEOUT');
      else if (error?.name !== 'AbortError') renderFailure('LOAD_FAILURE');
    }
  } finally {
    clearTimeout(timeout);
    delete document.documentElement.dataset.revalidating;
    if (controller !== localController || epoch !== requestEpoch) return;
    controller = null;
    clearTimeout(timer);
    if (!disposed && document.visibilityState === 'visible') timer = setTimeout(refresh, jittered(nextDelay));
  }
}

function scrubAndAbort(reason) {
  requestEpoch += 1;
  controller?.abort(reason);
  controller = null;
  clearTimeout(timer);
  timer = null;
  renderPending(reason);
  delete document.documentElement.dataset.mobileReady;
}

addEventListener('pagehide', () => {
  disposed = true;
  scrubAndAbort('PAGE_HIDDEN');
});
addEventListener('pageshow', event => {
  if (!event.persisted) return;
  disposed = false;
  scrubAndAbort('REVALIDATING');
  refresh({ initial: true });
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    disposed = false;
    refresh({ initial: true });
  } else {
    scrubAndAbort('DOCUMENT_HIDDEN');
  }
});
addEventListener('online', () => {
  if (!disposed && document.visibilityState === 'visible') refresh({ initial: true });
});

renderPending('INITIALIZING');
delete document.documentElement.dataset.mobileReady;
refresh({ initial: true });
