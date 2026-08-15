import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const baseUrl = (process.env.KIDULTS_BASE_URL ?? "http://127.0.0.1:4173").replace(/\/$/, "");
const outputDir = path.resolve(process.env.KIDULTS_V664_OUTPUT ?? "artifacts/kidults-v665-experience");
fs.mkdirSync(outputDir, { recursive: true });

const viewports = [
  { label: "desktop-short", width: 1366, height: 768 },
  { label: "desktop-standard", width: 1440, height: 900 },
  { label: "mobile-390", width: 390, height: 844 },
  { label: "mobile-320", width: 320, height: 740 }
];

const failures = [];
const report = { generatedAt: new Date().toISOString(), baseUrl, release: "v665", results: [] };
const browser = await chromium.launch({ headless: true });

for (const viewport of viewports) {
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

  try {
    await page.goto(`${baseUrl}/portal/index.html?v=665&check=${Date.now()}`, { waitUntil: "networkidle", timeout: 45_000 });
    await page.waitForFunction(() => document.documentElement.dataset.portalHotfix === "v664", null, { timeout: 20_000 });
    await page.waitForFunction(() => document.documentElement.dataset.visualFreeze === "v665", null, { timeout: 20_000 });
    await page.waitForFunction(() => {
      const image = document.querySelector("[data-hero-image]");
      return Boolean(image?.complete && image.naturalWidth > 0);
    }, null, { timeout: 20_000 });
    await page.waitForFunction(() => document.querySelectorAll(".signal-meta").length > 0, null, { timeout: 20_000 });
    await page.waitForTimeout(500);

    const metrics = await page.evaluate(() => {
      const root = document.documentElement;
      const card = document.querySelector("[data-hero-card]");
      const image = card?.querySelector("[data-hero-image]");
      const footer = card?.querySelector(".moment-footer");
      const source = card?.querySelector(".hero-source");
      const status = card?.querySelector("[data-hero-status]");
      const vertical = card?.querySelector("[data-hero-vertical]");
      const action = card?.querySelector(".moment-footer .text-link");
      const whyTitle = document.querySelector("#why-title");
      const cardRect = card?.getBoundingClientRect();
      const footerRect = footer?.getBoundingClientRect();
      const sourceRect = source?.getBoundingClientRect();
      const statusRect = status?.getBoundingClientRect();
      const verticalRect = vertical?.getBoundingClientRect();
      const actionRect = action?.getBoundingClientRect();
      const cardStyle = card ? getComputedStyle(card) : null;
      const imageStyle = image ? getComputedStyle(image) : null;
      const footerStyle = footer ? getComputedStyle(footer) : null;
      const sourceStyle = source ? getComputedStyle(source) : null;
      const statusStyle = status ? getComputedStyle(status) : null;
      const verticalStyle = vertical ? getComputedStyle(vertical) : null;
      const actionStyle = action ? getComputedStyle(action) : null;
      const isVisible = (style, rect) => Boolean(style && rect && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0);
      const snapshotTimes = [...document.querySelectorAll(".signal-meta div:last-child b")].map(node => node.textContent.trim());

      return {
        portalHotfix: root.dataset.portalHotfix,
        portalVersion: root.dataset.portalVersion,
        visualFreeze: root.dataset.visualFreeze,
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        viewportHeight: window.innerHeight,
        heroRevision: card?.dataset.heroRevision,
        heroLayout: card?.dataset.heroLayout,
        cardHeight: cardRect?.height ?? 0,
        cardTop: cardRect?.top ?? 0,
        cardBottom: cardRect?.bottom ?? 0,
        cardBackground: cardStyle?.backgroundColor ?? null,
        cardIsolation: cardStyle?.isolation ?? null,
        imageBackground: imageStyle?.backgroundColor ?? null,
        imageBlendMode: imageStyle?.mixBlendMode ?? null,
        imageOpacity: imageStyle?.opacity ?? null,
        imageFilter: imageStyle?.filter ?? null,
        footerVisible: isVisible(footerStyle, footerRect),
        footerHeight: footerRect?.height ?? 0,
        footerTop: footerRect?.top ?? 0,
        footerBottom: footerRect?.bottom ?? 0,
        footerBackground: footerStyle?.backgroundColor ?? null,
        footerBorderTopWidth: footerStyle?.borderTopWidth ?? null,
        footerContained: Boolean(cardRect && footerRect && footerRect.left >= cardRect.left - 1 && footerRect.right <= cardRect.right + 1 && footerRect.top >= cardRect.top - 1 && footerRect.bottom <= cardRect.bottom + 1),
        footerInInitialViewport: Boolean(footerRect && footerRect.bottom <= window.innerHeight + 1),
        sourceVisible: isVisible(sourceStyle, sourceRect),
        statusVisible: isVisible(statusStyle, statusRect),
        verticalVisible: isVisible(verticalStyle, verticalRect),
        actionVisible: isVisible(actionStyle, actionRect),
        statusDisplay: statusStyle?.display ?? null,
        sourceDisplay: sourceStyle?.display ?? null,
        whyTitleText: whyTitle?.textContent.replace(/\s+/g, " ").trim() ?? "",
        snapshotTimes
      };
    });

    const localFailures = [];
    const mobile = viewport.width <= 768;
    const compactMobile = viewport.width <= 340;
    if (metrics.portalHotfix !== "v664") localFailures.push(`portalHotfix=${metrics.portalHotfix}`);
    if (metrics.visualFreeze !== "v665") localFailures.push(`visualFreeze=${metrics.visualFreeze}`);
    if (metrics.heroRevision !== "v664-visible-footer") localFailures.push(`heroRevision=${metrics.heroRevision}`);
    if (metrics.heroLayout !== "v663-integrated-footer") localFailures.push(`heroLayout=${metrics.heroLayout}`);
    if (metrics.scrollWidth > metrics.clientWidth + 1) localFailures.push(`horizontal overflow=${metrics.scrollWidth - metrics.clientWidth}px`);
    if (!metrics.footerVisible) localFailures.push("Hero footer is not visible");
    if (!metrics.footerContained) localFailures.push("Hero footer is not contained inside the Hero card");
    if (!metrics.actionVisible) localFailures.push("Hero View details action is not visible");
    if (metrics.cardBackground !== "rgb(244, 242, 238)") localFailures.push(`card background=${metrics.cardBackground}`);
    if (metrics.footerBackground !== "rgb(244, 242, 238)") localFailures.push(`footer background=${metrics.footerBackground}`);
    if (metrics.footerBorderTopWidth !== "0px") localFailures.push(`footer border=${metrics.footerBorderTopWidth}`);
    if (metrics.cardIsolation !== "isolate") localFailures.push(`card isolation=${metrics.cardIsolation}`);
    if (metrics.imageBackground !== "rgba(0, 0, 0, 0)") localFailures.push(`image background=${metrics.imageBackground}`);
    if (metrics.imageBlendMode !== "multiply") localFailures.push(`image blend mode=${metrics.imageBlendMode}`);
    if (!metrics.whyTitleText.startsWith("We do not just show objects.")) localFailures.push(`WHY headline=${metrics.whyTitleText}`);
    if (!metrics.snapshotTimes.length || metrics.snapshotTimes.some(value => !value.includes("UTC") || /[가-힣]/.test(value))) {
      localFailures.push(`global snapshot time=${metrics.snapshotTimes.join(" | ")}`);
    }

    if (mobile) {
      if (metrics.statusVisible || metrics.statusDisplay !== "none") localFailures.push(`mobile status must be hidden (display=${metrics.statusDisplay})`);
      if (metrics.footerHeight > 72) localFailures.push(`mobile footer too tall=${metrics.footerHeight}px`);
      if (compactMobile) {
        if (metrics.sourceVisible || metrics.sourceDisplay !== "none") {
          localFailures.push(`320px source block must be hidden (display=${metrics.sourceDisplay})`);
        }
      } else if (!metrics.verticalVisible) {
        localFailures.push("390px Hero category is not visible");
      }
    } else {
      if (!metrics.verticalVisible) localFailures.push("desktop Hero vertical label is not visible");
      if (!metrics.statusVisible) localFailures.push("desktop editorial status is not visible");
      if (viewport.width >= 1021 && Math.abs(metrics.cardHeight - 560) > 2) localFailures.push(`desktop card height=${metrics.cardHeight}px`);
      if (viewport.height <= 800 && !metrics.footerInInitialViewport) localFailures.push(`desktop footer below initial viewport (bottom=${metrics.footerBottom}, viewport=${metrics.viewportHeight})`);
    }

    if (runtimeErrors.length) localFailures.push(...runtimeErrors);

    if (mobile) {
      await page.locator("[data-hero-card]").scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
    }
    const screenshot = path.join(outputDir, `${viewport.label}.png`);
    await page.screenshot({ path: screenshot, fullPage: false, animations: "disabled" });
    report.results.push({ viewport, metrics, screenshot, failures: localFailures });
    for (const failure of localFailures) failures.push(`${viewport.label}: ${failure}`);
  } catch (error) {
    failures.push(`${viewport.label}: ${error.message}`);
    report.results.push({ viewport, failures: [error.message, ...runtimeErrors] });
  } finally {
    await page.close();
  }
}

await browser.close();
fs.writeFileSync(path.join(outputDir, "visual-report.json"), `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  console.error(`KIDULTS V665 experience validation: FAIL (${failures.length} issue(s))`);
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exit(1);
}

console.log("KIDULTS V665 experience validation: PASS (single #f4f2ee Hero surface, bitmap blend integrated, simplified mobile footer, global UTC timestamps, collector/institution copy polish)");
