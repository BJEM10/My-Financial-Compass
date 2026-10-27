"""Dev-only: produce every raster the page ships, from assets/source/.

- Wordmark: cropped from branding-header.png WITHOUT the subtitle (the subtitle is real HTML text,
  so it can be translated). White background removed -> real alpha. AVIF + WebP + PNG, 3 widths.
- Founder portrait (the real photo of Jacobo on the current About page): AVIF + WebP, 2 widths.
- Favicons (32 px PNG + 180 px apple-touch) and the Open Graph card (1200x630 JPEG).
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

SRC = Path("assets/source")
OUT = Path("assets/img")
OUT.mkdir(parents=True, exist_ok=True)
PARCHMENT = (220, 235, 229)  # client palette mint
FOREST = (0x43, 0x69, 0x2E)
BRASS = (0x8A, 0x85, 0x58)


def unwhite(img, colour):
    """White paper -> transparency. Alpha follows how far each pixel is from white, colour is flattened
    to the brand ink so edges stay clean (no white fringe on parchment)."""
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    dist = 255 - a.min(axis=2)            # 0 on pure white, high on ink
    alpha = np.clip((dist - 18) / (150 - 18), 0, 1)  # small threshold kills JPEG-ish noise
    out = np.zeros((a.shape[0], a.shape[1], 4), np.uint8)
    out[..., :3] = colour
    out[..., 3] = (alpha * 255).round().astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def save_set(img, name, widths, avif=True, png=False, quality=78):
    for w in widths:
        h = round(img.height * w / img.width)
        im = img.resize((w, h), Image.LANCZOS)
        im.save(OUT / f"{name}-{w}.webp", "WEBP", quality=quality, method=6)
        if avif:
            im.save(OUT / f"{name}-{w}.avif", "AVIF", quality=quality - 18, speed=4)
        if png:
            im.save(OUT / f"{name}-{w}.png", "PNG", optimize=True)
        sizes = [f"{p.name}={p.stat().st_size // 1024}KB" for p in sorted(OUT.glob(f"{name}-{w}.*"))]
        print(name, w, "x", h, *sizes)


def wordmark():
    src = Image.open(SRC / "branding-header.png").convert("RGB")
    a = np.asarray(src).astype(int)
    green = (a[..., 1] - a[..., 0] > 25) & (a.min(axis=2) < 200)
    rows = np.nonzero(green.any(axis=1))[0]
    cols = np.nonzero(green.any(axis=0))[0]
    # the subtitle is olive (not green), so the green bbox is the wordmark alone
    box = (cols.min() - 6, rows.min() - 6, cols.max() + 7, rows.max() + 7)
    print("wordmark bbox", box)
    crop = src.crop(box)
    # wipe anything olive (subtitle bleed) before alpha
    c = np.asarray(crop).astype(int)
    olive = (np.abs(c[..., 0] - c[..., 1]) < 18) & (c[..., 1] - c[..., 2] > 20) & (c.min(axis=2) < 200)
    c[olive] = 255
    crop = Image.fromarray(c.astype(np.uint8), "RGB")
    rgba = unwhite(crop, FOREST)
    save_set(rgba, "wordmark", (640, 1080, 1600), png=True, quality=82)
    return rgba


def portrait():
    p = Image.open("assets/source/jacobo-laya-portrait.png").convert("RGB")
    # the screenshot has a thin white frame; trim it
    a = np.asarray(p).astype(int)
    nonwhite = a.min(axis=2) < 245
    rows, cols = np.nonzero(nonwhite.any(axis=1))[0], np.nonzero(nonwhite.any(axis=0))[0]
    p = p.crop((cols.min() + 2, rows.min() + 2, cols.max() - 1, rows.max() - 1))
    print("portrait", p.size)
    save_set(p, "jacobo-laya", (360, 560), quality=74)


def compass_raster(size):
    logo = unwhite(Image.open(SRC / "compass-logo.png"), (0x35, 0x62, 0x1A))
    bb = logo.getbbox()
    logo = logo.crop(bb)
    side = max(logo.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(logo, ((side - logo.width) // 2, (side - logo.height) // 2))
    return sq.resize((size, size), Image.LANCZOS)


def icons():
    c = compass_raster(32)
    c.save(OUT / "favicon-32.png", optimize=True)
    touch = Image.new("RGBA", (180, 180), PARCHMENT + (255,))
    touch.alpha_composite(compass_raster(150), (15, 15))
    touch.convert("RGB").save(OUT / "apple-touch-icon.png", optimize=True)
    print("icons ok")


def og(word):
    W, H = 1200, 630
    card = Image.new("RGBA", (W, H), PARCHMENT + (255,))
    d = ImageDraw.Draw(card)
    # fine brass frame + rhumb lines
    d.rectangle((28, 28, W - 29, H - 29), outline=BRASS + (255,), width=2)
    comp = compass_raster(300)
    cx, cy = W // 2, 205
    import math
    for ang in range(0, 360, 30):
        if 120 <= ang <= 240 or ang in (0, 30, 330):
            continue  # keep the area under the compass (the wordmark) clean
        s, c = math.sin(math.radians(ang)), math.cos(math.radians(ang))
        d.line((cx + 165 * s, cy - 165 * c, cx + 330 * s, cy - 330 * c), fill=BRASS + (255,), width=1)
    card.alpha_composite(comp, (cx - 150, cy - 150))
    wm = word.resize((880, round(word.height * 880 / word.width)), Image.LANCZOS)
    card.alpha_composite(wm, ((W - wm.width) // 2, 395))
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 40)
    except OSError:
        font = ImageFont.load_default()
    t = "What Direction Is Your Money Going?"
    tw = d.textlength(t, font=font)
    ImageDraw.Draw(card).text(((W - tw) / 2, 395 + wm.height + 18), t, fill=BRASS, font=font)
    card.convert("RGB").save(OUT / "og-card.jpg", "JPEG", quality=84, optimize=True, progressive=True)
    print("og", (OUT / "og-card.jpg").stat().st_size // 1024, "KB")


def family():
    """The family-on-the-coast photo from the current home page: a wide crop for tablets/desktop and a
    portrait crop centred on the family for phones."""
    p = Image.open(SRC / "familia-costa.jpg").convert("RGB")
    save_set(p, "familia-costa", (800, 1400, 2000), quality=72)
    # family stands around x≈1000–1550 of 1978: portrait 4:5 crop keeping the spyglass and the sea
    h = p.height
    w = round(h * 4 / 5)
    x0 = min(p.width - w, 760)
    save_set(p.crop((x0, 0, x0 + w, h)), "familia-costa-m", (600, 900), quality=72)


if __name__ == "__main__":
    import sys
    only = sys.argv[1:]
    if not only or "wordmark" in only:
        w = wordmark()
    if not only or "portrait" in only:
        portrait()
    if not only or "icons" in only:
        icons()
    if not only:
        og(w)
    if not only or "family" in only:
        family()
