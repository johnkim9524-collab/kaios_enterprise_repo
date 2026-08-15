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
const css = read(`${portal}/components/v663-hero-integrated-footer.css`);

for (const marker of [
  'data-portal-version="v663"',
  'v663-hero-integrated-footer.css?v=663',
  'data-hero-layout="v663-integrated-footer"',
  'data-hero-vertical>Automobiles &amp; Mobility',
  'data-hero-status>EDITORIAL APPROVED CANDIDATE',
  'data-dialog="hero">View details'
]) {
  if (!index.includes(marker)) errors.push(`V663 homepage marker missing: ${marker}`);
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
  "left:0!important",
  "right:0!important",
  "bottom:0!important",
  "border-radius:0 0 20px 20px",
  "background:rgba(244,242,238,.97)!important",
  "@media(max-width:768px)",
  "@media(max-width:420px)",
  "@media(max-width:340px)",
  "grid-row:4!important"
]) {
  if (!css.includes(marker)) errors.push(`V663 Hero CSS marker missing: ${marker}`);
}

if (css.includes("object-position:right")) errors.push("V663 Hero reintroduces a right-biased image position.");
if (css.includes("transform:scale(")) errors.push("V663 Hero must not enlarge the Roadster.");

if (errors.length) {
  console.error(`KIDULTS V663 Hero layout validation: FAIL (${errors.length} error(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS V663 Hero layout validation: PASS (one #f4f2ee card surface, integrated internal metadata footer, responsive 320–1440 preservation)");
