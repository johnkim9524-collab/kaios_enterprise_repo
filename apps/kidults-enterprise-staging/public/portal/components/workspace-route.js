const QUERY_MODES = Object.freeze({
  ask: "ask",
  compare: "compare",
  decide: "decision",
  decision: "decision"
});

const HASH_MODES = Object.freeze({
  ask: "ask",
  "ask-kidults": "ask",
  compare: "compare",
  "compare-intelligence": "compare",
  decide: "decision",
  decision: "decision",
  "decision-support": "decision"
});

const VALID_MODES = Object.freeze(["ask", "compare", "decision"]);

function normalizedToken(value) {
  try {
    return decodeURIComponent(String(value ?? "")).trim().toLowerCase();
  } catch {
    return String(value ?? "").trim().toLowerCase();
  }
}

function contractHashModes(panels) {
  const modes = { ...HASH_MODES };
  for (const panel of Array.isArray(panels) ? panels : []) {
    const id = normalizedToken(panel?.id);
    if (!VALID_MODES.includes(id)) continue;
    modes[id] = id;
    const hash = normalizedToken(panel?.hash).replace(/^#/, "");
    if (hash) modes[hash] = id;
  }
  return modes;
}

export function resolveWorkspaceMode({ href, activeMode = "ask", panels = [] } = {}) {
  const url = new URL(href ?? "https://workspace.invalid/", "https://workspace.invalid/");
  const modes = contractHashModes(panels);
  const hash = normalizedToken(url.hash.replace(/^#/, ""));
  if (modes[hash]) return modes[hash];

  for (const parameter of ["tool", "mode"]) {
    const queryMode = QUERY_MODES[normalizedToken(url.searchParams.get(parameter))];
    if (queryMode) return queryMode;
  }

  const fallback = normalizedToken(activeMode);
  return VALID_MODES.includes(fallback) ? fallback : "ask";
}
