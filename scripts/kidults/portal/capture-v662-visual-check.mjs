import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const baseUrl = (process.env.KIDULTS_BASE_URL ?? "http://127.0.0.1:4173").replace(/\/$/, "");
const outputDir = path.resolve(process.env.KIDULTS_VISUAL_OUTPUT ?? "artifacts/kidults-v662-visual");
fs.mkdirSync(outputDir, { recursive: true });

const viewports = [
  { width: 320, height: 1100 },
  { width: 390, height: 1200 },
  { width: 768, height: 1200 },
  { width: 1440, height: 1100 }
];

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  homepage: [],
  workspace: []
};
const failures = [];
const browser = await chromium.launch({ headless: true });

async function createPage(viewport, label) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const runtimeErrors = [];
  page.on("pageerror", error => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`);
  });
  page.on("response", response => {
    if (response.status() >= 400 && response.url().startsWith(baseUrl) && !response.url().endsWith("/favicon.ico")) {
      runtimeErrors.push(`http ${response.status()}: ${response.url()}`);
    }
  });
  return { page, runtimeErrors, label };
}

async function revealWholePage(page) {
  await page.evaluate(async () => {
    const pause = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));
    const step = Math.max(280, Math.floor(window.innerHeight * .72));
    let previousHeight = 0;

    for (let pass = 0; pass < 3; pass += 1) {
      const currentHeight = document.documentElement.scrollHeight;
      for (let y = 0; y <= currentHeight; y += step) {
        window.scrollTo(0, y);
        await pause(55);
      }
      window.scrollTo(0, currentHeight);
      await pause(120);
      const nextHeight = document.documentElement.scrollHeight;
      if (nextHeight === previousHeight || nextHeight === currentHeight) break;
      previousHeight = nextHeight;
    }

    window.scrollTo(0, 0);
    await pause(350);
  });
}

for (const viewport of viewports) {
  const label = `${viewport.width}x${viewport.height}`;
  const { page, runtimeErrors } = await createPage(viewport, label);
  try {
    await page.goto(`${baseUrl}/portal/index.html`, { waitUntil: "networkidle", timeout: 45_000 });
    await page.waitForFunction(() => document.documentElement.dataset.homepageStructure === "v662", null, { timeout: 15_000 });
    await page.waitForSelector(".k100-card", { timeout: 15_000 });
    await page.waitForFunction(() => {
      const image = document.querySelector("[data-hero-image]");
      return Boolean(image?.complete && image.naturalWidth > 0 && !image.src.startsWith("data:"));
    }, null, { timeout: 15_000 });
    await revealWholePage(page);

    const metrics = await page.evaluate(() => {
      const root = document.documentElement;
      const heroCard = document.querySelector("[data-hero-card]");
      const heroImage = document.querySelector("[data-hero-image]");
      const cards = [...document.querySelectorAll(".k100-card")];
      const release = document.querySelector(".release-baseline");
      const workspaceEntry = document.querySelector(".workspace-entry-section");
      const institution = document.querySelector("#institution");
      const main = document.querySelector("#main");
      const heroRect = heroImage?.getBoundingClientRect();
      const revealNodes = [...document.querySelectorAll(".reveal")];
      const countChildren = selector => document.querySelector(selector)?.children.length ?? 0;
      const visible = node => {
        if (!node) return false;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return !node.hidden && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
      };
      const sectionSelectors = [
        "[data-snapshot-grid]",
        "[data-vertical-grid]",
        "[data-k100-gallery]",
        "[data-signal-grid]",
        "[data-operations-grid]",
        "[data-research-notes]",
        "[data-archive-list]"
      ];
      return {
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        scrollHeight: root.scrollHeight,
        dataState: root.dataset.dataState,
        homepageStructure: root.dataset.homepageStructure,
        heroAsset: heroCard?.dataset.heroAsset,
        heroState: heroCard?.dataset.assetState,
        heroSource: heroImage?.currentSrc || heroImage?.src,
        heroNaturalWidth: heroImage?.naturalWidth ?? 0,
        heroNaturalHeight: heroImage?.naturalHeight ?? 0,
        heroObjectFit: heroImage ? getComputedStyle(heroImage).objectFit : null,
        heroObjectPosition: heroImage ? getComputedStyle(heroImage).objectPosition : null,
        heroVisible: Boolean(heroRect && heroRect.width > 0 && heroRect.height > 0 && getComputedStyle(heroImage).visibility !== "hidden"),
        snapshotCards: countChildren("[data-snapshot-grid]"),
        verticalCards: countChildren("[data-vertical-grid]"),
        k100Cards: cards.length,
        signalCards: countChildren("[data-signal-grid]"),
        operationCards: countChildren("[data-operations-grid]"),
        researchNotes: countChildren("[data-research-notes]"),
        archiveItems: countChildren("[data-archive-list]"),
        k100Formats: [...new Set(cards.map(card => card.dataset.imageFormat))],
        revealCount: revealNodes.length,
        unrevealedCount: revealNodes.filter(node => !node.classList.contains("is-visible") || !visible(node)).length,
        invisibleSectionCount: sectionSelectors.filter(selector => !visible(document.querySelector(selector))).length,
        releaseIsLast: main?.lastElementChild === release,
        workspaceBeforeInstitution: Boolean(workspaceEntry && institution && (workspaceEntry.compareDocumentPosition(institution) & Node.DOCUMENT_POSITION_FOLLOWING))
      };
    });

    const localFailures = [];
    if (metrics.scrollWidth > metrics.clientWidth + 1) localFailures.push(`horizontal overflow ${metrics.scrollWidth - metrics.clientWidth}px`);
    if (metrics.homepageStructure !== "v662") localFailures.push(`structure=${metrics.homepageStructure}`);
    if (metrics.heroAsset !== "racing-roadster-v662") localFailures.push(`heroAsset=${metrics.heroAsset}`);
    if (!metrics.heroSource.includes("racing-roadster-v662.webp")) localFailures.push(`heroSource=${metrics.heroSource}`);
    if (metrics.heroNaturalWidth < 1200 || metrics.heroNaturalHeight < 675) localFailures.push(`hero dimensions=${metrics.heroNaturalWidth}x${metrics.heroNaturalHeight}`);
    if (metrics.heroObjectFit !== "contain") localFailures.push(`hero object-fit=${metrics.heroObjectFit}`);
    if (!metrics.heroVisible) localFailures.push("hero is not visible");
    if (metrics.snapshotCards !== 4) localFailures.push(`snapshot cards=${metrics.snapshotCards}`);
    if (metrics.verticalCards !== 8) localFailures.push(`vertical cards=${metrics.verticalCards}`);
    if (metrics.k100Cards !== 4) localFailures.push(`K100 cards=${metrics.k100Cards}`);
    if (metrics.signalCards < 1) localFailures.push(`signal cards=${metrics.signalCards}`);
    if (metrics.operationCards < 1) localFailures.push(`operation cards=${metrics.operationCards}`);
    if (metrics.researchNotes < 1) localFailures.push(`research notes=${metrics.researchNotes}`);
    if (metrics.archiveItems < 1) localFailures.push(`archive items=${metrics.archiveItems}`);
    if (metrics.k100Formats.some(value => value !== "museum-editorial-v662")) localFailures.push(`K100 formats=${metrics.k100Formats.join(",")}`);
    if (metrics.unrevealedCount !== 0) localFailures.push(`unrevealed content=${metrics.unrevealedCount}/${metrics.revealCount}`);
    if (metrics.invisibleSectionCount !== 0) localFailures.push(`invisible data sections=${metrics.invisibleSectionCount}`);
    if (!metrics.releaseIsLast) localFailures.push("Release Baseline is not last");
    if (!metrics.workspaceBeforeInstitution) localFailures.push("Workspace entry order is incorrect");
    if (runtimeErrors.length) localFailures.push(...runtimeErrors);

    const screenshot = path.join(outputDir, `homepage-${viewport.width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });
    report.homepage.push({ viewport, screenshot, metrics, failures: localFailures });
    for (const failure of localFailures) failures.push(`homepage ${label}: ${failure}`);
  } catch (error) {
    failures.push(`homepage ${label}: ${error.message}`);
    report.homepage.push({ viewport, failures: [error.message, ...runtimeErrors] });
  } finally {
    await page.close();
  }
}

for (const viewport of [viewports[1], viewports[3]]) {
  const label = `${viewport.width}x${viewport.height}`;
  const { page, runtimeErrors } = await createPage(viewport, label);
  try {
    await page.goto(`${baseUrl}/portal/workspace.html?mode=ask`, { waitUntil: "networkidle", timeout: 45_000 });
    await page.waitForFunction(() => document.documentElement.dataset.dataState === "workspace-ready", null, { timeout: 20_000 });
    await page.waitForSelector("#kidults-living-workspace", { timeout: 15_000 });
    await page.waitForTimeout(400);

    const metrics = await page.evaluate(() => {
      const root = document.documentElement;
      return {
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        dataState: root.dataset.dataState,
        visibleIntroCount: [...document.querySelectorAll(".workspace-page-intro")].filter(node => getComputedStyle(node).display !== "none").length,
        workspaceRootCount: document.querySelectorAll("#kidults-living-workspace").length,
        workspaceMountCount: document.querySelectorAll("[data-workspace-mount] #kidults-living-workspace").length,
        statusCount: document.querySelectorAll("[data-workspace-context] > div").length,
        activePanel: root.dataset.workspacePanel,
        tabCount: document.querySelectorAll("[data-workspace-tab]").length,
        pageHeadingCount: document.querySelectorAll("h1").length
      };
    });

    const localFailures = [];
    if (metrics.scrollWidth > metrics.clientWidth + 1) localFailures.push(`horizontal overflow ${metrics.scrollWidth - metrics.clientWidth}px`);
    if (metrics.dataState !== "workspace-ready") localFailures.push(`dataState=${metrics.dataState}`);
    if (metrics.visibleIntroCount !== 0) localFailures.push(`duplicate intro count=${metrics.visibleIntroCount}`);
    if (metrics.workspaceRootCount !== 1 || metrics.workspaceMountCount !== 1) localFailures.push(`workspace roots=${metrics.workspaceRootCount}, mounted=${metrics.workspaceMountCount}`);
    if (metrics.statusCount !== 4) localFailures.push(`status count=${metrics.statusCount}`);
    if (metrics.activePanel !== "ask") localFailures.push(`active panel=${metrics.activePanel}`);
    if (metrics.tabCount !== 3) localFailures.push(`tab count=${metrics.tabCount}`);
    if (metrics.pageHeadingCount !== 1) localFailures.push(`h1 count=${metrics.pageHeadingCount}`);
    if (runtimeErrors.length) localFailures.push(...runtimeErrors);

    const screenshot = path.join(outputDir, `workspace-${viewport.width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });
    report.workspace.push({ viewport, screenshot, metrics, failures: localFailures });
    for (const failure of localFailures) failures.push(`workspace ${label}: ${failure}`);
  } catch (error) {
    failures.push(`workspace ${label}: ${error.message}`);
    report.workspace.push({ viewport, failures: [error.message, ...runtimeErrors] });
  } finally {
    await page.close();
  }
}

await browser.close();
fs.writeFileSync(path.join(outputDir, "visual-report.json"), `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  console.error(`KIDULTS V662 visual validation: FAIL (${failures.length} issue(s))`);
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exit(1);
}

console.log(`KIDULTS V662 visual validation: PASS (${viewports.map(item => item.width).join("/")}px homepage with full-page reveal, 390/1440px Workspace)`);
