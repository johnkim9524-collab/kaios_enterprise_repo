#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TARGET="$ROOT/apps/kidults-enterprise-staging/public/a13-b10"
TEST_FILE="$ROOT/apps/kidults-enterprise-staging/a13-b10-baseline-lock.test.mjs"

cd "$ROOT"

required=(
  "$TARGET/portal.css"
  "$TARGET/hero-stability.css"
  "$TARGET/mobile-final.css"
  "$TARGET/index.html"
  "$TARGET/portal.js"
)

for file in "${required[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required file: $file" >&2
    exit 1
  fi
done

backup_dir="$TARGET/.css-consolidation-backup"
rm -rf "$backup_dir"
mkdir -p "$backup_dir"
cp "$TARGET/portal.css" "$backup_dir/portal.css"
cp "$TARGET/hero-stability.css" "$backup_dir/hero-stability.css"
cp "$TARGET/mobile-final.css" "$backup_dir/mobile-final.css"
cp "$TARGET/index.html" "$backup_dir/index.html"
cp "$TEST_FILE" "$backup_dir/a13-b10-baseline-lock.test.mjs"

{
  cat "$TARGET/portal.css"
  printf '\n\n/* A13-B10 consolidated hero stability layer */\n'
  cat "$TARGET/hero-stability.css"
  printf '\n\n/* A13-B10 consolidated final responsive layer */\n'
  cat "$TARGET/mobile-final.css"
} > "$TARGET/portal.css.next"

mv "$TARGET/portal.css.next" "$TARGET/portal.css"

python3 - "$TARGET/index.html" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')
text = re.sub(r'\s*<link rel="stylesheet" href="/a13-b10/(?:portal-bundle|portal|hero-stability|mobile-final)\.css(?:\?[^\"]*)?">', '', text)
text = text.replace('</head>', '  <link rel="stylesheet" href="/a13-b10/portal.css?v=20260803-final">\n</head>')
path.write_text(text, encoding='utf-8')
PY

rm -f "$TARGET/hero-stability.css"
rm -f "$TARGET/mobile-final.css"
rm -f "$TARGET/portal-bundle.css"

python3 - "$TEST_FILE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')
text = text.replace("const stabilityCss = fs.readFileSync(path.join(root, 'hero-stability.css'), 'utf8');\n", '')
text = text.replace("const mobileCss = fs.readFileSync(path.join(root, 'mobile-final.css'), 'utf8');\n", '')
text = text.replace("const bundleCss = fs.readFileSync(path.join(root, 'portal-bundle.css'), 'utf8');\n", '')
text = text.replace('`${portalCss}\\n${stabilityCss}\\n${mobileCss}`', 'portalCss')
text = text.replace('`${portalCss}\\n${stabilityCss}\\n${mobileCss}\\n${bundleCss}`', 'portalCss')
text = text.replace("assert.match(html, /\\/a13-b10\\/portal-bundle\\.css/);", "assert.match(html, /\\/a13-b10\\/portal\\.css/);")
text = text.replace("assert.match(bundleCss, /portal\\.css/);\n  assert.match(bundleCss, /hero-stability\\.css/);\n  assert.match(bundleCss, /mobile-final\\.css/);\n", '')
text = text.replace("assert.match(mobileCss, /grid-template-areas:\\s*\\n\\s*\"priority score\"/);", "assert.match(portalCss, /grid-template-areas:\\s*\\n\\s*\"priority score\"/);")
text = text.replace("assert.match(mobileCss, /\\.research-grid\\s*\\{[^}]*display:\\s*block/s);", "assert.match(portalCss, /\\.research-grid\\s*\\{[^}]*display:\\s*block/s);")
text += "\n\ntest('A13-B10 uses one physical CSS file', () => {\n  const cssLinks = html.match(/<link[^>]+rel=\\\"stylesheet\\\"[^>]*>/g) || [];\n  assert.equal(cssLinks.length, 1);\n  assert.match(cssLinks[0], /\\/a13-b10\\/portal\\.css/);\n  assert.equal(fs.existsSync(path.join(root, 'hero-stability.css')), false);\n  assert.equal(fs.existsSync(path.join(root, 'mobile-final.css')), false);\n  assert.equal(fs.existsSync(path.join(root, 'portal-bundle.css')), false);\n});\n"
path.write_text(text, encoding='utf-8')
PY

node --test "$TEST_FILE"

git add \
  apps/kidults-enterprise-staging/public/a13-b10/portal.css \
  apps/kidults-enterprise-staging/public/a13-b10/index.html \
  apps/kidults-enterprise-staging/public/a13-b10/hero-stability.css \
  apps/kidults-enterprise-staging/public/a13-b10/mobile-final.css \
  apps/kidults-enterprise-staging/public/a13-b10/portal-bundle.css \
  apps/kidults-enterprise-staging/a13-b10-baseline-lock.test.mjs

git commit -m "refactor(kidults): consolidate A13-B10 into one physical CSS file"

echo "A13-B10 CSS consolidation completed."
echo "New HEAD: $(git rev-parse HEAD)"
