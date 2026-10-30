"""Dev-only: subset the self-hosted WOFF2 fonts to the characters the page really uses (EN + ES).

Sources (Google Fonts latin subsets) live in assets/source/fonts/; outputs go to assets/fonts/.
Always kept: printable ASCII, Spanish letters (á é í ó ú ü ñ and capitals, ¿ ¡) and common punctuation,
so small copy edits never fall back to a system font. Variable axes and OpenType features are kept.
"""
import re
import shutil
from pathlib import Path

from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/source/fonts"
OUT = ROOT / "assets/fonts"
SRC.mkdir(parents=True, exist_ok=True)
for f in OUT.glob("*.woff2"):
    if not (SRC / f.name).exists():
        shutil.copy2(f, SRC / f.name)

text = ""
for page in ("index.html", "es/index.html"):
    text += (ROOT / page).read_text(encoding="utf-8")
text = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", text)
always = "".join(chr(c) for c in range(0x20, 0x7F)) + "áéíóúüñÁÉÍÓÚÜÑ¿¡—–·’‘“”…°©®•→↗×€"
chars = sorted(set(c for c in text + always if c >= " "))
unicodes = ",".join(f"U+{ord(c):04X}" for c in chars)

italic_chars = always  # italic is only used for display accents: keep the safe set only
for name in ("fraunces-normal-latin.woff2", "fraunces-italic-latin.woff2", "cabin-normal-latin.woff2"):
    src, dst = SRC / name, OUT / name
    uni = ",".join(f"U+{ord(c):04X}" for c in sorted(set(italic_chars))) if "italic" in name else unicodes
    args = [str(src), f"--unicodes={uni}", "--flavor=woff2", f"--output-file={dst}",
            "--layout-features=kern,liga,lnum,tnum,onum,pnum,case,calt", "--no-hinting", "--desubroutinize"]
    subset.main(args)
    print(f"{name}: {src.stat().st_size // 1024} KB -> {dst.stat().st_size // 1024} KB")
print("glyph set:", len(chars), "chars")
