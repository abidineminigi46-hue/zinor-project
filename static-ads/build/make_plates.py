"""Extend each photo's studio background outward so it blends into a flat canvas colour.

assets/<name>.png  ->  assets/<name>-plate.png   (PAD px added on every side)
The plate's outer border is one flat colour (printed), used as the canvas background,
so the photo has no visible edge. The figure itself is untouched.
Run:  python3 make_plates.py
"""
import json
import numpy as np
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAD = 520
FEATHER = {"left": 90, "right": 90, "top": 90, "bottom": 0}
NAMES = ["burgundy-front", "olive-front"]


def smooth(x, k=41):
    pad = k // 2
    xp = np.pad(x, ((pad, pad), (0, 0)), mode="edge")
    ker = np.ones(k) / k
    return np.stack([np.convolve(xp[:, c], ker, mode="valid") for c in range(3)], 1)


def smoothstep(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


out = {}
for name in NAMES:
    a = np.asarray(Image.open(ROOT / "assets" / f"{name}.png").convert("RGB")).astype(np.float32)
    H, W, _ = a.shape
    left = smooth(a[:, 6:50].mean(1))
    right = smooth(a[:, -50:-6].mean(1))
    border = np.concatenate([a[:, 6:50].reshape(-1, 3), a[:, -50:-6].reshape(-1, 3), a[6:30, 60:-60].reshape(-1, 3)])
    C = border.mean(0)

    PH, PW = H + 2 * PAD, W + 2 * PAD
    yy, xx = np.mgrid[0:PH, 0:PW].astype(np.float32)
    r = np.clip(yy - PAD, 0, H - 1).astype(int)
    # horizontal blend between left/right side colour for the row
    u = np.clip((xx - PAD) / (W - 1), 0, 1)[..., None]
    rowcol = left[r] * (1 - u) + right[r] * u
    # below the photo: continue the floor tone of the last rows, then ease into the side colour
    strip = smooth(a[H - 2:H].mean(0), 9)  # per-column colour of the last rows
    bottom = np.zeros((PW, 3), np.float32)
    bottom[PAD:PAD + W] = strip
    bottom[:PAD] = strip[0]
    bottom[PAD + W:] = strip[-1]
    by = np.clip((yy - (PAD + H - 1)) / 220.0, 0, 1)[..., None]
    below = (yy > PAD + H - 1)[..., None]
    rowcol = np.where(below, bottom[xx.astype(int)] * (1 - smoothstep(by)) + rowcol * smoothstep(by), rowcol)
    # distance outside the photo -> fade to flat C
    dx = np.maximum(PAD - xx, xx - (PAD + W - 1)).clip(0)
    dy = np.maximum(PAD - yy, yy - (PAD + H - 1)).clip(0)
    t = smoothstep(np.sqrt(dx**2 + dy**2) / (PAD * 0.9))[..., None]
    plate = rowcol * (1 - t) + C * t

    # paste the photo with soft edges (tiny feather at the bottom to keep the hem)
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    al = np.minimum.reduce([
        smoothstep(xs / FEATHER["left"]),
        smoothstep((W - 1 - xs) / FEATHER["right"]),
        smoothstep(ys / FEATHER["top"]),
        smoothstep((H - 1 - ys) / FEATHER["bottom"]) if FEATHER["bottom"] else np.ones_like(ys),
    ])[..., None]
    region = plate[PAD:PAD + H, PAD:PAD + W]
    plate[PAD:PAD + H, PAD:PAD + W] = a * al + region * (1 - al)

    Image.fromarray(np.clip(plate + 0.5, 0, 255).astype(np.uint8)).save(ROOT / "assets" / f"{name}-plate.png", optimize=True)
    out[name] = {"pad": PAD, "w": PW, "h": PH, "bg": "#%02x%02x%02x" % tuple(int(round(v)) for v in C)}
    print(name, out[name])

(ROOT / "build" / "plates.json").write_text(json.dumps(out, indent=1))
