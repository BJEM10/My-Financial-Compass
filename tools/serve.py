"""Dev-only: static server that behaves like the Hostinger setup (.htaccess): gzip for text, long cache
for versioned assets, no-cache for HTML. Used for Lighthouse runs. Usage: python tools/serve.py [port]"""
import gzip
import http.server
import io
import sys
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEXT = (".html", ".css", ".js", ".svg", ".json", ".txt")


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".avif": "image/avif", ".webp": "image/webp", ".woff2": "font/woff2",
                      ".svg": "image/svg+xml", ".js": "application/javascript"}

    def send_head(self):
        path = self.translate_path(self.path)
        p = Path(path)
        if p.is_dir():
            p = p / "index.html"
        if not p.is_file():
            return super().send_head()
        data = p.read_bytes()
        ctype = self.guess_type(str(p))
        gz = p.suffix in TEXT and "gzip" in self.headers.get("Accept-Encoding", "")
        if gz:
            data = gzip.compress(data, 6)
        self.send_response(200)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if p.suffix in TEXT else ""))
        self.send_header("Content-Length", str(len(data)))
        if gz:
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Vary", "Accept-Encoding")
        if p.suffix == ".html":
            self.send_header("Cache-Control", "no-cache")
        else:
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        self.end_headers()
        return io.BytesIO(data)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5520
    http.server.ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(ROOT))).serve_forever()
