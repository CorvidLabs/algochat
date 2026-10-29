"""A loopback webhook receiver for tests: checks signatures and records what it got."""

from __future__ import annotations

import datetime
import ipaddress
import json
import ssl
import threading
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

from algochat.agent.webhook import SIGNATURE_HEADER, TIMESTAMP_HEADER, verify_signature


class Receiver:
    """Runs on 127.0.0.1. ``answer`` maps a payload to (status, body bytes, extra headers)."""

    def __init__(
        self,
        answer: Callable[[dict[str, Any]], tuple[int, bytes, dict[str, str]]] | None = None,
        secret: str | None = None,
        tls: tuple[Path, Path] | None = None,
    ) -> None:
        self.received: list[dict[str, Any]] = []
        self.headers: list[dict[str, str]] = []
        self.bad_signatures = 0
        outer = self
        default = answer or (lambda payload: (200, json.dumps({"reply": f"heard: {payload['text']}"}).encode(), {}))

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:
                body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
                outer.headers.append(dict(self.headers.items()))
                if secret is not None and not verify_signature(
                    secret,
                    self.headers.get(TIMESTAMP_HEADER, ""),
                    body,
                    self.headers.get(SIGNATURE_HEADER, ""),
                ):
                    outer.bad_signatures += 1
                    self.send_response(401)
                    self.end_headers()
                    return
                payload = json.loads(body)
                outer.received.append(payload)
                status, out, extra = default(payload)
                self.send_response(status)
                for key, value in extra.items():
                    self.send_header(key, value)
                self.send_header("Content-Length", str(len(out)))
                self.end_headers()
                self.wfile.write(out)

            def log_message(self, *args: Any) -> None:
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        scheme = "http"
        if tls is not None:
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(str(tls[0]), str(tls[1]))
            self.server.socket = context.wrap_socket(self.server.socket, server_side=True)
            scheme = "https"
        self.url = f"{scheme}://localhost:{self.server.server_address[1]}/hook"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()

    def __enter__(self) -> Receiver:  # noqa: PYI034 - Python 3.10 has no typing.Self
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()


def self_signed(directory: Path) -> tuple[Path, Path]:
    """A throwaway certificate for localhost and 127.0.0.1, usable as its own CA file."""
    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(minutes=5))
        .not_valid_after(now + datetime.timedelta(days=1))
        .add_extension(
            x509.SubjectAlternativeName(
                [x509.DNSName("localhost"), x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]
            ),
            critical=False,
        )
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )
    cert_path, key_path = directory / "cert.pem", directory / "key.pem"
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    key_path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    return cert_path, key_path
