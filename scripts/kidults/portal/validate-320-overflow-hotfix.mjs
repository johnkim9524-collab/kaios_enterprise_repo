import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const errors = [];

function read(relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) {
    errors.push(`Missing required file: ${relative}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
}

const paths = {
  runtime: "apps/kidults-enterprise-staging/public/portal/components/mobile-reconstruction.js",
  css: "apps/kidults-enterprise-staging/public/portal/components/mobile-overflow-hotfix.css",
  workflow: ".github/workflows/kidults-portal-v502-validate.yml"
};

const runtime = read(paths.runtime);
const css = read(paths.css);
const workflow = read(paths.workflow);

for (const marker of [
  'const VERSION = "1.0.1"',
  "HOTFIX_STYLE_ID",
  "mobile-overflow-hotfix.css?v=653",
  "ensureStylesheets",
  "isAuditExcluded",
  "isClippedByAncestor",
  "rootOverflowPx",
  "mobileOverflowPx",
  "lastAuditSignature",
  "leafOffenders",
  "document.documentElement.scrollWidth",
  "document.body?.scrollWidth",
  "rootOverflowPx <= 1"
]) {
  if (!runtime.includes(marker)) errors.push(`320px runtime missing marker: ${marker}`);
}

for (const marker of [
  "--mobile-safe-gutter",
  "@media(max-width:768px)",
  "@media(max-width:360px)",
  ".shell{",
  ".sr-only{",
  ".living-pulse__orb{",
  ".vertical-card{",
  ".k100-figure{",
  ".k100-figure img{",
  ".signal-grid{",
  "grid-template-columns:minmax(0,1fr)!important",
  ".signal-card header{",
  ".sparkline svg{",
  "contain:layout paint",
  "transform:none!important"
]) {
  if (!css.includes(marker)) errors.push(`320px CSS missing marker: ${marker}`);
}

for (const prohibited of [
  /overflow-x\s*:\s*hidden/i,
  /overflow-x\s*:\s*clip/i,
  /width\s*:\s*calc\(100vw\s*\+/i,
  /min-width\s*:\s*(?:[4-9]\d\d|\d{4,})px/i
]) {
  if (prohibited.test(css)) errors.push(`320px CSS contains prohibited masking or fixed-width pattern: ${prohibited}`);
}

if (!workflow.includes("node --check scripts/kidults/portal/validate-320-overflow-hotfix.mjs")) {
  errors.push("Workflow does not syntax-check the 320px overflow validator.");
}
if (!workflow.includes("node scripts/kidults/portal/validate-320-overflow-hotfix.mjs")) {
  errors.push("Workflow does not run the 320px overflow validator.");
}

if (errors.length) {
  console.error(`KIDULTS 320px Overflow Hotfix validation: FAIL (${errors.length} error(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS 320px Overflow Hotfix validation: PASS (real-root audit, clipped-decoration filtering, constrained cards)");
