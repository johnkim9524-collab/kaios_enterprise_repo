#!/usr/bin/env bash
set -euo pipefail

ROOT="apps/kidults-enterprise-staging"
PUBLIC="$ROOT/public/a13-b10"
JS="$PUBLIC/portal.js"
CSS="$PUBLIC/portal.css"
TEST="$ROOT/a13-b12-live-data-integration.test.mjs"

python3 - <<'PY'
from pathlib import Path

js_path = Path("apps/kidults-enterprise-staging/public/a13-b10/portal.js")
text = js_path.read_text(encoding="utf-8")

text = text.replace(
    "setText('[data-adapter-mode]', effectiveMode.toUpperCase());",
    "setText('[data-adapter-mode]', effectiveMode.charAt(0).toUpperCase() + effectiveMode.slice(1));"
)

old = """setText('[data-adapter-source]', source || 'Unavailable');
    setText('[data-adapter-fallback]', fallbackUsed ? 'Active' : 'Not used');"""
new = """const sourceLabel = effectiveMode === 'fallback'
      ? 'Illustrative intelligence dataset'
      : source || 'Unavailable';
    setText('[data-adapter-source]', sourceLabel);
    setText('[data-adapter-fallback]', effectiveMode === 'fallback' || fallbackUsed ? 'Active' : 'Standby');"""

if old not in text:
    raise SystemExit("portal.js adapter source block not found")
text = text.replace(old, new)
js_path.write_text(text, encoding="utf-8")
PY

cat >> "$CSS" <<'CSS'

/* A13-B12 Operational State polish */
#data-operations .trust-metrics > div {
  min-width: 0;
  overflow: hidden;
}

#data-operations .trust-metrics strong {
  display: block;
  max-width: 100%;
  font-size: clamp(2rem, 2.7vw, 2.7rem);
  line-height: .96;
  letter-spacing: -.035em;
  white-space: normal;
  overflow-wrap: anywhere;
}

#data-operations .trust-meta strong {
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: normal;
}

@media (max-width: 767px) {
  #data-operations .trust-metrics strong {
    font-size: 2rem;
    text-align: right;
  }

  #data-operations .trust-meta strong {
    font-size: 13px;
    line-height: 1.45;
  }
}
CSS

python3 - <<'PY'
from pathlib import Path

p = Path("apps/kidults-enterprise-staging/a13-b12-live-data-integration.test.mjs")
text = p.read_text(encoding="utf-8")

if "const css = fs.readFileSync" not in text:
    marker = "const adapter = JSON.parse("
    insert = "const css = fs.readFileSync(path.join(publicRoot, 'portal.css'), 'utf8');\n"
    text = text.replace(marker, insert + marker)

block = """

test('A13-B12 operational state labels stay human-readable and overflow-safe', () => {
  assert.match(js, /Illustrative intelligence dataset/);
  assert.match(js, /effectiveMode\.charAt\(0\)\.toUpperCase\(\)/);
  assert.match(js, /effectiveMode === 'fallback' \|\| fallbackUsed \? 'Active' : 'Standby'/);
  assert.match(css, /#data-operations \.trust-metrics strong/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
});
"""

if "operational state labels stay human-readable" not in text:
    text += block

p.write_text(text, encoding="utf-8")
PY

node --test \
  "$ROOT/a13-b10-baseline-lock.test.mjs" \
  "$ROOT/a13-b11-intelligence-product.test.mjs" \
  "$ROOT/a13-b12-live-data-integration.test.mjs"

echo "A13-B12 operational state polish completed successfully."
