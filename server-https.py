#!/usr/bin/env python3
"""
AP -- Authoring Platform HTTPS server.
Same as server.py but serves over HTTPS on port 443.
Auto-generates a self-signed certificate on first run.
"""
import http.server
import json
import os
import re
import ssl
import subprocess
import sys

PORT = 443
DIR  = os.path.dirname(os.path.abspath(__file__))
CERT = os.path.join(DIR, 'cert.pem')
KEY  = os.path.join(DIR, 'key.pem')
PROJECTS_DIR = os.path.join(DIR, 'projects')
REGISTRY_FILE = os.path.join(PROJECTS_DIR, '_registry.json')

os.makedirs(PROJECTS_DIR, exist_ok=True)


def generate_cert():
    """Generate a self-signed certificate with SANs for localhost."""
    print("  Generating self-signed certificate...")

    # OpenSSL config with Subject Alternative Names (required by modern browsers)
    conf_path = os.path.join(DIR, '_openssl.cnf')
    with open(conf_path, 'w') as f:
        f.write("""\
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
CN = localhost

[v3_req]
subjectAltName = @alt_names
basicConstraints = CA:TRUE

[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
""")

    try:
        subprocess.run([
            'openssl', 'req', '-x509',
            '-newkey', 'rsa:2048',
            '-keyout', KEY,
            '-out', CERT,
            '-days', '365',
            '-nodes',
            '-config', conf_path
        ], check=True, capture_output=True)
        os.remove(conf_path)
        print("  Certificate created: cert.pem + key.pem")
        print("")
        print("  To avoid browser warnings, install as a trusted cert:")
        print("    Windows: double-click cert.pem > Install > Local Machine > Trusted Root CAs")
        print("    Or just click Advanced > Proceed in the browser warning")
    except FileNotFoundError:
        if os.path.isfile(conf_path): os.remove(conf_path)
        print("\n  ERROR: 'openssl' not found on PATH.")
        print("  Install OpenSSL or run from Git Bash where openssl is available.")
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        if os.path.isfile(conf_path): os.remove(conf_path)
        print(f"\n  ERROR: openssl failed: {e.stderr.decode()}")
        sys.exit(1)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def log_message(self, fmt, *args):
        print(f"  {self.address_string()} {fmt % args}")

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def do_GET(self):
        if self.path == '/api/registry':
            self._get_registry()
        elif self.path.startswith('/api/projects/'):
            self._get_project()
        elif self.path == '/api/projects':
            self._list_projects()
        else:
            super().do_GET()

    def do_PUT(self):
        if self.path == '/api/registry':
            self._put_registry()
        elif self.path.startswith('/api/projects/'):
            self._put_project()
        else:
            self._send_json(405, {'error': 'Method not allowed'})

    def do_DELETE(self):
        if self.path.startswith('/api/projects/'):
            self._delete_project()
        else:
            self._send_json(405, {'error': 'Method not allowed'})

    def _get_registry(self):
        if os.path.isfile(REGISTRY_FILE):
            with open(REGISTRY_FILE, 'r', encoding='utf-8') as f:
                self._send_json(200, json.load(f))
        else:
            self._send_json(200, {})

    def _put_registry(self):
        body = self._read_body()
        if body is None: return
        with open(REGISTRY_FILE, 'w', encoding='utf-8') as f:
            json.dump(body, f, indent=2)
        self._send_json(200, {'ok': True})

    def _extract_id(self):
        m = re.match(r'^/api/projects/([a-zA-Z0-9_-]+)$', self.path)
        return m.group(1) if m else None

    def _project_path(self, pid):
        safe = re.sub(r'[^a-zA-Z0-9_-]', '', pid)
        return os.path.join(PROJECTS_DIR, safe + '.json')

    def _list_projects(self):
        ids = []
        for fname in os.listdir(PROJECTS_DIR):
            if fname.endswith('.json') and fname != '_registry.json':
                ids.append(fname[:-5])
        self._send_json(200, {'ids': ids})

    def _get_project(self):
        pid = self._extract_id()
        if not pid: self._send_json(400, {'error': 'Invalid project ID'}); return
        path = self._project_path(pid)
        if not os.path.isfile(path): self._send_json(404, {'error': 'Not found'}); return
        with open(path, 'r', encoding='utf-8') as f:
            self._send_json(200, json.load(f))

    def _put_project(self):
        pid = self._extract_id()
        if not pid: self._send_json(400, {'error': 'Invalid project ID'}); return
        body = self._read_body()
        if body is None: return
        with open(self._project_path(pid), 'w', encoding='utf-8') as f:
            json.dump(body, f, indent=2)
        self._send_json(200, {'ok': True})

    def _delete_project(self):
        pid = self._extract_id()
        if not pid: self._send_json(400, {'error': 'Invalid project ID'}); return
        path = self._project_path(pid)
        if os.path.isfile(path): os.remove(path)
        self._send_json(200, {'ok': True})

    def _read_body(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            return json.loads(self.rfile.read(length))
        except (ValueError, json.JSONDecodeError) as e:
            self._send_json(400, {'error': f'Invalid JSON: {e}'}); return None

    def _send_json(self, code, data):
        body = json.dumps(data).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    if not os.path.isfile(CERT) or not os.path.isfile(KEY):
        generate_cert()

    # Allow bat script to generate cert without starting server
    if '--gen-cert-only' in sys.argv:
        sys.exit(0)

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(CERT, KEY)

    server = http.server.HTTPServer(('', PORT), Handler)
    server.socket = context.wrap_socket(server.socket, server_side=True)

    print(f"\n  PTC Authoring Platform (HTTPS)")
    print(f"  ─────────────────────────────────")
    print(f"  https://localhost:{PORT}")
    print(f"  Projects: {PROJECTS_DIR}")
    print(f"  Ctrl+C to stop\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped.")
