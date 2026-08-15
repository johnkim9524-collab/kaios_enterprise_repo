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
    return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
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
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  return { width: 0, height: 0 };
}

const required = [
  `${portalRoot}/index.html`,
  `${portalRoot}/workspace.html`,
  `${portalRoot}/portal.js`,
  `${portalRoot}/components/renderers.js`,
  `${portalRoot}/components/editorial-assets.js`,
  `${portalRoot}/components/mobile-hero-visibility.js`,
  `${portalRoot}/components/mobile-hero-visibility.css`,
  `${portalRoot}/components/homepage-structure.js`,
  `${portalRoot}/components/v662-stability-freeze.css`,
  `${portalRoot}/components/v664-visible-hero-footer.css`,
  `${portalRoot}/assets/hero/racing-roadster-v662.webp`,
  `${portalRoot}/assets/kidult100/footwear-v654.webp`,
  `${portalRoot}/assets/kidult100/camera-v654.webp`,
  `${portalRoot}/assets/kidult100/toys-v654.webp`,
  `${portalRoot}/assets/kidult100/watch-v655.webp`,
  `${portalRoot}/data/v502-manifest.json`,
  ".github/workflows/kidults-mobile-preview-pages.yml"
];
for (const file of required) if (!exists(file)) errors.push(`Missing required V665 file: ${file}`);

if (!errors.length) {
  const index = read(`${portalRoot}/index.html`);
  const workspace = read(`${portalRoot}/workspace.html`);
  const portal = read(`${portalRoot}/portal.js`);
  const renderers = read(`${portalRoot}/components/renderers.js`);
  const assets = read(`${portalRoot}/components/editorial-assets.js`);
  const mobile = read(`${portalRoot}/components/mobile-hero-visibility.js`);
  const mobileCss = read(`${portalRoot}/components/mobile-hero-visibility.css`);
  const homepage = read(`${portalRoot}/components/homepage-structure.js`);
  const css = read(`${portalRoot}/components/v662-stability-freeze.css`);
  const heroCss = read(`${portalRoot}/components/v664-visible-hero-footer.css`);
  const manifest = JSON.parse(read(`${portalRoot}/data/v502-manifest.json`));
  const deploy = read(".github/workflows/kidults-mobile-preview-pages.yml");

  const heroPath = `${portalRoot}/assets/hero/racing-roadster-v662.webp`;
  const hero = fs.readFileSync(path.join(root, heroPath));
  if (hero.subarray(0, 4).toString("ascii") !== "RIFF") errors.push("Roadster header is not RIFF.");
  if (hero.subarray(8, 12).toString("ascii") !== "WEBP") errors.push("Roadster header is not WEBP.");
  const size = dimensions(hero);
  if (size.width < 1200 || size.height < 675) errors.push(`Roadster dimensions are below baseline: ${size.width}x${size.height}.`);
  if (hero.length < 40_000) errors.push(`Roadster binary is unexpectedly small: ${hero.length} bytes.`);

  const markerGroups = [
    [index, "index", [
      'data-homepage-structure="v662"',
      'data-visual-freeze="v665"',
      'portal.js?v=665',
      'v662-stability-freeze.css?v=662-visual95-final',
      'v664-visible-hero-footer.css?v=665',
      'racing-roadster-v662.webp?v=662-visual95-final',
      'data-hero-asset="racing-roadster-v662"',
      'data-hero-surface="v665-single-surface"'
    ]],
    [portal, "portal", [
      'mobile-hero-visibility.js?v=662-visual95-final',
      'editorial-assets.js?v=662-visual95-final',
      'homepage-structure.js?v=662-visual95-final',
      'renderers.js?v=665',
      'workspaceRoute: "workspace.html"',
      'workspaceMounted: false',
      'visualFreeze: "v665"',
      'getUTCHours'
    ]],
    [renderers, "renderers", [
      'getUTCHours',
      'UTC`'
    ]],
    [assets, "asset binding", [
      'ROADSTER_KEY = "racing-roadster-v662"',
      'ASSET_VERSION = "662"',
      'CACHE_REVISION = "visual95"',
      'VISUAL_SYSTEM = "single-studio-v662-visual95"',
      'museum-editorial-v662',
      'footwear-v654.webp',
      'camera-v654.webp',
      'toys-v654.webp',
      'watch-v655.webp'
    ]],
    [mobile, "mobile runtime", [
      'HERO_KEY = "racing-roadster-v662"',
      'ASSET_VERSION = "662"',
      'fallbackSvgDataUri',
      'canonicalSource'
    ]],
    [css, "Visual95 CSS", [
      'data-hero-asset="racing-roadster-v662"',
      'data-image-format="museum-editorial-v662"',
      'single-studio-v662-visual95',
      'object-fit:contain!important',
      'aspect-ratio:4/3',
      '#f3f1ec',
      'saturate(.94)',
      '@media(max-width:768px)',
      '@media(max-width:420px)',
      '@media(max-width:340px)'
    ]],
    [heroCss, "V665 Hero surface", [
      "V665 extends the foundation",
      "Darken compositing",
      "mix-blend-mode:darken!important",
      "background:transparent!important",
      "--v664-hero-surface:#f4f2ee",
      "background:var(--v664-hero-surface)!important",
      "border-top:0!important"
    ]]
  ];
  for (const [source, label, markers] of markerGroups) {
    for (const marker of markers) if (!source.includes(marker)) errors.push(`${label} marker missing: ${marker}`);
  }

  if (mobileCss.includes("object-position:right center")) errors.push("Mobile Hero remains right-biased.");
  if (!mobileCss.includes("object-position:center center")) errors.push("Mobile Hero center correction is missing.");
  if (workspace.includes("workspace-page-intro")) errors.push("Workspace duplicate introduction is still present.");
  if (!workspace.includes('workspace-page.js?v=662') || !workspace.includes('workspace-page.css?v=662')) {
    errors.push("Workspace cache generation is not V662.");
  }
  if (!homepage.includes('main.dataset.finalStructure = "v662"')) errors.push("Homepage final structure is not V662.");
  if (manifest.hero?.asset !== "assets/hero/racing-roadster-v662.webp") errors.push("Manifest does not bind the canonical V662 Roadster.");
  if (Object.prototype.hasOwnProperty.call(manifest.hero ?? {}, "mobile_asset")) errors.push("Manifest registers a second mobile Roadster.");

  for (const image of [
    `${portalRoot}/assets/kidult100/footwear-v654.webp`,
    `${portalRoot}/assets/kidult100/camera-v654.webp`,
    `${portalRoot}/assets/kidult100/toys-v654.webp`,
    `${portalRoot}/assets/kidult100/watch-v655.webp`
  ]) {
    const data = fs.readFileSync(path.join(root, image));
    if (data.subarray(0, 4).toString("ascii") !== "RIFF" || data.subarray(8, 12).toString("ascii") !== "WEBP") {
      errors.push(`Kidult 100 asset is not WebP: ${image}`);
    }
    if (data.length < 25_000) errors.push(`Kidult 100 asset is unexpectedly small: ${image} (${data.length} bytes)`);
  }

  for (const retired of [
    "racing-roadster-v654.webp",
    "racing-roadster-v658-desktop.webp",
    "racing-roadster-v660-master.webp",
    "racing-roadster-v658-mobile.webp"
  ]) if (exists(`${portalRoot}/assets/hero/${retired}`)) errors.push(`Retired Roadster remains: ${retired}`);

  if (deploy.includes("sed -i")) errors.push("Deployment still mutates source files.");
  for (const marker of [
    "Verify V665 public-experience freeze",
    "portal.js?v=665",
    "renderers.js?v=665",
    "v664-visible-hero-footer.css?v=665",
    "racing-roadster-v662.webp?v=662-visual95-final",
    "kidults-v665-live-evidence"
  ]) if (!deploy.includes(marker)) errors.push(`V665 deployment marker missing: ${marker}`);

  if (!errors.length) {
    console.log(`KIDULTS V665 stability recovery: PASS (${size.width}x${size.height}, ${hero.length} bytes, one Roadster, single Hero surface, unified K100, one Workspace intro)`);
  }
}

if (errors.length) {
  console.error(`KIDULTS V665 stability recovery: FAIL (${errors.length} error(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
