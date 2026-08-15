import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const baseUrl = (process.env.KIDULTS_BASE_URL ?? "http://127.0.0.1:4173").replace(/\/$/, "");
const outputDir = path.resolve(process.env.KIDULTS_VISUAL_OUTPUT ?? "artifacts/kidults-v666-visual");
fs.mkdirSync(outputDir, { recursive: true });

// The legacy V662 visual workflow remains the broad homepage + Workspace gate.
// V666 now owns homepage visual truth; reuse its stronger five-viewport closure
// validation, then retain dedicated Workspace browser checks below.
if (!process.env.KIDULTS_V666_OUTPUT) process.env.KIDULTS_V666_OUTPUT = outputDir;
await import("./validate-v666-experience-closure.mjs");

const viewports = [
  { label: "mobile-390", width: 390, height: 1200 },
  { label: "desktop-1440", width: 1440, height: 1100 }
];
const failures = [];
const report = { generatedAt: new Date().toISOString(), baseUrl, workspace: [] };
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
    await page.goto(`${baseUrl}/portal/workspace.html?mode=ask&qa=${Date.now()}`, {
      waitUntil: "networkidle",
      timeout: 45_000
    });
    await page.waitForFunction(() => document.documentElement.dataset.dataState === "workspace-ready", null, { timeout: 20_000 });
    await page.waitForSelector("#kidults-living-workspace", { timeout: 15_000 });
    await page.waitForTimeout(400);

    const metrics = await page.evaluate(() => {
      const root = document.documentElement;
      return {
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        dataState: root.dataset.dataState,
        visibleIntroCount: [...document.querySelectorAll(".workspace-page-intro")]
          .filter(node => getComputedStyle(node).display !== "none").length,
        workspaceRootCount: document.querySelectorAll("#kidults-living-workspace").length,
        workspaceMountCount: document.querySelectorAll("[data-workspace-mount] #kidults-living-workspace").length,
        statusCount: document.querySelectorAll("[data-workspace-context] > div").length,
        activePanel: root.dataset.workspacePanel,
        tabCount: document.querySelectorAll("[data-workspace-tab]").length,
        pageHeadingCount: document.querySelectorAll("h1").length
      };
    });

    const issues = [];
    if (metrics.scrollWidth > metrics.clientWidth + 1) issues.push(`horizontal overflow ${metrics.scrollWidth - metrics.clientWidth}px`);
    if (metrics.dataState !== "workspace-ready") issues.push(`dataState=${metrics.dataState}`);
    if (metrics.visibleIntroCount !== 0) issues.push(`duplicate intro count=${metrics.visibleIntroCount}`);
    if (metrics.workspaceRootCount !== 1 || metrics.workspaceMountCount !== 1) {
      issues.push(`workspace roots=${metrics.workspaceRootCount}, mounted=${metrics.workspaceMountCount}`);
    }
    if (metrics.statusCount !== 4) issues.push(`status count=${metrics.statusCount}`);
    if (metrics.activePanel !== "ask") issues.push(`active panel=${metrics.activePanel}`);
    if (metrics.tabCount !== 3) issues.push(`tab count=${metrics.tabCount}`);
    if (metrics.pageHeadingCount !== 1) issues.push(`h1 count=${metrics.pageHeadingCount}`);
    issues.push(...runtimeErrors);

    const screenshot = path.join(outputDir, `workspace-${viewport.width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true, animations: "disabled" });
    report.workspace.push({ viewport, screenshot, metrics, failures: issues });
    for (const issue of issues) failures.push(`${viewport.label}: ${issue}`);
  } catch (error) {
    failures.push(`${viewport.label}: ${error.message}`);
    report.workspace.push({ viewport, failures: [error.message, ...runtimeErrors] });
  } finally {
    await page.close();
  }
}

await browser.close();
fs.writeFileSync(path.join(outputDir, "workspace-visual-report.json"), `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  console.error(`KIDULTS V666 homepage + Workspace visual validation: FAIL (${failures.length} issue(s))`);
  failures.forEach(failure => console.error(`ERROR: ${failure}`));
  process.exit(1);
}

console.log("KIDULTS V666 homepage + Workspace visual validation: PASS (five responsive homepage viewports plus 390/1440 Workspace)");
