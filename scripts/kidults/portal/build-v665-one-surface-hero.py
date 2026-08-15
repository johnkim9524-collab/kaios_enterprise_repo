#!/usr/bin/env python3
"""Materialize the KIDULTS V665 one-surface Hero asset.

The approved V662 Roadster is preserved. Only the edge-connected studio
background is removed so the card's #f4f2ee surface can show through without
creating a second baked-in background. The car scale and placement are not
changed.
"""

from __future__ import annotations

from pathlib import Path
import sys

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
PORTAL = ROOT / "apps" / "kidults-enterprise-staging" / "public" / "portal"
SOURCE = PORTAL / "assets" / "hero" / "racing-roadster-v662.webp"
TARGET = PORTAL / "assets" / "hero" / "racing-roadster-v665-alpha.webp"


def build() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(f"Missing V662 Hero source: {SOURCE}")

    image = Image.open(SOURCE).convert("RGB")
    rgb = np.asarray(image)
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    _, saturation, value = cv2.split(hsv)

    # The Roadster and its floor shadow are dark/structured. The studio field
    # is bright and neutral. We select only neutral pixels connected to an
    # outer edge, preventing chrome highlights inside the car from being keyed.
    candidate = (((value >= 155) & (saturation <= 55)) |
                 ((value >= 210) & (saturation <= 85))).astype(np.uint8)
    candidate = cv2.morphologyEx(
        candidate,
        cv2.MORPH_CLOSE,
        np.ones((5, 5), np.uint8),
        iterations=1,
    )

    _, labels = cv2.connectedComponents(candidate, connectivity=8)
    border = np.concatenate((labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]))
    border_labels = np.unique(border)
    background = np.isin(labels, border_labels).astype(np.uint8) * 255
    background = cv2.morphologyEx(
        background,
        cv2.MORPH_CLOSE,
        np.ones((3, 3), np.uint8),
        iterations=1,
    )

    alpha = 255 - background
    alpha = cv2.GaussianBlur(alpha, (0, 0), sigmaX=1.2, sigmaY=1.2)
    alpha[alpha < 4] = 0

    rgba = np.dstack((rgb, alpha)).astype(np.uint8)
    output = Image.fromarray(rgba, "RGBA")
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    output.save(TARGET, "WEBP", quality=90, method=6)

    rebuilt = Image.open(TARGET).convert("RGBA")
    alpha_channel = np.asarray(rebuilt)[:, :, 3]
    alpha_min = int(alpha_channel.min())
    alpha_max = int(alpha_channel.max())
    transparent_ratio = float(np.mean(alpha_channel == 0))

    if rebuilt.size != image.size:
        raise RuntimeError(f"Unexpected dimensions: {rebuilt.size}, expected {image.size}")
    if alpha_min != 0 or alpha_max != 255:
        raise RuntimeError(f"Alpha range is {alpha_min}..{alpha_max}, expected 0..255")
    if transparent_ratio < 0.80:
        raise RuntimeError(f"Transparent field too small: {transparent_ratio:.3f}")
    if TARGET.stat().st_size < 25_000:
        raise RuntimeError(f"Generated asset unexpectedly small: {TARGET.stat().st_size}")

    print(
        "KIDULTS V665 one-surface Hero generated: "
        f"{TARGET} ({TARGET.stat().st_size} bytes, "
        f"transparent={transparent_ratio:.3f}, alpha={alpha_min}..{alpha_max})"
    )


if __name__ == "__main__":
    try:
        build()
    except Exception as error:  # fail closed in CI
        print(f"KIDULTS V665 Hero generation failed: {error}", file=sys.stderr)
        raise
