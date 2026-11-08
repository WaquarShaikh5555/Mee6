#!/usr/bin/env python3
"""
Rebuild every app icon from the source artwork.

The supplied logo is a JPEG-compressed square: a dark tile with the monogram on
it. Resizing that directly would carry compression noise, a vignette, and soft
edges into the launcher at every size.

Instead the shapes are recovered from the image: each pixel is decomposed into
"how much teal", "how much gold" and "how much background", which keeps the
anti-aliasing but throws away the noise. The result is composited back with the
exact flat colours, so the mark is sharp whether it is 1024 px or 48 px.

    python3 tools/brand/build-icons.py <source.png>
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "apps" / "mobile" / "assets" / "images"

# Sampled from the artwork.
BACKGROUND = np.array([9, 13, 14], dtype=np.float64)   # #090D0E
TEAL = np.array([126, 184, 182], dtype=np.float64)     # #7EB8B6
GOLD = np.array([208, 178, 110], dtype=np.float64)     # #D0B26E

SUPERSAMPLE = 4


def decompose(source: Path) -> tuple[np.ndarray, np.ndarray]:
    """Coverage of the teal and gold shapes, per pixel, in 0..1."""
    image = np.asarray(Image.open(source).convert("RGB"), dtype=np.float64)
    delta = image - BACKGROUND

    d1 = TEAL - BACKGROUND
    d2 = GOLD - BACKGROUND

    a11 = float(d1 @ d1)
    a12 = float(d1 @ d2)
    a22 = float(d2 @ d2)
    det = a11 * a22 - a12 * a12

    # Least squares: which mix of the two flat colours explains this pixel.
    b1 = delta @ d1
    b2 = delta @ d2

    teal = (a22 * b1 - a12 * b2) / det
    gold = (a11 * b2 - a12 * b1) / det

    teal = np.clip(teal, 0.0, 1.0)
    gold = np.clip(gold, 0.0, 1.0)

    # A pixel cannot be more than fully covered by the two shapes together.
    total = teal + gold
    over = total > 1.0
    teal[over] /= total[over]
    gold[over] /= total[over]

    return teal, gold


def mark_bounds(teal: np.ndarray, gold: np.ndarray) -> tuple[int, int, int, int]:
    mask = (teal + gold) > 0.12
    rows = np.nonzero(mask.any(axis=1))[0]
    cols = np.nonzero(mask.any(axis=0))[0]
    return int(cols.min()), int(rows.min()), int(cols.max()) + 1, int(rows.max()) + 1


def crop_mark(teal: np.ndarray, gold: np.ndarray, box) -> Image.Image:
    """The mark on transparent, cropped to its own bounds with a clean edge."""
    x0, y0, x1, y1 = box
    t = (np.clip(teal[y0:y1, x0:x1], 0, 1) * 255).round().astype(np.uint8)
    g = (np.clip(gold[y0:y1, x0:x1], 0, 1) * 255).round().astype(np.uint8)

    rgb = np.zeros((*t.shape, 3), dtype=np.uint8)
    alpha = np.zeros_like(t)

    # Teal first, gold over it; each with its own coverage.
    for coverage, colour in ((t, TEAL), (g, GOLD)):
        a = coverage.astype(np.float64) / 255.0
        for channel in range(3):
            rgb[..., channel] = np.where(
                a > 0,
                rgb[..., channel] * (1 - a) + colour[channel] * a,
                rgb[..., channel],
            ).round().astype(np.uint8)
        alpha = np.maximum(alpha, coverage)

    out = np.dstack([rgb, alpha])
    return Image.fromarray(out, mode="RGBA")


def place(
    mark: Image.Image,
    canvas: int,
    height_fraction: float,
    background: tuple[int, int, int, int] | None,
) -> Image.Image:
    """Centre the mark on a square canvas at a chosen height, anti-aliased."""
    big = canvas * SUPERSAMPLE
    layer = Image.new("RGBA", (big, big), background if background else (0, 0, 0, 0))

    target_h = max(1, int(round(big * height_fraction)))
    target_w = max(1, int(round(target_h * mark.width / mark.height)))

    scaled = mark.resize((target_w, target_h), Image.LANCZOS)
    layer.alpha_composite(scaled, ((big - target_w) // 2, (big - target_h) // 2))

    return layer.resize((canvas, canvas), Image.LANCZOS)


def monolithic(mark: Image.Image, canvas: int, height_fraction: float) -> Image.Image:
    """White silhouette of the whole mark, for Android's themed icons."""
    alpha = mark.split()[3]
    flat = Image.new("RGBA", mark.size, (255, 255, 255, 0))
    flat.putalpha(alpha)
    return place(flat, canvas, height_fraction, None)


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2

    teal, gold = decompose(Path(sys.argv[1]))
    box = mark_bounds(teal, gold)
    mark = crop_mark(teal, gold, box)

    print(f"mark {mark.width}x{mark.height} at {box}")

    bg = (*[int(v) for v in BACKGROUND], 255)

    # iOS and the Play Store both want 1024, full bleed: the OS applies its own
    # rounded mask, so baking corners in would double-round it.
    place(mark, 1024, 0.573, bg).convert("RGB").save(ASSETS / "icon.png", optimize=True)

    # Adaptive icon: background is a colour, foreground keeps the safe zone.
    place(mark, 1024, 0.573, None).save(ASSETS / "android-icon-foreground.png", optimize=True)
    Image.new("RGB", (1024, 1024), tuple(int(v) for v in BACKGROUND)).save(
        ASSETS / "android-icon-background.png", optimize=True
    )
    monolithic(mark, 1024, 0.573).save(ASSETS / "android-icon-monochrome.png", optimize=True)

    # Splash and in-app: the mark alone, larger, on transparency.
    place(mark, 1024, 0.70, None).save(ASSETS / "splash-icon.png", optimize=True)
    place(mark, 512, 0.72, None).save(ASSETS / "logo-mark.png", optimize=True)

    # The tile exactly as supplied, for anywhere the mark needs its own ground.
    place(mark, 512, 0.573, bg).convert("RGB").save(ASSETS / "logo-tile.png", optimize=True)

    # Browser tab: tiny, so the mark gets a little more room.
    place(mark, 196, 0.66, bg).convert("RGB").save(ASSETS / "favicon.png", optimize=True)

    for name in (
        "icon.png",
        "android-icon-foreground.png",
        "android-icon-background.png",
        "android-icon-monochrome.png",
        "splash-icon.png",
        "logo-mark.png",
        "logo-tile.png",
        "favicon.png",
    ):
        path = ASSETS / name
        with Image.open(path) as check:
            print(f"  {name:32} {check.size[0]:>5}x{check.size[1]:<5} {path.stat().st_size // 1024:>4} KB")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
