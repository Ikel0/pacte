from __future__ import annotations

import hashlib
import json
import os
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from .audit import AuditLog
from .contracts import load_contract
from .lineage import gate_for, impact_for
from .validation import validate_batch

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
CONTRACT = load_contract(ROOT / "contracts" / "orders.json")
AUDIT = AuditLog(DATA / "pacte.db")


def _run_id(result: dict[str, Any]) -> str:
    material = f"{result['contract_fingerprint']}:{result['batch_fingerprint']}"
    return f"run_{hashlib.sha256(material.encode('utf-8')).hexdigest()[:16]}"


def validate(batch: str) -> dict[str, Any]:
    requested = Path(batch)
    candidate = (DATA / requested).resolve()
    if requested.name != batch or candidate.parent != DATA or candidate.suffix.lower() != ".csv" or not candidate.exists():
        raise ValueError("Choisissez l'un des lots CSV disponibles dans data/.")
    result = validate_batch(candidate, CONTRACT)
    result["run_id"] = _run_id(result)
    result["gate"] = gate_for(result["decision"])
    result["impact"] = impact_for(CONTRACT, result["decision"])
    result["audit"] = AUDIT.record(result)
    return result


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "web"), **kwargs)

    def send_json(self, payload: object, status: HTTPStatus = HTTPStatus.OK) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:
        if self.path == "/api/health":
            self.send_json(
                {
                    "status": "ok",
                    "contract": CONTRACT["name"],
                    "contract_version": CONTRACT["version"],
                    "contract_fingerprint": CONTRACT["fingerprint"],
                }
            )
            return
        if self.path == "/api/overview":
            self.send_json(
                {
                    "contract": CONTRACT,
                    "batches": sorted(path.name for path in DATA.glob("*.csv")),
                    "recent": AUDIT.recent(),
                    "service": {"name": "Pacte", "mode": "demonstration", "audit": "sqlite"},
                }
            )
            return
        if self.path == "/api/audit":
            self.send_json(AUDIT.recent())
            return
        if self.path.startswith("/api/runs/"):
            receipt = AUDIT.get(self.path.removeprefix("/api/runs/"))
            if receipt is None:
                self.send_json({"error": "Reçu introuvable"}, HTTPStatus.NOT_FOUND)
            else:
                self.send_json(receipt)
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path != "/api/validate":
            self.send_json({"error": "Unknown route"}, HTTPStatus.NOT_FOUND)
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length < 0 or content_length > 100_000:
                raise ValueError("Le corps de la requête est invalide")
            body = json.loads(self.rfile.read(content_length) or b"{}")
            if not isinstance(body, dict):
                raise ValueError("Le JSON doit être un objet")
            self.send_json(validate(str(body.get("batch", ""))))
        except (json.JSONDecodeError, ValueError, OSError) as error:
            self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)


def main() -> None:
    port = int(os.getenv("PORT", "8090"))
    print(f"Pacte is running on http://localhost:{port}")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
