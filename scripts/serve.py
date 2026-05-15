#!/usr/bin/env python3
"""
Tiny local web server for MandaraLocal.

Usage:
    python scripts/serve.py        # serves on http://localhost:8765
    python scripts/serve.py 8000   # custom port

It serves the project root (the directory containing index.html) and adds
the correct MIME type for .geojson / .js (some Python installs default
"text/plain" for geojson which then breaks fetch in some browsers).
"""
import http.server
import socketserver
import sys
import os
import webbrowser
from pathlib import Path


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


class Handler(http.server.SimpleHTTPRequestHandler):
    # Add / override MIME types
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js":      "application/javascript; charset=utf-8",
        ".mjs":     "application/javascript; charset=utf-8",
        ".json":    "application/json; charset=utf-8",
        ".geojson": "application/geo+json; charset=utf-8",
        ".csv":     "text/csv; charset=utf-8",
        ".html":    "text/html; charset=utf-8",
        ".css":     "text/css; charset=utf-8",
        ".svg":     "image/svg+xml",
    }

    def end_headers(self):
        # Prevent caching during development
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Compact log line
        sys.stderr.write("[serve] %s - %s\n" % (self.address_string(), fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    project_root = Path(__file__).resolve().parent.parent
    os.chdir(project_root)
    url = f"http://localhost:{port}/"

    with ThreadedTCPServer(("", port), Handler) as httpd:
        print(f"  MandaraLocal を {url} で配信中")
        print(f"  公開ディレクトリ: {project_root}")
        print(f"  Ctrl+C で停止")
        try:
            # auto-open the browser on first launch
            if "--no-browser" not in sys.argv:
                try:
                    webbrowser.open(url)
                except Exception:
                    pass
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  停止しました。")


if __name__ == "__main__":
    main()
