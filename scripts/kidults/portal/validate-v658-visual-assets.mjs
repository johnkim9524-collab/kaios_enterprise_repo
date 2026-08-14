import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const portalRoot = path.join(root, "apps", "kidults-enterprise-staging", "public", "portal");
const errors = [];

function absolute(relative) {
  return path.join(root, relative);
}

function readText(relative) {
  const file = absolute(relative);
  if (!fs.existsSync(file)) {
    errors.push(`Missing required file: ${relative}`);
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

function requireMarkers(label, text, markers) {
  for (const marker of markers) {
    if (!text.includes(marker)) errors.push(`${label} missing V658 marker: ${marker}`);
  }
}

function payloadFromModules(files) {
  const chunks = files.map(relative => {
    const text = readText(relative);
    const match = text.match(/^export default "([A-Za-z0-9+/=]+)";\s*$/);
    if (!match) {
      errors.push(`Invalid embedded asset module: ${relative}`);
      return "";
    }
    return match[1];
  });
  return Buffer.from(chunks.join(""), "base64");
}

function u24(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function webpDimensions(buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }

  const chunk = buffer.toString("ascii", 12, 16);
  const data = 20;
  if (chunk === "VP8X") {
    return [u24(buffer, data + 4) + 1, u24(buffer, data + 7) + 1];
  }
  if (chunk === "VP8 ") {
    if (buffer[data + 3] !== 0x9d || buffer[data + 4] !== 0x01 || buffer[data + 5] !== 0x2a) return null;
    return [buffer.readUInt16LE(data + 6) & 0x3fff, buffer.readUInt16LE(data + 8) & 0x3fff];
  }
  if (chunk === "VP8L") {
    if (buffer[data] !== 0x2f) return null;
    const b1 = buffer[data + 1];
    const b2 = buffer[data + 2];
    const b3 = buffer[data + 3];
    const b4 = buffer[data + 4];
    return [1 + b1 + ((b2 & 0x3f) << 8), 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10)];
  }
  return null;
}

function verifyEmbeddedAsset({ name, files, bytes, width, height, sha256 }) {
  const payload = payloadFromModules(files);
  const digest = crypto.createHash("sha256").update(payload).digest("hex");
  const dimensions = webpDimensions(payload);

  if (payload.length !== bytes) errors.push(`${name}: expected ${bytes} bytes, found ${payload.length}.`);
  if (digest !== sha256) errors.push(`${name}: SHA-256 mismatch (${digest}).`);
  if (!dimensions || dimensions[0] !== width || dimensions[1] !== height) {
    errors.push(`${name}: expected ${width}x${height} WebP, found ${dimensions?.join("x") ?? "invalid"}.`);
  }
}

const paths = {
  html: "apps/kidults-enterprise-staging/public/portal/index.html",
  portal: "apps/kidults-enterprise-staging/public/portal/portal.js",
  editorial: "apps/kidults-enterprise-staging/public/portal/components/editorial-assets.js",
  heroRuntime: "apps/kidults-enterprise-staging/public/portal/components/mobile-hero-visibility.js",
  heroCss: "apps/kidults-enterprise-staging/public/portal/components/mobile-hero-visibility.css",
  k100Runtime: "apps/kidults-enterprise-staging/public/portal/components/k100-integrity-reset.js",
  k100Css: "apps/kidults-enterprise-staging/public/portal/components/k100-integrity-reset.css"
};

const html = readText(paths.html);
const portal = readText(paths.portal);
const editorial = readText(paths.editorial);
const heroRuntime = readText(paths.heroRuntime);
const heroCss = readText(paths.heroCss);
const k100Runtime = readText(paths.k100Runtime);
const k100Css = readText(paths.k100Css);

requireMarkers("index.html", html, [
  '<script type="module" src="portal.js?v=658"></script>',
  'data-hero-image style="opacity:0"'
]);
requireMarkers("portal.js", portal, [
  'k100-integrity-reset.js?v=658',
  'mobile-hero-visibility.js?v=658',
  'editorial-assets.js?v=658',
  "const assetBinding = startAssetBindingHotfix();",
  "renderK100(data.k100);",
  "assetBinding?.rebind?.();"
]);
requireMarkers("editorial-assets.js", editorial, [
  './assets/racing-roadster-v658.js',
  './assets/k100-footwear-v658.js',
  './assets/k100-camera-v658.js',
  './assets/k100-toys-v658.js',
  'const VERSION = "3.0.0"',
  'const ASSET_VERSION = "658"',
  'const ROADSTER_KEY = "racing-roadster-v658"',
  '"footwear-01": `data:image/webp;base64,${footwearBase64}`',
  '"camera-editorial-01": `data:image/webp;base64,${cameraBase64}`',
  '"toys-editorial-01": `data:image/webp;base64,${toysBase64}`',
  '"time-01": `assets/kidult100/watch-v655.webp?v=${ASSET_VERSION}`'
]);
requireMarkers("mobile Hero runtime", heroRuntime, [
  'const VERSION = "3.0.0"',
  'const ASSET_VERSION = "658"',
  'mobile-hero-visibility.css?v=${ASSET_VERSION}',
  'window.KIDULTS_ASSET_BINDING_HOTFIX?.rebind?.()'
]);
requireMarkers("mobile Hero CSS", heroCss, [
  'data-hero-asset="racing-roadster-v658"',
  'width:72%!important',
  'inset:0 -3% 0 auto!important',
  '@media(max-width:768px)',
  'width:100%!important',
  'aspect-ratio:4/3!important',
  'object-fit:contain!important',
  'object-position:center center!important'
]);
requireMarkers("K100 runtime", k100Runtime, [
  'const VERSION = "1.2.0"',
  'const ASSET_VERSION = "658"',
  'k100-integrity-reset.css?v=${ASSET_VERSION}',
  'card.style.setProperty("--k100-object-scale", "1")'
]);
requireMarkers("K100 CSS", k100Css, [
  'grid-template-columns:repeat(4,minmax(0,1fr))',
  'aspect-ratio:4/3',
  'object-fit:cover!important',
  'padding:0!important',
  'transform:none!important',
  'data-k100-id="footwear-01"',
  'data-k100-id="camera-editorial-01"',
  'data-k100-id="toys-editorial-01"',
  'data-k100-id="time-01"'
]);

if (portal.indexOf("renderK100(data.k100);") > portal.indexOf("assetBinding?.rebind?.();")) {
  errors.push("V658 asset rebind must occur after Kidult 100 rendering.");
}
if (/import\s+.*racing-roadster-v655\.js/.test(editorial)) {
  errors.push("Active editorial asset binder still imports the V655 Roadster.");
}

verifyEmbeddedAsset({
  name: "V658 Roadster",
  files: [
    "apps/kidults-enterprise-staging/public/portal/components/assets/racing-roadster-v658-part1.js",
    "apps/kidults-enterprise-staging/public/portal/components/assets/racing-roadster-v658-part2.js",
    "apps/kidults-enterprise-staging/public/portal/components/assets/racing-roadster-v658-part3.js"
  ],
  bytes: 37652,
  width: 1000,
  height: 750,
  sha256: "548d99602e1745fd6bc27912bf5e47354874ff1fd6f89d1f08c2f38f06a5f10a"
});
verifyEmbeddedAsset({
  name: "V658 Sneaker",
  files: [
    "apps/kidults-enterprise-staging/public/portal/components/assets/k100-footwear-v658-part1.js",
    "apps/kidults-enterprise-staging/public/portal/components/assets/k100-footwear-v658-part2.js",
    "apps/kidults-enterprise-staging/public/portal/components/assets/k100-footwear-v658-part3.js"
  ],
  bytes: 15660,
  width: 640,
  height: 480,
  sha256: "35e5df441dc850298179b034c32bc469cb90733e34d4918c589ea1b74ab72aba"
});
verifyEmbeddedAsset({
  name: "V658 Camera",
  files: ["apps/kidults-enterprise-staging/public/portal/components/assets/k100-camera-v658.js"],
  bytes: 12608,
  width: 640,
  height: 480,
  sha256: "19af534f6ea622f4c9dafc4ecd5b83252793aa3bd207113e22d9c8e432ed9616"
});
verifyEmbeddedAsset({
  name: "V658 Robot",
  files: [
    "apps/kidults-enterprise-staging/public/portal/components/assets/k100-toys-v658-part1.js",
    "apps/kidults-enterprise-staging/public/portal/components/assets/k100-toys-v658-part2.js",
    "apps/kidults-enterprise-staging/public/portal/components/assets/k100-toys-v658-part3.js"
  ],
  bytes: 14284,
  width: 640,
  height: 480,
  sha256: "6a0ff1b68ac5d511aefc88c2cd01d2e1c2c2dac0c3a31d5e2b466546b48846f8"
});

const watch = path.join(portalRoot, "assets", "kidult100", "watch-v655.webp");
if (!fs.existsSync(watch)) {
  errors.push("Approved K100 watch asset is missing.");
} else {
  const dimensions = webpDimensions(fs.readFileSync(watch));
  if (!dimensions || dimensions[0] * 3 !== dimensions[1] * 4) {
    errors.push(`Approved watch asset must remain 4:3; found ${dimensions?.join("x") ?? "invalid"}.`);
  }
}

if (errors.length) {
  console.error(`KIDULTS V658 visual asset validation: FAIL (${errors.length} error(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS V658 visual asset validation: PASS (Roadster 1000x750; K100 normalized 4:3 assets; V658 cache graph active)");
