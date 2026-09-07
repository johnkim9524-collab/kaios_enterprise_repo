import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.KIDULTS_PORTAL_BASE_URL ?? 'http://127.0.0.1:4173';
const outputPath = process.env.KIDULTS_HUMAN_ACCEPTANCE_OUTPUT ?? 'artifacts/kidults-v587-human-acceptance-v1.json';
const roles = ['COLLECTOR', 'DEALER', 'INVESTOR', 'MUSEUM', 'AUCTION_HOUSE', 'FAMILY_OFFICE'];
const steps = ['ENTRY', 'NAVIGATION', 'SEARCH', 'OBJECT', 'EVIDENCE', 'DECISION', 'WORKSPACE', 'EXPORT_PERMISSION', 'COMPLETION'];
const questions = ['what_happened', 'why', 'can_i_trust', 'can_i_use', 'what_should_i_do'];
const failures = [];
const receipts = [];
const browser = await chromium.launch({ headless: true });

try {
  for (const role of roles) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const startedAt = Date.now();
    await page.goto(`${baseUrl}/portal/index.html?audit_role=${role}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-v587-presence-strip]');

    const researchText = await page.locator('#research').innerText();
    if (!researchText.includes('Evidence pending') || !researchText.includes('Qualification pending') || !researchText.includes('Research unavailable')) {
      failures.push(`${role}:RESEARCH_GATE_MISSING`);
    }
    if (/Demand remains concentrated|observability is strongest/i.test(researchText)) failures.push(`${role}:UNSUPPORTED_RESEARCH_CONCLUSION`);

    await page.getByRole('button', { name: 'Search KIDULTS intelligence' }).click();
    await page.locator('input[type=search]').fill('Archive Sneaker 01');
    await Promise.all([
      page.waitForURL(/object\.html\?id=footwear-01/),
      page.locator('[data-search-results] a').first().click()
    ]);
    await page.waitForSelector('.v587-museum-context');

    const detail = await page.locator('main').innerText();
    const releaseIdentity = await page.locator('.release-pill').innerText();
    if (releaseIdentity.trim() !== 'V6 RC') failures.push(`${role}:RELEASE_IDENTITY_${releaseIdentity.trim()}`);
    for (const required of ['Availability', 'Evidence Availability', 'Research Availability', 'Provenance State', 'Current Situation', 'Next Action']) {
      if (!detail.includes(required)) failures.push(`${role}:DETAIL_EXPLANATION_MISSING_${required.replaceAll(' ', '_')}`);
    }

    await page.getByRole('button', { name: 'Evidence' }).click();
    await page.waitForSelector('.v587-evidence-drawer[data-open=true]');
    await page.goto(`${baseUrl}/portal/workspace.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.documentElement.dataset.businessJourneyReceipt));
    const receipt = await page.evaluate(() => JSON.parse(document.documentElement.dataset.businessJourneyReceipt));

    if (receipt.state !== 'VERIFIED_PASS') failures.push(`${role}:RECEIPT_${receipt.state}`);
    if (JSON.stringify(receipt.steps) !== JSON.stringify(steps)) failures.push(`${role}:STEP_DRIFT`);
    if (receipt.missing_evidence.length) failures.push(`${role}:MISSING_${receipt.missing_evidence.join('_')}`);
    if (questions.some(question => !receipt.acceptance_questions[question])) failures.push(`${role}:QUESTION_UNANSWERED`);
    if (/\bUNKNOWN\b/.test(JSON.stringify(receipt))) failures.push(`${role}:UNKNOWN_PRESENT`);
    receipts.push({ ...receipt, elapsed_ms: Date.now() - startedAt });
    await context.close();
  }
} finally {
  await browser.close();
}

const report = {
  id: 'kidults-v587-human-acceptance-v1',
  observed_at: new Date().toISOString(),
  state: failures.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
  roles,
  required_steps: steps,
  required_questions: questions,
  receipts,
  failures,
  production: 'HOLD',
  public: 'HOLD',
  g5: 'HOLD'
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
