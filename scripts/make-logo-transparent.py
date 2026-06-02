#!/usr/bin/env python3
"""Remove dark background from navbar logo PNG → logo-transparent.png."""
from __future__ import annotations

import sys
from pathlib import Path

try:
    import numpy as np
    from PIL import Image
except ImportError:
    print("Missing deps. Run: pip install Pillow numpy", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
IMG_DIR = ROOT / "public" / "images"
OUTPUT = IMG_DIR / "logo-transparent.png"

# Prefer round nav emblem; fall back to full brand PNG.
CANDIDATES = ("logo-round.png", "logo.png", "logo-emblem.png", "logo-nav.png")


def pick_source() -> Path:
    for name in CANDIDATES:
        path = IMG_DIR / name
        if path.is_file():
            return path
    raise FileNotFoundError(
        f"No source PNG in {IMG_DIR}. Add logo-round.png or logo.png, then re-run."
    )


def main() -> int:
    src = pick_source()
    print(f"Source: {src.relative_to(ROOT)}")

    img = Image.open(src).convert("RGBA")
    data = np.array(img)
    r, g, b, a = data[:, :, 0], data[:, :, 1], data[:, :, 2], data[:, :, 3]
    mask = (r < 80) & (g < 80) & (b < 80)
    data[mask] = [0, 0, 0, 0]

    result = Image.fromarray(data)
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    result.save(OUTPUT, optimize=True)
    print(f"Saved: {OUTPUT.relative_to(ROOT)} ({OUTPUT.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
