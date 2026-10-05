from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from collections import deque
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from .audit import AuditLog
from .contracts import load_contract
from .lineage import gate_for, impact_for
from .validation import validate_batch, validate_text

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


TRIAL_MAX_BYTES = 64 * 1024
TRIAL_MAX_ROWS = 200


def trial(text: object) -> dict[str, Any]:
    """Check a visitor's edited copy with the real rules, in memory only.

    Nothing is written: no receipt, no file. The decision is computed exactly as
    for a repository batch, so the page cannot show a verdict the engine would not give.
    """
    if not isinstance(text, str):
        raise ValueError("Le champ csv doit contenir le texte du lot.")
    if len(text.encode("utf-8")) > TRIAL_MAX_BYTES:
        raise ValueError("Le lot d’essai dépasse 64 Ko.")
    result = validate_text(text, CONTRACT, "essai.csv")
    if result["rows"] > TRIAL_MAX_ROWS:
        raise ValueError(f"Le lot d’essai dépasse {TRIAL_MAX_ROWS} lignes.")
    result["trial"] = True
    result["gate"] = gate_for(result["decision"])
    result["impact"] = impact_for(CONTRACT, result["decision"])
    return result


class RateLimit:
    """Sliding window per client: a public demo must not become a free CSV validator."""

    def __init__(self, limit: int, window_seconds: float = 60.0) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, client: str, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        with self._lock:
            hits = self._hits.setdefault(client, deque())
            while hits and now - hits[0] >= self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            if len(self._hits) > 10_000:  # never let the table itself grow without bound
                self._hits = {key: value for key, value in self._hits.items() if value and now - value[-1] < self.window}
            return True


# Une frappe déclenche au plus un essai toutes les 350 ms : 90 par minute laisse corriger sans gêne.
TRIAL_LIMIT = RateLimit(90)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "web"), **kwargs)

    def client_ip(self) -> str:
        # Derrière le proxy de Render, l'adresse du visiteur arrive en tête de X-Forwarded-For.
        forwarded = self.headers.get("X-Forwarded-For", "")
        return forwarded.split(",")[0].strip() or self.client_address[0]

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
        if self.path not in {"/api/validate", "/api/trial"}:
            self.send_json({"error": "Unknown route"}, HTTPStatus.NOT_FOUND)
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            # JSON escaping can roughly double a 64 Ko CSV, hence the margin.
            if content_length < 0 or content_length > 200_000:
                raise ValueError("Le corps de la requête est invalide")
            body = json.loads(self.rfile.read(content_length) or b"{}")
            if not isinstance(body, dict):
                raise ValueError("Le JSON doit être un objet")
            if self.path == "/api/trial":
                if not TRIAL_LIMIT.allow(self.client_ip()):
                    self.send_json({"error": "trop d’essais en une minute, réessayez dans un instant"}, HTTPStatus.TOO_MANY_REQUESTS)
                    return
                self.send_json(trial(body.get("csv")))
            else:
                self.send_json(validate(str(body.get("batch", ""))))
        except (json.JSONDecodeError, ValueError, OSError) as error:
            self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)


def main() -> None:
    port = int(os.getenv("PORT", "8090"))
    print(f"Pacte is running on http://localhost:{port}")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
