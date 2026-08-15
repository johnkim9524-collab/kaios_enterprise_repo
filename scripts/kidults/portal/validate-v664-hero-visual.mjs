import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const baseUrl = (process.env.KIDULTS_BASE_URL ?? "http://127.0.0.1:4173").replace(/\/$/, "");
const outputDir = path.resolve(process.env.KIDULTS_V664_OUTPUT ?? "artifacts/kidults-v664-hero");
fs.mkdirSync(outputDir, { recursive: true });

const viewports = [
  { label: "desktop-short", width: 1366, height: 768 },
  { label: "desktop-standard", width: 1440, height: 900 },
  { label: "mobile-390", width: 390, height: 844 },
  { label: "mobile-320", width: 320, height: 740 }
];

const failures = [];
const report = { generatedAt: new Date().toISOString(), baseUrl, results: [] };
const browser = await chromium.launch({ headless: true });

function visible(style, rect) {
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
}

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
    await page.goto(`${baseUrl}/portal/index.html?v=664&check=${Date.now()}`, { waitUntil: "networkidle", timeout: 45_000 });
    await page.waitForFunction(() => document.documentElement.dataset.portalHotfix === "v664", null, { timeout: 20_000 });
    await page.waitForFunction(() => {
      const image = document.querySelector("[data-hero-image]");
      return Boolean(image?.complete && image.naturalWidth > 0);
    }, null, { timeout: 20_000 });
    await page.waitForTimeout(450);

    const metrics = await page.evaluate(() => {
      const root = document.documentElement;
      const card = document.querySelector("[data-hero-card]");
      const footer = card?.querySelector(".moment-footer");
      const status = card?.querySelector("[data-hero-status]");
      const vertical = card?.querySelector("[data-hero-vertical]");
      const action = card?.querySelector(".moment-footer .text-link");
      const cardRect = card?.getBoundingClientRect();
      const footerRect = footer?.getBoundingClientRect();
      const statusRect = status?.getBoundingClientRect();
      const verticalRect = vertical?.getBoundingClientRect();
      const actionRect = action?.getBoundingClientRect();
      const footerStyle = footer ? getComputedStyle(footer) : null;
      const statusStyle = status ? getComputedStyle(status) : null;
      const verticalStyle = vertical ? getComputedStyle(vertical) : null;
      const actionStyle = action ? getComputedStyle(action) : null;
      const isVisible = (style, rect) => Boolean(style && rect && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0);

      return {
        portalHotfix: root.dataset.portalHotfix,
        portalVersion: root.dataset.portalVersion,
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        viewportHeight: window.innerHeight,
        heroRevision: card?.dataset.heroRevision,
        heroLayout: card?.dataset.heroLayout,
        cardHeight: cardRect?.height ?? 0,
        cardTop: cardRect?.top ?? 0,
        cardBottom: cardRect?.bottom ?? 0,
        cardBackground: card ? getComputedStyle(card).backgroundColor : null,
        footerVisible: isVisible(footerStyle, footerRect),
        footerHeight: footerRect?.height ?? 0,
        footerTop: footerRect?.top ?? 0,
        footerBottom: footerRect?.bottom ?? 0,
        footerBackground: footerStyle?.backgroundColor ?? null,
        footerContained: Boolean(cardRect && footerRect && footerRect.left >= cardRect.left - 1 && footerRect.right <= cardRect.right + 1 && footerRect.top >= cardRect.top - 1 && footerRect.bottom <= cardRect.bottom + 1),
        footerInInitialViewport: Boolean(footerRect && footerRect.bottom <= window.innerHeight + 1),
        statusVisible: isVisible(statusStyle, statusRect),
        verticalVisible: isVisible(verticalStyle, verticalRect),
        actionVisible: isVisible(actionStyle, actionRect),
        statusDisplay: statusStyle?.display ?? null
      };
    });

    const localFailures = [];
    const mobile = viewport.width <= 768;
    if (metrics.portalHotfix !== "v664") localFailures.push(`portalHotfix=${metrics.portalHotfix}`);
    if (metrics.heroRevision !== "v664-visible-footer") localFailures.push(`heroRevision=${metrics.heroRevision}`);
    if (metrics.heroLayout !== "v663-integrated-footer") localFailures.push(`heroLayout=${metrics.heroLayout}`);
    if (metrics.scrollWidth > metrics.clientWidth + 1) localFailures.push(`horizontal overflow=${metrics.scrollWidth - metrics.clientWidth}px`);
    if (!metrics.footerVisible) localFailures.push("Hero footer is not visible");
    if (!metrics.footerContained) localFailures.push("Hero footer is not contained inside the Hero card");
    if (!metrics.verticalVisible) localFailures.push("Hero vertical label is not visible");
    if (!metrics.actionVisible) localFailures.push("Hero View details action is not visible");
    if (metrics.cardBackground !== "rgb(244, 242, 238)") localFailures.push(`card background=${metrics.cardBackground}`);
    if (metrics.footerBackground !== "rgb(244, 242, 238)") localFailures.push(`footer background=${metrics.footerBackground}`);

    if (mobile) {
      if (metrics.statusVisible || metrics.statusDisplay !== "none") localFailures.push(`mobile status must be hidden (display=${metrics.statusDisplay})`);
      if (metrics.footerHeight > 72) localFailures.push(`mobile footer too tall=${metrics.footerHeight}px`);
    } else {
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
  console.error(`KIDULTS V664 Hero visual validation: FAIL (${failures.length} issue(s))`);
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exit(1);
}

console.log("KIDULTS V664 Hero visual validation: PASS (short desktop viewport footer visible, internal one-surface card, simplified 320/390 mobile footer)");
