import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const portalRoot = "apps/kidults-enterprise-staging/public/portal";
const errors = [];
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const exists = relative => fs.existsSync(path.join(root, relative));

function dimensions(buffer) {
  const chunk = buffer.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X" && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3)
    };
  }
  if (chunk === "VP8 " && buffer.length >= 30) {
    const marker = buffer.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), 20);
    if (marker >= 0 && marker + 7 < buffer.length) {
      return {
        width: buffer.readUInt16LE(marker + 3) & 0x3fff,
        height: buffer.readUInt16LE(marker + 5) & 0x3fff
      };
    }
  }
  if (chunk === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
    const bits = buffer.readUInt32LE(21);
    return {
      width: 1 + (bits & 0x3fff),
      height: 1 + ((bits >> 14) & 0x3fff)
    };
  }
  return { width: 0, height: 0 };
}

const required = [
  `${portalRoot}/index.html`,
  `${portalRoot}/workspace.html`,
  `${portalRoot}/portal.js`,
  `${portalRoot}/components/editorial-assets.js`,
  `${portalRoot}/components/mobile-hero-visibility.js`,
  `${portalRoot}/components/homepage-structure.js`,
  `${portalRoot}/components/v662-stability-freeze.css`,
  `${portalRoot}/assets/hero/racing-roadster-v662.webp`,
  `${portalRoot}/data/v502-manifest.json`,
  ".github/workflows/kidults-mobile-preview-pages.yml"
];
for (const file of required) if (!exists(file)) errors.push(`Missing required V662 file: ${file}`);

if (!errors.length) {
  const index = read(`${portalRoot}/index.html`);
  const workspace = read(`${portalRoot}/workspace.html`);
  const portal = read(`${portalRoot}/portal.js`);
  const assets = read(`${portalRoot}/components/editorial-assets.js`);
  const mobile = read(`${portalRoot}/components/mobile-hero-visibility.js`);
  const homepage = read(`${portalRoot}/components/homepage-structure.js`);
  const css = read(`${portalRoot}/components/v662-stability-freeze.css`);
  const manifest = JSON.parse(read(`${portalRoot}/data/v502-manifest.json`));
  const deploy = read(".github/workflows/kidults-mobile-preview-pages.yml");

  const assetPath = `${portalRoot}/assets/hero/racing-roadster-v662.webp`;
  const buffer = fs.readFileSync(path.join(root, assetPath));
  if (buffer.subarray(0, 4).toString("ascii") !== "RIFF") errors.push("Roadster header is not RIFF.");
  if (buffer.subarray(8, 12).toString("ascii") !== "WEBP") errors.push("Roadster header is not WEBP.");
  const size = dimensions(buffer);
  if (size.width < 1200 || size.height < 675) errors.push(`Roadster dimensions are below baseline: ${size.width}x${size.height}.`);
  if (buffer.length < 40_000) errors.push(`Roadster binary is unexpectedly small: ${buffer.length} bytes.`);

  for (const marker of [
    'data-homepage-structure="v662"',
    'portal.js?v=662',
    'v662-stability-freeze.css?v=662',
    'racing-roadster-v662.webp?v=662',
    'data-hero-asset="racing-roadster-v662"'
  ]) if (!index.includes(marker)) errors.push(`V662 index marker missing: ${marker}`);

  for (const marker of [
    'mobile-hero-visibility.js?v=662',
    'editorial-assets.js?v=662',
    'homepage-structure.js?v=662',
    'workspaceRoute: "workspace.html"',
    'workspaceMounted: false'
  ]) if (!portal.includes(marker)) errors.push(`V662 portal marker missing: ${marker}`);

  for (const marker of [
    'ROADSTER_KEY = "racing-roadster-v662"',
    'ASSET_VERSION = "662"',
    'museum-editorial-v662'
  ]) if (!assets.includes(marker)) errors.push(`V662 asset marker missing: ${marker}`);

  for (const marker of [
    'HERO_KEY = "racing-roadster-v662"',
    'ASSET_VERSION = "662"',
    'fallbackSvgDataUri',
    'canonicalSource'
  ]) if (!mobile.includes(marker)) errors.push(`V662 mobile marker missing: ${marker}`);

  for (const marker of [
    'data-hero-asset="racing-roadster-v662"',
    'data-image-format="museum-editorial-v662"',
    'object-fit:contain!important',
    'aspect-ratio:4/3',
    '@media(max-width:768px)',
    '@media(max-width:420px)',
    '@media(max-width:340px)'
  ]) if (!css.includes(marker)) errors.push(`V662 CSS marker missing: ${marker}`);

  if (workspace.includes("workspace-page-intro")) errors.push("Workspace duplicate introduction is still present.");
  if (!workspace.includes('workspace-page.js?v=662') || !workspace.includes('workspace-page.css?v=662')) {
    errors.push("Workspace cache generation is not V662.");
  }
  if (!homepage.includes('main.dataset.finalStructure = "v662"')) errors.push("Homepage final structure is not V662.");
  if (manifest.hero?.asset !== "assets/hero/racing-roadster-v662.webp") errors.push("Manifest does not bind the canonical V662 Roadster.");

  for (const retired of [
    "racing-roadster-v654.webp",
    "racing-roadster-v658-desktop.webp",
    "racing-roadster-v660-master.webp",
    "racing-roadster-v658-mobile.webp"
  ]) if (exists(`${portalRoot}/assets/hero/${retired}`)) errors.push(`Retired Roadster remains: ${retired}`);

  if (deploy.includes("sed -i") || deploy.includes("racing-roadster-v660")) {
    errors.push("Deployment still mutates source paths or references the corrupt V660 asset.");
  }
  if (!deploy.includes("Verify V662 source freeze")) errors.push("Deployment does not verify the V662 source freeze.");

  if (!errors.length) console.log(`KIDULTS V662 stability recovery: PASS (${size.width}x${size.height}, ${buffer.length} bytes, one Roadster, one Workspace intro)`);
}

if (errors.length) {
  console.error(`KIDULTS V662 stability recovery: FAIL (${errors.length} error(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
