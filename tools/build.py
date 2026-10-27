"""Dev-only build: src/index.src.html (+ includes) -> index.html, es/index.html, i18n.js, docs/traduccion-es.md

- The English dictionary is EXTRACTED from the HTML (data-i18n / data-i18n-attr), so the English copy has a
  single source of truth: the HTML itself, which is served as-is and indexable without JavaScript.
- The Spanish dictionary is i18n/es.json. The build fails if any English key has no Spanish value.
- es/index.html is a static Spanish copy (better SEO): same markup, Spanish text, paths rewritten to ../

Usage: python tools/build.py
"""
import html
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
ORDER = []  # key order of first appearance (for the review document)


def css_min(css):
    """Conservative CSS minifier: drops comments and collapses whitespace (strings and calc() stay valid)."""
    css = re.sub(r"/\*[\s\S]*?\*/", "", css)
    css = re.sub(r"\s+", " ", css)
    css = re.sub(r"\s*([{};,>])\s*", r"\1", css)
    return css.replace(";}", "}").strip()


def include(text, depth=0):
    def rep(m):
        p = ROOT / m.group(1).strip()
        body = p.read_text(encoding="utf-8")
        if p.suffix == ".css":
            return css_min(body)
        return include(body, depth + 1).strip()
    if depth > 4:
        raise SystemExit("include depth")
    return re.sub(r"<!--@include\s+([^>]+?)-->", rep, text)


class Locator(HTMLParser):
    """Finds byte ranges of data-i18n contents and start tags carrying data-i18n-attr."""

    def __init__(self, src):
        super().__init__(convert_charrefs=False)
        self.src = src
        self.lines = [0]
        for m in re.finditer("\n", src):
            self.lines.append(m.end())
        self.stack = []          # [tag, key, content_start]
        self.inner = []          # (key, start, end)
        self.attrs = []          # (start, end, spec)
        self.keyed_open = 0

    def off(self):
        ln, col = self.getpos()
        return self.lines[ln - 1] + col

    def _start(self, tag, attrs, selfclosing):
        a = dict(attrs)
        start = self.off()
        text = self.get_starttag_text()
        end = start + len(text)
        if "data-i18n-attr" in a:
            self.attrs.append((start, end, a["data-i18n-attr"]))
        if tag in VOID or selfclosing:
            if "data-i18n" in a:
                raise SystemExit(f"data-i18n on void element <{tag}> at {start}")
            return
        key = a.get("data-i18n")
        if key and self.keyed_open:
            raise SystemExit(f"nested data-i18n '{key}' inside another keyed element")
        if key:
            self.keyed_open += 1
        self.stack.append([tag, key, end])

    def handle_starttag(self, tag, attrs):
        self._start(tag, attrs, False)

    def handle_startendtag(self, tag, attrs):
        self._start(tag, attrs, True)

    def handle_endtag(self, tag):
        pos = self.off()
        while self.stack:
            t, key, cstart = self.stack.pop()
            if key:
                self.keyed_open -= 1
                self.inner.append((key, cstart, pos))
            if t == tag:
                break


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


def extract(src):
    loc = Locator(src)
    loc.feed(src)
    en = {}

    def put(k, v):
        if k in en and en[k] != v:
            raise SystemExit(f"key '{k}' has two different English values:\n  {en[k]!r}\n  {v!r}")
        if k not in en:
            ORDER.append(k)
        en[k] = v

    for key, s, e in sorted(loc.inner, key=lambda t: t[1]):
        put(key, norm(src[s:e]))
    for s, e, spec in loc.attrs:
        tag = src[s:e]
        for pair in spec.split(";"):
            attr, key = [x.strip() for x in pair.split(":")]
            m = re.search(r'\s' + re.escape(attr) + r'="([^"]*)"', tag)
            if not m:
                raise SystemExit(f"attribute {attr} missing for key {key}: {tag[:80]}")
            put(key, m.group(1))
    return en, loc


def localize(src, loc, d):
    """Return src with every keyed content/attribute replaced from dict d."""
    edits = []  # (start, end, text)
    for key, s, e in loc.inner:
        edits.append((s, e, d[key]))
    for s, e, spec in loc.attrs:
        tag = src[s:e]
        for pair in spec.split(";"):
            attr, key = [x.strip() for x in pair.split(":")]
            val = d[key].replace('"', "&quot;")
            tag = re.sub(r'(\s' + re.escape(attr) + r'=")[^"]*(")', lambda m: m.group(1) + val + m.group(2), tag, count=1)
        edits.append((s, e, tag))
    edits.sort(key=lambda t: t[0], reverse=True)
    out = src
    last = len(src) + 1
    for s, e, text in edits:
        if e > last:
            raise SystemExit("overlapping edits")
        out = out[:s] + text + out[e:]
        last = s
    return out


def to_spanish_page(src):
    s = src.replace('<html lang="en" class="no-js" data-alt="es/">', '<html lang="es" class="no-js" data-alt="../">', 1)
    # language selector: the active option is Spanish on this page
    s = s.replace('aria-label="English" aria-current="true" data-set-lang="en"', 'aria-label="English" data-set-lang="en"', 1)
    s = s.replace('aria-label="Español" data-set-lang="es"', 'aria-label="Español" aria-current="true" data-set-lang="es"', 1)
    s = s.replace('<input type="hidden" name="lang" value="en"', '<input type="hidden" name="lang" value="es"', 1)

    def rel(u):
        u = u.strip()
        if not u or u.startswith(("#", "http:", "https:", "mailto:", "tel:", "data:", "//", "/", "../")):
            return u
        return "../" + u

    def fix_attr(m):
        name, val = m.group(1), m.group(2)
        if name in ("srcset", "imagesrcset"):
            val = ", ".join(" ".join([rel(p.split()[0])] + p.split()[1:]) for p in val.split(","))
        else:
            val = rel(val)
        return f' {name}="{val}"'

    s = re.sub(r'\s(src|href|srcset|imagesrcset|action)="([^"]*)"', fix_attr, s)
    s = s.replace("url(assets/", "url(../assets/")
    s = s.replace('s.src = "main.min.js?v=', 's.src = "../main.min.js?v=')
    return s


def minify_assets():
    """styles.css -> styles.min.css (always); main.js -> main.min.js with terser when Node is available."""
    import os
    import shutil
    import subprocess
    (ROOT / "styles.min.css").write_text(css_min((ROOT / "styles.css").read_text(encoding="utf-8")), encoding="utf-8")
    node = os.environ.get("MFC_NODE") or shutil.which("node")
    terser = os.environ.get("MFC_TERSER")
    if node and terser:
        subprocess.run([node, terser, str(ROOT / "main.js"), "-c", "-m", "--comments", "false", "-o", str(ROOT / "main.min.js")], check=True)
    else:
        shutil.copy2(ROOT / "main.js", ROOT / "main.min.js")
        print("note: terser not found, main.min.js is an unminified copy")


def main():
    minify_assets()
    raw = (ROOT / "src/index.src.html").read_text(encoding="utf-8")
    src = include(raw)
    en, loc = extract(src)
    es = json.loads((ROOT / "i18n/es.json").read_text(encoding="utf-8"))

    missing = [k for k in en if k not in es]
    extra = [k for k in es if k not in en]
    empty = [k for k in en if k in es and not es[k].strip() and en[k].strip()]
    if missing or empty:
        print("MISSING Spanish keys:", missing, "EMPTY:", empty)
        sys.exit(1)
    if extra:
        print("note: Spanish keys not used in the HTML:", extra)

    (ROOT / "index.html").write_text(src, encoding="utf-8")
    es_src = to_spanish_page(localize(src, loc, es))
    (ROOT / "es").mkdir(exist_ok=True)
    (ROOT / "es/index.html").write_text(es_src, encoding="utf-8")

    data = {"en": en, "es": {k: es[k] for k in en}}
    js = "/* generated by tools/build.py — edit src/index.src.html and i18n/es.json */\nwindow.__MFC_I18N__=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (ROOT / "i18n.js").write_text(js, encoding="utf-8")

    write_review(en, es)
    print(f"ok: {len(en)} keys, en+es complete. index.html {len(src)//1024} KB, es/index.html {len(es_src)//1024} KB, i18n.js {len(js)//1024} KB")


def plain(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def write_review(en, es):
    groups = [
        ("Metadatos (buscadores y redes sociales)", "meta."),
        ("Interfaz, navegación y bitácora", ("ui.", "nav.", "coord.", "port.")),
        ("01 — Portada", "hero."),
        ("02 — Quiénes somos", "about."),
        ("03 — Nuestros valores", "values."),
        ("04 — Lo que nos distingue", "apart."),
        ("05 — Nuestra misión", "mission."),
        ("06 — El fundador", "captain."),
        ("07 — Servicios", ("services.", "svc")),
        ("08 — Contacto y formulario", ("contact.", "form.")),
        ("09 — Términos adicionales", "terms."),
        ("Pie de página y redes", ("footer.", "social.")),
    ]
    lines = [
        "# My Financial Compass — Traducción al español para revisión del cliente",
        "",
        "Trato: **usted** en toda la página. Nombres propios sin traducir (My Financial Compass, Jacobo Laya Jr, "
        "Jac&Mac Photography, Excelsior College, Marquis's Who's Who). \"Navy\" = \"la Marina de los EE. UU.\". "
        "Precios idénticos en ambos idiomas.",
        "",
        "> **Pendiente de aprobación del cliente:** la nota de \"traducción de cortesía\" al inicio de los términos "
        "(clave `terms.note`). No se debe publicar sin su visto bueno.",
        "",
        "> **A revisar:** el texto legal original indica `info@myfinancialcompass.com` (.com) en \"Contact Us\", "
        "mientras el resto del sitio usa `.org`. Se copió tal cual en ambos idiomas.",
        "",
    ]
    used = set()
    for title, pref in groups:
        keys = [k for k in ORDER if k.startswith(pref) and k not in used]
        if not keys:
            continue
        lines += [f"## {title}", ""]
        for k in keys:
            used.add(k)
            e, s = plain(en[k]), plain(es.get(k, ""))
            if not e and not s:
                continue
            lines += [f"**`{k}`**", "", f"- EN: {e if e else '_(solo en español)_'}", f"- ES: {s}", ""]
    rest = [k for k in ORDER if k not in used]
    if rest:
        lines += ["## Otros", ""]
        for k in rest:
            lines += [f"**`{k}`**", "", f"- EN: {plain(en[k])}", f"- ES: {plain(es.get(k, ''))}", ""]
    (ROOT / "docs").mkdir(exist_ok=True)
    (ROOT / "docs/traduccion-es.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
