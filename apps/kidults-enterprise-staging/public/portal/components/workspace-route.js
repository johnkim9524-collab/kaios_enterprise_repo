const QUERY_MODES = Object.freeze({
  ask: "ask",
  compare: "compare",
  decide: "decision",
  decision: "decision"
});

const HASH_MODES = Object.freeze({
  "ask-kidults": "ask",
  "compare-intelligence": "compare",
  "decision-support": "decision"
});

export function resolveWorkspaceMode({ href, activeMode = "ask" } = {}) {
  const url = new URL(href ?? "https://workspace.invalid/");
  const hash = decodeURIComponent(url.hash.replace(/^#/, ""));
  if (HASH_MODES[hash]) return HASH_MODES[hash];

  const queryMode = QUERY_MODES[url.searchParams.get("mode")?.toLowerCase()];
  if (queryMode) return queryMode;

  return ["ask", "compare", "decision"].includes(activeMode) ? activeMode : "ask";
}
