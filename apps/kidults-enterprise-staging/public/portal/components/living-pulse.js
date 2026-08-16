const STORAGE_KEY = "kidults.living-pulse.v1";
const STYLE_ID = "kidults-living-pulse-style";
const ROOT_ID = "kidults-living-pulse";

const DEFAULT_CONTRACT = Object.freeze({
  engine_id: "kidults-living-pulse",
  version: "0.2.0",
  poll_interval_ms: 60_000,
  clock_interval_ms: 30_000,
  freshness_thresholds_minutes: {
    fresh: 15,
    current: 360
  },
  allowed_states: ["FRESH", "CURRENT", "STALE", "WAITING", "NOT_AVAILABLE"]
});

const esc = value =>
  String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));

function parseTimestamp(value) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function newestTimestamp(values) {
  const valid = values
    .map(parseTimestamp)
    .filter(Number.isFinite);
  return valid.length ? Math.max(...valid) : null;
}

function formatAbsolute(value) {
  const time = parseTimestamp(value);
  if (time === null) return "NOT AVAILABLE";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(time));
}

function formatAge(value, now = Date.now()) {
  const time = parseTimestamp(value);
  if (time === null) return "NOT AVAILABLE";

  const deltaMinutes = Math.max(0, Math.floor((now - time) / 60_000));
  if (deltaMinutes < 1) return "just now";
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;

  const hours = Math.floor(deltaMinutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function resolveFreshness(value, contract = DEFAULT_CONTRACT, now = Date.now()) {
  const time = parseTimestamp(value);
  if (time === null) return "WAITING";

  const thresholds = contract.freshness_thresholds_minutes ?? DEFAULT_CONTRACT.freshness_thresholds_minutes;
  const ageMinutes = Math.max(0, (now - time) / 60_000);

  if (ageMinutes <= Number(thresholds.fresh)) return "FRESH";
  if (ageMinutes <= Number(thresholds.current)) return "CURRENT";
  return "STALE";
}

function normalizeContract(contract) {
  const candidate = contract && typeof contract === "object" ? contract : {};
  return {
    ...DEFAULT_CONTRACT,
    ...candidate,
    freshness_thresholds_minutes: {
      ...DEFAULT_CONTRACT.freshness_thresholds_minutes,
      ...(candidate.freshness_thresholds_minutes ?? {})
    },
    allowed_states: Array.isArray(candidate.allowed_states)
      ? candidate.allowed_states
      : DEFAULT_CONTRACT.allowed_states
  };
}

function buildObservation(data) {
  const registry = data.registry ?? {};
  const signals = data.signals ?? {};
  const archive = data.archive ?? {};
  const research = data.research ?? {};
  const manifest = data.manifest ?? {};

  return {
    releaseVersion: manifest.version ?? null,
    releaseStatus: manifest.status ?? null,
    registryGeneratedAt: registry.generated_at ?? null,
    registryAsOf: registry.freshness?.as_of ?? null,
    registryVersion: registry.registry_system_version ?? null,
    candidateId: registry.snapshot?.candidate_id ?? null,
    candidateStatus: registry.snapshot?.candidate_status ?? "WAITING",
    assessmentId: registry.assessment?.current_id ?? null,
    assessmentStatus: registry.assessment?.status ?? "WAITING",
    signalUpdatedAt: signals.updated_at ?? null,
    signalCount: Array.isArray(signals.signals) ? signals.signals.length : 0,
    researchIssue: research.issue ?? null,
    latestArchiveEdition: archive.editions?.[0]?.edition ?? null,
    trackStates: registry.track_states ?? {}
  };
}

function readPreviousObservation() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeObservation(observation) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(observation));
  } catch {
    // Browsers with blocked storage still receive the live current-state view.
  }
}

function describeChanges(previous, current) {
  if (!previous) {
    return [{
      type: "BASELINE",
      title: "Observation baseline captured",
      detail: "Future approved Registry changes will appear here."
    }];
  }

  const changes = [];

  if (previous.registryGeneratedAt !== current.registryGeneratedAt) {
    changes.push({
      type: "REGISTRY",
      title: "Registry projection refreshed",
      detail: current.registryGeneratedAt
        ? `Generated ${formatAbsolute(current.registryGeneratedAt)}`
        : "Registry generation time is not available."
    });
  }

  if (previous.releaseVersion !== current.releaseVersion || previous.releaseStatus !== current.releaseStatus) {
    changes.push({
      type: "RELEASE",
      title: "Portal release state changed",
      detail: `${current.releaseVersion ?? "NOT AVAILABLE"} · ${current.releaseStatus ?? "NOT AVAILABLE"}`
    });
  }

  if (previous.candidateId !== current.candidateId || previous.candidateStatus !== current.candidateStatus) {
    changes.push({
      type: "SNAPSHOT",
      title: current.candidateId ? "Candidate snapshot registered" : "Candidate snapshot state changed",
      detail: current.candidateId ?? current.candidateStatus
    });
  }

  if (previous.assessmentId !== current.assessmentId || previous.assessmentStatus !== current.assessmentStatus) {
    changes.push({
      type: "ASSESSMENT",
      title: current.assessmentId ? "Assessment registered" : "Assessment state changed",
      detail: current.assessmentId ?? current.assessmentStatus
    });
  }

  if (previous.signalUpdatedAt !== current.signalUpdatedAt) {
    changes.push({
      type: "SIGNAL",
      title: "Market signal snapshot changed",
      detail: current.signalUpdatedAt
        ? `As of ${formatAbsolute(current.signalUpdatedAt)}`
        : "Signal timestamp is not available."
    });
  }

  if (previous.researchIssue !== current.researchIssue) {
    changes.push({
      type: "RESEARCH",
      title: "Research issue changed",
      detail: current.researchIssue ?? "NOT AVAILABLE"
    });
  }

  if (previous.latestArchiveEdition !== current.latestArchiveEdition) {
    changes.push({
      type: "ARCHIVE",
      title: "Archive edition changed",
      detail: current.latestArchiveEdition ?? "NOT AVAILABLE"
    });
  }

  const allTracks = new Set([
    ...Object.keys(previous.trackStates ?? {}),
    ...Object.keys(current.trackStates ?? {})
  ]);
  for (const track of allTracks) {
    if (previous.trackStates?.[track] !== current.trackStates?.[track]) {
      changes.push({
        type: "TRACK",
        title: `Track ${track} state changed`,
        detail: `${previous.trackStates?.[track] ?? "NOT AVAILABLE"} → ${current.trackStates?.[track] ?? "NOT AVAILABLE"}`
      });
    }
  }

  return changes.length ? changes : [{
    type: "NO_CHANGE",
    title: "No approved change detected",
    detail: "The current Registry projection matches the last observation in this browser."
  }];
}

function buildModel(data, contract, previousObservation, now = Date.now()) {
  const observation = buildObservation(data);
  const registryConnected = Boolean(data.meta?.registryProjectionConnected);
  const asOf = data.registry?.freshness?.as_of ?? data.registry?.generated_at ?? null;
  const newest = newestTimestamp([
    asOf,
    data.signals?.updated_at,
    data.manifest?.build_at,
    data.manifest?.registered_at
  ]);
  const newestIso = newest === null ? null : new Date(newest).toISOString();
  const freshness = registryConnected
    ? resolveFreshness(asOf, contract, now)
    : "NOT_AVAILABLE";
  const changes = describeChanges(previousObservation, observation);

  return {
    observation,
    registryConnected,
    registryState: registryConnected ? "CONNECTED" : "NOT_AVAILABLE",
    freshness,
    asOf,
    newestIso,
    changes,
    candidate: data.registry?.snapshot?.candidate_id ?? data.registry?.snapshot?.candidate_status ?? "WAITING",
    assessment: data.registry?.assessment?.current_id ?? data.registry?.assessment?.status ?? "WAITING",
    release: data.manifest?.status ?? "NOT_AVAILABLE",
    sourceMode: data.manifest?.source_mode ?? "NOT_AVAILABLE",
    signalCount: Array.isArray(data.signals?.signals) ? data.signals.signals.length : 0
  };
}

function ensureStylesheet() {
  const href = "components/living-pulse.css?v=667";
  const existing = document.getElementById(STYLE_ID);
  if (existing) {
    if (existing.getAttribute("href") !== href) existing.setAttribute("href", href);
    return;
  }

  const link = document.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = href;
  document.head.append(link);
}

function ensureRoot() {
  const existing = document.getElementById(ROOT_ID);
  if (existing) return existing;

  const root = document.createElement("section");
  root.id = ROOT_ID;
  root.className = "living-pulse";
  root.dataset.mobileDesign = "v667";
  root.setAttribute("aria-label", "Living Intelligence status");
  root.innerHTML = `
    <div class="shell living-pulse__bar">
      <button class="living-pulse__identity" type="button" data-pulse-toggle aria-expanded="false" aria-controls="living-pulse-panel">
        <span class="living-pulse__orb" data-pulse-orb aria-hidden="true"></span>
        <span>
          <small>OBSERVING</small>
          <b>Living Intelligence</b>
          <span class="living-pulse__promise">Signals move. We observe. You stay ahead.</span>
        </span>
      </button>

      <dl class="living-pulse__metrics" aria-live="polite">
        <div><dt>Registry</dt><dd data-pulse-registry>WAITING</dd></div>
        <div><dt>Freshness</dt><dd data-pulse-freshness>WAITING</dd></div>
        <div><dt>Candidate</dt><dd data-pulse-candidate>WAITING</dd></div>
        <div><dt>Assessment</dt><dd data-pulse-assessment>WAITING</dd></div>
      </dl>

      <button class="living-pulse__changes-button" type="button" data-pulse-toggle aria-expanded="false" aria-controls="living-pulse-panel">
        What changed
        <strong data-pulse-change-count>—</strong>
      </button>
    </div>

    <div class="shell living-pulse__panel" id="living-pulse-panel" data-pulse-panel hidden>
      <div class="living-pulse__panel-head">
        <div>
          <p class="eyebrow">CURRENT OBSERVATION</p>
          <h2>What the system can verify now.</h2>
        </div>
        <button type="button" class="living-pulse__close" data-pulse-close aria-label="Close Living Intelligence details">Close</button>
      </div>

      <div class="living-pulse__detail-grid">
        <article>
          <span>Registry projection</span>
          <strong data-pulse-registry-detail>WAITING</strong>
          <small data-pulse-registry-time>NOT AVAILABLE</small>
        </article>
        <article>
          <span>Release state</span>
          <strong data-pulse-release>WAITING</strong>
          <small data-pulse-source-mode>NOT AVAILABLE</small>
        </article>
        <article>
          <span>Observed signals</span>
          <strong data-pulse-signal-count>—</strong>
          <small data-pulse-newest-time>NOT AVAILABLE</small>
        </article>
      </div>

      <div class="living-pulse__changes">
        <div class="living-pulse__changes-head">
          <h3>Changes since the last observation</h3>
          <span data-pulse-sync-state>Monitoring</span>
        </div>
        <ol data-pulse-changes></ol>
      </div>
    </div>
  `;

  const ribbon = document.querySelector(".registry-ribbon");
  if (ribbon) {
    ribbon.insertAdjacentElement("afterend", root);
  } else {
    document.querySelector(".site-header")?.insertAdjacentElement("afterend", root);
  }

  return root;
}

function renderChanges(root, changes) {
  const list = root.querySelector("[data-pulse-changes]");
  list.innerHTML = changes.map(change => `
    <li data-change-type="${esc(change.type)}">
      <span>${esc(change.type.replaceAll("_", " "))}</span>
      <div>
        <strong>${esc(change.title)}</strong>
        <p>${esc(change.detail)}</p>
      </div>
    </li>
  `).join("");
}

function renderModel(root, model) {
  root.dataset.state = model.freshness;

  const registry = root.querySelector("[data-pulse-registry]");
  registry.textContent = model.registryState.replaceAll("_", " ");
  registry.dataset.state = model.registryState;

  const freshness = root.querySelector("[data-pulse-freshness]");
  freshness.textContent = model.freshness;
  freshness.dataset.state = model.freshness;

  root.querySelector("[data-pulse-candidate]").textContent = String(model.candidate).replaceAll("_", " ");
  root.querySelector("[data-pulse-assessment]").textContent = String(model.assessment).replaceAll("_", " ");
  root.querySelector("[data-pulse-change-count]").textContent =
    model.changes[0]?.type === "NO_CHANGE" ? "0" : String(model.changes.length);

  const orb = root.querySelector("[data-pulse-orb]");
  orb.dataset.state = model.freshness;

  root.querySelector("[data-pulse-registry-detail]").textContent =
    model.registryConnected ? "CONNECTED" : "NOT AVAILABLE";
  root.querySelector("[data-pulse-registry-time]").textContent =
    model.asOf
      ? `${formatAge(model.asOf)} · ${formatAbsolute(model.asOf)}`
      : "NOT AVAILABLE";
  root.querySelector("[data-pulse-release]").textContent = String(model.release).replaceAll("_", " ");
  root.querySelector("[data-pulse-source-mode]").textContent = String(model.sourceMode).replaceAll("_", " ");
  root.querySelector("[data-pulse-signal-count]").textContent = String(model.signalCount);
  root.querySelector("[data-pulse-newest-time]").textContent =
    model.newestIso
      ? `Latest registered source: ${formatAge(model.newestIso)}`
      : "No registered source timestamp";

  renderChanges(root, model.changes);
}

function decorateLivingObjects(data, model) {
  const snapshotId = data.manifest?.snapshot_id ?? "NOT AVAILABLE";
  const assessment = data.registry?.assessment?.status ?? "WAITING";

  document.querySelectorAll("[data-k100-gallery] .k100-card").forEach((card, index) => {
    const item = data.k100?.items?.[index];
    if (!item) return;

    card.dataset.livingState = item.score === null ? "WAITING" : model.freshness;

    let state = card.querySelector(".living-object-state");
    if (!state) {
      state = document.createElement("div");
      state.className = "living-object-state";
      card.append(state);
    }

    state.innerHTML = `
      <span data-state="${esc(item.score === null ? "WAITING" : model.freshness)}">
        ${esc(item.score === null ? "EVIDENCE BUILDING" : "PREVIEW OBSERVATION")}
      </span>
      <small>Snapshot ${esc(snapshotId)}</small>
      <small>Assessment ${esc(assessment.replaceAll("_", " "))}</small>
    `;
  });

  document.querySelectorAll("[data-signal-grid] .signal-card").forEach(card => {
    let badge = card.querySelector(".living-freshness-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "living-freshness-badge";
      card.querySelector("header")?.append(badge);
    }
    badge.dataset.state = model.freshness;
    badge.textContent = model.freshness;
  });
}

function setupPanel(root) {
  const panel = root.querySelector("[data-pulse-panel]");
  const toggles = root.querySelectorAll("[data-pulse-toggle]");
  const close = root.querySelector("[data-pulse-close]");

  const setOpen = open => {
    panel.hidden = !open;
    toggles.forEach(toggle => toggle.setAttribute("aria-expanded", String(open)));
    root.classList.toggle("is-open", open);
  };

  toggles.forEach(toggle => {
    toggle.addEventListener("click", () => setOpen(panel.hidden));
  });
  close.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !panel.hidden) setOpen(false);
  });
}

export function startLivingPulse({
  data,
  reload,
  contract: rawContract,
  pollIntervalMs
}) {
  ensureStylesheet();
  const root = ensureRoot();
  setupPanel(root);

  const contract = normalizeContract(rawContract);
  const interval = Math.max(
    30_000,
    Number(pollIntervalMs ?? contract.poll_interval_ms ?? DEFAULT_CONTRACT.poll_interval_ms)
  );
  const clockInterval = Math.max(
    15_000,
    Number(contract.clock_interval_ms ?? DEFAULT_CONTRACT.clock_interval_ms)
  );

  let currentData = data;
  let previousObservation = readPreviousObservation();
  let model = buildModel(currentData, contract, previousObservation);

  renderModel(root, model);
  decorateLivingObjects(currentData, model);
  writeObservation(model.observation);
  previousObservation = model.observation;

  const syncState = root.querySelector("[data-pulse-sync-state]");

  const refresh = async () => {
    if (typeof reload !== "function" || document.hidden) return model;

    root.dataset.sync = "refreshing";
    syncState.textContent = "Refreshing";

    try {
      const nextData = await reload();
      const nextModel = buildModel(nextData, contract, previousObservation);
      currentData = nextData;
      model = nextModel;
      renderModel(root, model);
      decorateLivingObjects(currentData, model);
      writeObservation(model.observation);
      previousObservation = model.observation;
      root.dataset.sync = "current";
      syncState.textContent = "Monitoring";
      return model;
    } catch (error) {
      console.error("KIDULTS Living Pulse refresh failed.", error);
      root.dataset.sync = "error";
      syncState.textContent = "Refresh unavailable";
      return model;
    }
  };

  const pollTimer = window.setInterval(refresh, interval);
  const clockTimer = window.setInterval(() => {
    const nextModel = buildModel(currentData, contract, previousObservation);
    model = {
      ...nextModel,
      changes: model.changes
    };
    renderModel(root, model);
    decorateLivingObjects(currentData, model);
  }, clockInterval);

  window.KIDULTS_LIVING_PULSE = Object.freeze({
    version: contract.version,
    design: root.dataset.mobileDesign,
    refresh,
    stop() {
      window.clearInterval(pollTimer);
      window.clearInterval(clockTimer);
    }
  });

  return window.KIDULTS_LIVING_PULSE;
}