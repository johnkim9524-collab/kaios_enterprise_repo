import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const portal = "apps/kidults-enterprise-staging/public/portal";
const errors = [];

function read(relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) {
    errors.push(`Missing required file: ${relative}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
}

const index = read(`${portal}/index.html`);
const v663 = read(`${portal}/components/v663-hero-integrated-footer.css`);
const v664 = read(`${portal}/components/v664-visible-hero-footer.css`);

for (const marker of [
  'data-portal-version="v663"',
  'data-portal-hotfix="v664"',
  'data-visual-freeze="v665"',
  'kidults-hotfix-version" content="664"',
  'kidults-visual-freeze-version" content="665"',
  'v663-hero-integrated-footer.css?v=663',
  'v664-visible-hero-footer.css?v=665',
  'portal.js?v=665',
  'data-hero-layout="v663-integrated-footer"',
  'data-hero-revision="v664-visible-footer"',
  'data-hero-surface="v665-single-surface"',
  'data-hero-vertical>Automobiles &amp; Mobility',
  'data-hero-status>EDITORIAL APPROVED CANDIDATE',
  'data-dialog="hero">View details'
]) {
  if (!index.includes(marker)) errors.push(`V665 homepage marker missing: ${marker}`);
}

const articleStart = index.indexOf('<article class="moment-card"');
const footerStart = index.indexOf('<div class="moment-footer">', articleStart);
const articleEnd = index.indexOf('</article>', articleStart);
if (articleStart < 0 || footerStart < 0 || articleEnd < 0 || footerStart > articleEnd) {
  errors.push("Hero metadata footer is not contained inside the Hero card article.");
}

for (const marker of [
  "KIDULTS Portal V663",
  "#f4f2ee",
  'data-hero-layout="v663-integrated-footer"',
  "grid-row:4!important"
]) {
  if (!v663.includes(marker)) errors.push(`V663 foundation marker missing: ${marker}`);
}

for (const marker of [
  "KIDULTS Portal V664",
  'data-portal-hotfix="v664"',
  "--v664-hero-surface:#f4f2ee",
  "align-items:start!important",
  "height:560px!important",
  "inset:0 0 64px 0!important",
  "@media(max-width:768px)",
  "Mobile footer is deliberately simple",
  '[data-hero-status]{',
  "display:none!important",
  "V665 extends the foundation",
  "Darken compositing",
  "isolation:isolate!important",
  "mix-blend-mode:darken!important",
  "background:transparent!important",
  "background:var(--v664-hero-surface)!important",
  "border-top:0!important"
]) {
  if (!v664.includes(marker)) errors.push(`V665 Hero CSS marker missing: ${marker}`);
}

if (v664.includes("object-position:right")) errors.push("V665 Hero reintroduces a right-biased image position.");
if (v664.includes("transform:scale(")) errors.push("V665 Hero must not enlarge the Roadster.");
if (!v664.includes("min-width:1021px")) errors.push("V664 desktop viewport guard is missing.");
if (!v664.includes("min-width:769px) and (max-width:1020px")) errors.push("V664 mid-width guard is missing.");

if (errors.length) {
  console.error(`KIDULTS V665 Hero layout validation: FAIL (${errors.length} error(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS V665 Hero layout validation: PASS (one #f4f2ee surface, darken bitmap integration, viewport-stable internal footer, simplified mobile metadata, V662/V663/V664 contracts preserved)");
