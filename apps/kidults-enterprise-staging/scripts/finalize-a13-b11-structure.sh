#!/usr/bin/env bash
set -euo pipefail

ROOT="apps/kidults-enterprise-staging"
PUBLIC="$ROOT/public/a13-b10"
INDEX="$PUBLIC/index.html"
PORTAL="$PUBLIC/portal.css"
CORE="$PUBLIC/portal-core.css"
B10_TEST="$ROOT/a13-b10-baseline-lock.test.mjs"
B11_TEST="$ROOT/a13-b11-intelligence-product.test.mjs"

for file in "$INDEX" "$PORTAL" "$CORE" "$B10_TEST" "$B11_TEST"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required file: $file" >&2
    exit 1
  fi
done

BACKUP_DIR="/tmp/a13-b11-structure-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp "$INDEX" "$PORTAL" "$CORE" "$B10_TEST" "$B11_TEST" "$BACKUP_DIR/"
echo "Backup: $BACKUP_DIR"

python3 - <<'PY'
from pathlib import Path
import re

index_path = Path("apps/kidults-enterprise-staging/public/a13-b10/index.html")
text = index_path.read_text(encoding="utf-8")
updated, count = re.subn(r"\n\s*<style>.*?</style>", "", text, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f"Expected exactly one inline style block, removed {count}")
index_path.write_text(updated, encoding="utf-8")
print("Removed inline style block")
PY

python3 - <<'PY'
from pathlib import Path
import re

public = Path("apps/kidults-enterprise-staging/public/a13-b10")
core_path = public / "portal-core.css"
portal_path = public / "portal.css"

core = core_path.read_text(encoding="utf-8").rstrip()
wrapper = portal_path.read_text(encoding="utf-8")
wrapper, count = re.subn(
    r"^@import\s+url\(['\"]?/a13-b10/portal-core\.css[^)]*\);\s*",
    "",
    wrapper,
    count=1,
    flags=re.M,
)
if count != 1:
    raise SystemExit(f"Expected one portal-core import, removed {count}")

portal_path.write_text(
    core + "\n\n/* A13-B11 Intelligence Product Expansion */\n" + wrapper.strip() + "\n",
    encoding="utf-8",
)
core_path.unlink()
print("Merged portal-core.css into portal.css and removed portal-core.css")
PY

python3 - <<'PY'
from pathlib import Path

p = Path("apps/kidults-enterprise-staging/a13-b11-intelligence-product.test.mjs")
text = p.read_text(encoding="utf-8")

needle = "const js = fs.readFileSync(path.join(publicRoot, 'portal.js'), 'utf8');\n"
addition = "const portalCss = fs.readFileSync(path.join(publicRoot, 'portal.css'), 'utf8');\n"
if addition not in text:
    if needle not in text:
        raise SystemExit("Could not find JavaScript fixture declaration")
    text = text.replace(needle, needle + addition, 1)

text = text.replace("assert.match(html, /@media \\(max-width: 767px\\)/);", "assert.match(portalCss, /@media \\(max-width: 767px\\)/);")
text = text.replace("assert.match(html, /\\.canon-grid \\{ grid-template-columns: 1fr; \\}/);", "assert.match(portalCss, /\\.canon-grid\\s*\\{[^}]*grid-template-columns:\\s*1fr/s);")
text = text.replace("assert.match(html, /\\.matrix-scroll \\{ margin-inline: -20px;/);", "assert.match(portalCss, /\\.matrix-scroll\\s*\\{[^}]*overflow-x:\\s*auto/s);")
text = text.replace("assert.match(html, /\\.trust-metrics \\{ grid-template-columns: 1fr; \\}/);", "assert.match(portalCss, /\\.trust-metrics\\s*\\{[^}]*grid-template-columns:\\s*1fr/s);")

architecture_marker = "assert.equal(scriptLinks.length, 1);\n"
architecture_addition = (
    "  assert.doesNotMatch(html, /<style>/i);\n"
    "  assert.doesNotMatch(portalCss, /portal-core\\.css/);\n"
)
if architecture_addition not in text:
    if architecture_marker not in text:
        raise SystemExit("Could not find architecture assertion marker")
    text = text.replace(architecture_marker, architecture_marker + architecture_addition, 1)

p.write_text(text, encoding="utf-8")
print("Updated B11 tests for physical single-CSS structure")
PY

node --test \
  "$B10_TEST" \
  "$B11_TEST"

echo
echo "A13-B11 structure finalization completed successfully."
echo "Review with: git status --short && git diff --stat"
