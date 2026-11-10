"""Serve the existing static app without exposing repository internals."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
PUBLIC_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/seed/seed.json": ("seed/seed.json", "application/json; charset=utf-8"),
}


class Handler(BaseHTTPRequestHandler):
    def do_HEAD(self):
        self.serve_file(head_only=True)

    def do_GET(self):
        self.serve_file()

    def serve_file(self, head_only=False):
        path = urlsplit(self.path).path
        if path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return
        entry = PUBLIC_FILES.get(path)
        if entry is None:
            self.send_error(404)
            return
        filename, content_type = entry
        try:
            content = (ROOT / filename).read_bytes()
        except FileNotFoundError:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if not head_only:
            self.wfile.write(content)


if __name__ == "__main__":
    print("NPI preview listening on 0.0.0.0:5000", flush=True)
    ThreadingHTTPServer(("0.0.0.0", 5000), Handler).serve_forever()
