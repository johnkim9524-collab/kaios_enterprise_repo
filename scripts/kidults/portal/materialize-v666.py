#!/usr/bin/env python3
from pathlib import Path
import json
import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
PORTAL = ROOT / "apps/kidults-enterprise-staging/public/portal"


def replace(path: Path, old: str, new: str, expected: int = 1) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f"{path}: expected {expected}, found {count}: {old[:100]!r}")
    path.write_text(text.replace(old, new), encoding="utf-8")


def build_hero() -> None:
    source = PORTAL / "assets/hero/racing-roadster-v662.webp"
    target = PORTAL / "assets/hero/racing-roadster-v666-one-surface.webp"
    rgb = np.asarray(Image.open(source).convert("RGB"))
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    mask = np.zeros(rgb.shape[:2], np.uint8)
    background_model = np.zeros((1, 65), np.float64)
    foreground_model = np.zeros((1, 65), np.float64)
    cv2.grabCut(
        bgr,
        mask,
        (430, 230, 1040, 520),
        background_model,
        foreground_model,
        5,
        cv2.GC_INIT_WITH_RECT,
    )
    foreground = np.where(
        (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 1.0, 0.0
    )
    alpha = cv2.GaussianBlur(
        (foreground * 255).astype(np.uint8), (0, 0), 1.0
    ) / 255.0
    limestone = np.array([244, 242, 238], dtype=np.float64)
    composite = (
        rgb.astype(np.float64) * alpha[..., None]
        + limestone * (1 - alpha[..., None])
    ).round().clip(0, 255).astype(np.uint8)
    Image.fromarray(composite, "RGB").save(target, "WEBP", quality=92, method=6)
    rebuilt = np.asarray(Image.open(target).convert("RGB"))
    if rebuilt.shape != (900, 1600, 3):
        raise RuntimeError(f"Unexpected V666 Hero dimensions: {rebuilt.shape}")
    corner = rebuilt[8, 8].astype(int)
    if np.max(np.abs(corner - limestone.astype(int))) > 2:
        raise RuntimeError(f"V666 Hero corner is not #f4f2ee: {corner.tolist()}")
    if target.stat().st_size < 25_000:
        raise RuntimeError(f"V666 Hero unexpectedly small: {target.stat().st_size}")
    print(f"Generated {target} ({target.stat().st_size} bytes)")


def patch_portal() -> None:
    index = PORTAL / "index.html"
    replace(index, 'data-portal-hotfix="v664"', 'data-portal-hotfix="v666"')
    replace(
        index,
        '<meta name="kidults-hotfix-version" content="664">',
        '<meta name="kidults-hotfix-version" content="666">',
    )
    replace(
        index,
        '  <link id="kidults-v664-visible-footer-style" rel="stylesheet" href="components/v664-visible-hero-footer.css?v=664">\n',
        '  <link id="kidults-v664-visible-footer-style" rel="stylesheet" href="components/v664-visible-hero-footer.css?v=664">\n'
        '  <link id="kidults-v666-portal-closure-style" rel="stylesheet" href="components/v666-portal-closure.css?v=666">\n',
    )
    replace(
        index,
        '<script type="module" src="portal.js?v=662-visual95-final"></script>',
        '<script type="module" src="portal.js?v=666"></script>',
    )
    replace(
        index,
        'data-hero-asset="racing-roadster-v662"',
        'data-hero-asset="racing-roadster-v666-one-surface"',
    )
    replace(
        index,
        'data-hero-revision="v664-visible-footer"',
        'data-hero-revision="v666-portal-closure"',
    )
    replace(
        index,
        'src="assets/hero/racing-roadster-v662.webp?v=662-visual95-final" alt="KIDULTS original deep green racing roadster in a warm limestone studio"',
        'src="assets/hero/racing-roadster-v666-one-surface.webp?v=666" alt="KIDULTS original deep green racing roadster on one neutral warm limestone surface"',
    )

    runtime = PORTAL / "portal.js"
    replace(runtime, "mobile-hero-visibility.js?v=662-visual95-final", "mobile-hero-visibility.js?v=666")
    replace(runtime, "editorial-assets.js?v=662-visual95-final", "editorial-assets.js?v=666")
    replace(runtime, "homepage-structure.js?v=662-visual95-final", "homepage-structure.js?v=666")

    editorial = PORTAL / "components/editorial-assets.js"
    replace(editorial, 'const VERSION = "4.1.0";', 'const VERSION = "4.2.0";')
    replace(
        editorial,
        'const ROADSTER_KEY = "racing-roadster-v662";',
        'const ROADSTER_KEY = "racing-roadster-v666-one-surface";',
    )
    replace(
        editorial,
        'const ROADSTER_SOURCE = `assets/hero/racing-roadster-v662.webp?v=${ASSET_QUERY}`;',
        'const ROADSTER_SOURCE = "assets/hero/racing-roadster-v666-one-surface.webp?v=666";',
    )
    replace(
        editorial,
        "KIDULTS original deep green racing roadster in a neutral warm limestone editorial studio",
        "KIDULTS original deep green racing roadster on one neutral warm limestone surface",
    )

    mobile = PORTAL / "components/mobile-hero-visibility.js"
    replace(mobile, 'const VERSION = "2.1.0";', 'const VERSION = "2.2.0";')
    replace(mobile, 'const ASSET_VERSION = "662";', 'const ASSET_VERSION = "666";')
    replace(mobile, 'const CACHE_REVISION = "visual95";', 'const CACHE_REVISION = "portal-closure";')
    replace(mobile, 'const FINAL_TUNE_REVISION = "final";', 'const FINAL_TUNE_REVISION = "one-surface";')
    replace(
        mobile,
        'const HERO_KEY = "racing-roadster-v662";',
        'const HERO_KEY = "racing-roadster-v666-one-surface";',
    )
    replace(
        mobile,
        'const RETRY_ASSET = null;',
        'const RETRY_ASSET = "assets/hero/racing-roadster-v662.webp";',
    )
    replace(mobile, 'fill="#f1ebe2"', 'fill="#f4f2ee"')

    manifest_path = PORTAL / "data/v502-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["hero"]["asset"] = "assets/hero/racing-roadster-v666-one-surface.webp"
    manifest["hero"]["alt"] = (
        "KIDULTS original deep green racing roadster on one neutral warm limestone surface"
    )
    manifest["build_at"] = "2026-08-15T19:45:00+09:00"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    build_hero()
    patch_portal()
    print("KIDULTS V666 portal materialized")
