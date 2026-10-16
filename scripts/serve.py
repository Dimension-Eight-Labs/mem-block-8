#!/usr/bin/env python3
"""scripts/serve.py - Development server for Mem Block 8 that never caches.

Why this exists: `python3 -m http.server` sends Last-Modified but no
Cache-Control header, so browsers (especially on phones) may reuse old
copies of HTML, CSS, and JS for a while after you edit them. During LAN
testing that makes it impossible to tell whether a fix is actually
running. This server sends `Cache-Control: no-store` on every response,
so each load fetches fresh files.

It is for development only. In production (GitHub Pages) caching and
offline support are handled by the service worker in sw.js. Over plain
HTTP on a LAN address the service worker does not register at all, so it
cannot serve stale files here either.

It also sets explicit MIME types for .js (module scripts are rejected
without a JavaScript type), .webmanifest, and .woff2 (fonts), since the system MIME table
does not always have them.

Usage (from anywhere):
    python3 scripts/serve.py          # port 8088
    python3 scripts/serve.py 9000     # another port

Standard library only; no dependencies.
"""

import functools
import http.server
import socket
import sys
from pathlib import Path

DEFAULT_PORT = 8088
PROJECT_ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """Static file handler that forbids caching of every response."""

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.webmanifest': 'application/manifest+json',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def lan_address():
    """Best guess at this machine's LAN IP, for the startup message.

    Connecting a UDP socket sends no packets; it only asks the OS which
    local interface would be used to reach a private address.
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(('10.255.255.255', 1))
            return s.getsockname()[0]
    except OSError:
        return None


def parse_port(argv):
    """Port from the first argument, or the default."""
    if len(argv) < 2:
        return DEFAULT_PORT
    try:
        port = int(argv[1])
    except ValueError:
        sys.exit(f'Port must be a number, got {argv[1]!r}')
    if not 1 <= port <= 65535:
        sys.exit(f'Port must be between 1 and 65535, got {port}')
    return port


def main():
    port = parse_port(sys.argv)
    handler = functools.partial(NoCacheHandler, directory=str(PROJECT_ROOT))
    # '' binds all interfaces so phones on the same network can connect.
    with http.server.ThreadingHTTPServer(('', port), handler) as server:
        print(f'Serving {PROJECT_ROOT} with Cache-Control: no-store', flush=True)
        print(f'  This machine: http://localhost:{port}/')
        address = lan_address()
        if address:
            print(f'  Phone on the same network: http://{address}:{port}/')
        print('Press Ctrl+C to stop.', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print('\nStopped.')


if __name__ == '__main__':
    main()
