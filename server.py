#!/usr/bin/env python3
"""
AP -- Authoring Platform local server.
Serves static files on http://localhost:8060
No API needed -- all authoring is client-side with localStorage.
"""
import http.server
import socketserver
import os

PORT = 8060
DIR  = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def log_message(self, fmt, *args):
        print(f"  {self.address_string()} {fmt % args}")

    def end_headers(self):
        # Allow loading from localhost without CORS issues
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

if __name__ == '__main__':
    with socketserver.TCPServer(('', PORT), Handler) as httpd:
        print(f"\n  PTC Authoring Platform")
        print(f"  ─────────────────────────────────")
        print(f"  http://localhost:{PORT}")
        print(f"  Ctrl+C to stop\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  Server stopped.")
