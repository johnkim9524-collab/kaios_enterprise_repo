import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const root = process.cwd();
const portalPath = "apps/kidults-enterprise-staging/public/portal";
const baseUrl = (process.env.KIDULTS_BASE_URL ?? "http://127.0.0.1:4173").replace(/\/$/, "");
const outputDir = path.resolve(process.env.KIDULTS_V666_OUTPUT ?? "artifacts/kidults-v666-experience-closure");
fs.mkdirSync(outputDir, { recursive: true });

const failures = [];
const report = { generatedAt: new Date().toISOString(), baseUrl, source: {}, viewports: [] };

function read(relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) {
    failures.push(`SOURCE: missing ${relative}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
}

const index = read(`${portalPath}/index.html`);
const portalJs = read(`${portalPath}/portal.js`);
const css = read(`${portalPath}/components/v666-experience-closure.css`);
const editorial = read(`${portalPath}/components/editorial-assets.js`);
const mobile = read(`${portalPath}/components/mobile-hero-visibility.js`);
const manifest = read(`${portalPath}/data/v502-manifest.json`);
const homepage = read(`${portalPath}/components/homepage-structure.js`);
const svgPath = path.join(root, portalPath, "assets/hero/racing-roadster-v666.svg");

const sourceMarkers = [
  [index, 'data-portal-hotfix="v666"', "index V666 hotfix"],
  [index, 'v666-experience-closure.css?v=666', "index V666 CSS"],
  [index, 'portal.js?v=666', "index V666 JS"],
  [index, 'racing-roadster-v666.svg?v=666', "index V666 Hero"],
  [portalJs, 'dataset.portalHotfix = "v666"', "runtime V666 dataset"],
  [portalJs, 'ensureExperienceClosureStylesheet', "runtime style ordering"],
  [editorial, 'single-surface-v666', "Hero visual contract"],
  [mobile, 'racing-roadster-v666', "mobile Hero contract"],
  [manifest, 'racing-roadster-v666.svg', "manifest Hero contract"],
  [homepage, 'collectors and institutions', "playground positioning"],
  [css, '--v666-hero-surface:#f4f2ee', "single-surface token"],
  [css, 'border-top:0!important', "footer divider removal"],
  [css, 'background:transparent!important', "transparent layers"],
  [css, '.archive-row', "archive density rule"]
];
for (const [haystack, marker, label] of sourceMarkers) {
  if (!haystack.includes(marker)) failures.push(`SOURCE: ${label} missing (${marker})`);
}
if (!fs.existsSync(svgPath)) failures.push("SOURCE: racing-roadster-v666.svg missing");
if (css.includes("transform:scale(")) failures.push("SOURCE: Hero enlargement is prohibited in V666");
report.source = { markers: sourceMarkers.length, svgExists: fs.existsSync(svgPath) };

const viewports = [
  { label: "desktop-short", width: 1366, height: 768 },
  { label: "desktop-standard", width: 1440, height: 900 },
  { label: "tablet", width: 768, height: 1024 },
  { label: "mobile-390", width: 390, height: 844 },
  { label: "mobile-320", width: 320, height: 740 }
];

const browser = await chromium.launch({ headless: true });

for (const viewport of viewports) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const runtimeErrors = [];
  page.on("pageerror", error => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`);
  });

  try {
    await page.goto(`${baseUrl}/portal/index.html?v=666&qa=${Date.now()}`, {
      waitUntil: "networkidle",
      timeout: 45000
    });
    await page.waitForFunction(() => document.documentElement.dataset.portalHotfix === "v666", null, { timeout: 20000 });
    await page.waitForFunction(() => {
      const image = document.querySelector("[data-hero-image]");
      return Boolean(image?.complete && image.naturalWidth > 0);
    }, null, { timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-signal-grid] .signal-card").length === 4, null, { timeout: 20000 });
    await page.waitForTimeout(500);

    const metrics = await page.evaluate(() => {
      const pick = selector => document.querySelector(selector);
      const rect = selector => pick(selector)?.getBoundingClientRect() ?? null;
      const visible = node => {
        if (!node) return false;
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && box.width > 0 && box.height > 0;
      };
      const gap = (fromSelector, toSelector) => {
        const from = rect(fromSelector);
        const to = rect(toSelector);
        return from && to ? Math.round(to.top - from.bottom) : null;
      };
      const allHeights = selector => [...document.querySelectorAll(selector)].map(node => Math.round(node.getBoundingClientRect().height));

      const card = pick("[data-hero-card]");
      const image = pick("[data-hero-image]");
      const footer = card?.querySelector(".moment-footer");
      const status = card?.querySelector("[data-hero-status]");
      const vertical = card?.querySelector("[data-hero-vertical]");
      const action = card?.querySelector(".moment-footer .text-link");
      const cardBox = card?.getBoundingClientRect();
      const footerBox = footer?.getBoundingClientRect();

      return {
        hotfix: document.documentElement.dataset.portalHotfix,
        closure: document.documentElement.dataset.experienceClosure,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        hero: {
          revision: card?.dataset.heroRevision,
          asset: card?.dataset.heroAsset,
          source: image?.currentSrc || image?.src,
          naturalWidth: image?.naturalWidth ?? 0,
          naturalHeight: image?.naturalHeight ?? 0,
          cardBackground: card ? getComputedStyle(card).backgroundColor : null,
          imageBackground: image ? getComputedStyle(image).backgroundColor : null,
          footerBackground: footer ? getComputedStyle(footer).backgroundColor : null,
          footerBorderTop: footer ? getComputedStyle(footer).borderTopWidth : null,
          cardHeight: cardBox ? Math.round(cardBox.height) : null,
          footerHeight: footerBox ? Math.round(footerBox.height) : null,
          footerContained: Boolean(cardBox && footerBox && footerBox.left >= cardBox.left - 1 && footerBox.right <= cardBox.right + 1 && footerBox.top >= cardBox.top - 1 && footerBox.bottom <= cardBox.bottom + 1),
          statusVisible: visible(status),
          verticalVisible: visible(vertical),
          actionVisible: visible(action)
        },
        rhythm: {
          canonToSignals: gap(".canon-panel", ".market-signals-section .section-heading"),
          signalsToEvidence: gap(".market-signals-section .signal-grid", ".evidence-section .section-heading"),
          evidenceToOperations: gap(".evidence-section .evidence-grid", ".operations-section .section-heading"),
          researchToArchive: gap(".research-section .research-layout", ".archive-section .archive-intro"),
          archiveToWorkspace: gap(".archive-section .archive-list", ".workspace-entry-section .workspace-entry-copy")
        },
        density: {
          evidenceCards: allHeights(".evidence-card"),
          researchFeature: Math.round(rect(".research-feature")?.height ?? 0),
          researchNotes: allHeights(".research-note"),
          archiveRows: allHeights(".archive-row"),
          workspaceSection: Math.round(rect(".workspace-entry-section")?.height ?? 0)
        }
      };
    });

    const issues = [];
    const mobileViewport = viewport.width <= 768;
    if (metrics.hotfix !== "v666" || metrics.closure !== "v666") issues.push(`runtime=${metrics.hotfix}/${metrics.closure}`);
    if (metrics.scrollWidth > metrics.clientWidth + 1) issues.push(`horizontal overflow ${metrics.scrollWidth - metrics.clientWidth}px`);
    if (!metrics.hero.source.includes("racing-roadster-v666.svg")) issues.push(`Hero source ${metrics.hero.source}`);
    if (metrics.hero.naturalWidth !== 1600 || metrics.hero.naturalHeight !== 900) issues.push(`Hero dimensions ${metrics.hero.naturalWidth}x${metrics.hero.naturalHeight}`);
    if (metrics.hero.cardBackground !== "rgb(244, 242, 238)") issues.push(`card bg ${metrics.hero.cardBackground}`);
    if (metrics.hero.imageBackground !== "rgba(0, 0, 0, 0)") issues.push(`image bg ${metrics.hero.imageBackground}`);
    if (metrics.hero.footerBackground !== "rgba(0, 0, 0, 0)") issues.push(`footer bg ${metrics.hero.footerBackground}`);
    if (metrics.hero.footerBorderTop !== "0px") issues.push(`footer border ${metrics.hero.footerBorderTop}`);
    if (!metrics.hero.footerContained || !metrics.hero.actionVisible) issues.push("Hero footer/action incomplete");

    if (mobileViewport) {
      if (metrics.hero.statusVisible) issues.push("mobile status must be hidden");
      if (metrics.hero.footerHeight > 58) issues.push(`mobile footer ${metrics.hero.footerHeight}px`);
      if (viewport.width <= 340 && metrics.hero.verticalVisible) issues.push("320px category must be hidden");
      if (viewport.width > 340 && !metrics.hero.verticalVisible) issues.push("390/768 category must be visible");
    } else {
      if (Math.abs(metrics.hero.cardHeight - 560) > 2) issues.push(`desktop Hero height ${metrics.hero.cardHeight}px`);
      if (!metrics.hero.statusVisible || !metrics.hero.verticalVisible) issues.push("desktop Hero metadata incomplete");
      const rhythmLimits = {
        canonToSignals: 145,
        signalsToEvidence: 150,
        evidenceToOperations: 160,
        researchToArchive: 150,
        archiveToWorkspace: 145
      };
      for (const [name, limit] of Object.entries(rhythmLimits)) {
        const value = metrics.rhythm[name];
        if (value === null || value < 0 || value > limit) issues.push(`${name} gap ${value}px > ${limit}px`);
      }
      if (Math.max(...metrics.density.evidenceCards) > 410) issues.push(`evidence card ${Math.max(...metrics.density.evidenceCards)}px`);
      if (metrics.density.researchFeature > 540) issues.push(`research feature ${metrics.density.researchFeature}px`);
      if (Math.max(...metrics.density.archiveRows) > 166) issues.push(`archive row ${Math.max(...metrics.density.archiveRows)}px`);
      if (metrics.density.workspaceSection > 235) issues.push(`workspace section ${metrics.density.workspaceSection}px`);
    }

    issues.push(...runtimeErrors);
    const screenshot = path.join(outputDir, `${viewport.label}.png`);
    await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });
    report.viewports.push({ viewport, metrics, screenshot, failures: issues });
    for (const issue of issues) failures.push(`${viewport.label}: ${issue}`);
  } catch (error) {
    failures.push(`${viewport.label}: ${error.message}`);
  } finally {
    await page.close();
  }
}

await browser.close();
fs.writeFileSync(path.join(outputDir, "validation-report.json"), `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  console.error(`KIDULTS V666 experience closure: FAIL (${failures.length})`);
  failures.forEach(failure => console.error(`ERROR: ${failure}`));
  process.exit(1);
}

console.log("KIDULTS V666 experience closure: PASS");
console.log("PASS: one-surface Hero, five rhythm transitions, editorial density, 320/390/768/1366/1440 responsive QA");
