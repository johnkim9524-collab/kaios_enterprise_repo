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
const v666 = read(`${portal}/components/v666-experience-closure.css`);

for (const marker of [
  'data-portal-version="v663"',
  'data-portal-hotfix="v666"',
  'kidults-presentation-version" content="663"',
  'kidults-hotfix-version" content="666"',
  'v663-hero-integrated-footer.css?v=663',
  'v664-visible-hero-footer.css?v=664',
  'v666-experience-closure.css?v=666',
  'data-hero-layout="v663-integrated-footer"',
  'data-hero-revision="v666-experience-closure"',
  'data-hero-vertical>Automobiles &amp; Mobility',
  'data-hero-status>EDITORIAL APPROVED CANDIDATE',
  'data-dialog="hero">View details'
]) {
  if (!index.includes(marker)) errors.push(`V666 compatibility marker missing: ${marker}`);
}

const articleStart = index.indexOf('<article class="moment-card"');
const footerStart = index.indexOf('<div class="moment-footer">', articleStart);
const articleEnd = index.indexOf('</article>', articleStart);
if (articleStart < 0 || footerStart < 0 || articleEnd < 0 || footerStart > articleEnd) {
  errors.push("Hero metadata footer is not contained inside the Hero card article.");
}

const v663Link = index.indexOf('v663-hero-integrated-footer.css?v=663');
const v664Link = index.indexOf('v664-visible-hero-footer.css?v=664');
const v666Link = index.indexOf('v666-experience-closure.css?v=666');
if (!(v663Link >= 0 && v663Link < v664Link && v664Link < v666Link)) {
  errors.push("Hero stylesheet cascade must remain V663 → V664 → V666.");
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
  "display:none!important"
]) {
  if (!v664.includes(marker)) errors.push(`V664 compatibility marker missing: ${marker}`);
}

for (const marker of [
  "KIDULTS Portal V666",
  "--v666-hero-surface:#f4f2ee",
  "background:transparent!important",
  "border-top:0!important",
  'data-hero-layout="v663-integrated-footer"',
  "@media(max-width:768px)",
  '[data-hero-status]'
]) {
  if (!v666.includes(marker)) errors.push(`V666 closure marker missing: ${marker}`);
}

if (v666.includes("object-position:right")) errors.push("V666 reintroduces a right-biased Roadster position.");
if (v666.includes("transform:scale(")) errors.push("V666 must not enlarge the Roadster.");
if (!v664.includes("min-width:1021px")) errors.push("V664 desktop viewport guard is missing.");
if (!v664.includes("min-width:769px) and (max-width:1020px")) errors.push("V664 mid-width guard is missing.");

if (errors.length) {
  console.error(`KIDULTS V663/V664 → V666 compatibility validation: FAIL (${errors.length} error(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS V663/V664 → V666 compatibility validation: PASS (internal footer, viewport guards and mobile simplification preserved; V666 is the active closure layer)");
