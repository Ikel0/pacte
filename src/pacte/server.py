from __future__ import annotations

import json
import os
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .audit import AuditLog
from .contracts import load_contract
from .lineage import impact_for
from .validation import validate_batch

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
CONTRACT = load_contract(ROOT / "contracts" / "orders.json")
AUDIT = AuditLog(DATA / "pacte.db")


def validate(batch: str) -> dict:
    candidate = (DATA / batch).resolve()
    if candidate.parent != DATA or candidate.suffix != ".csv" or not candidate.exists():
        raise ValueError("Choose one of the CSV batches stored in data/.")
    result = validate_batch(candidate, CONTRACT)
    result["impact"] = impact_for(CONTRACT, result["decision"])
    AUDIT.record(result)
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
        if self.path == "/api/overview":
            self.send_json({"contract": CONTRACT, "batches": sorted(path.name for path in DATA.glob("*.csv")), "recent": AUDIT.recent()})
            return
        if self.path == "/api/audit":
            self.send_json(AUDIT.recent())
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path != "/api/validate":
            self.send_json({"error": "Unknown route"}, HTTPStatus.NOT_FOUND)
            return
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or b"{}")
            self.send_json(validate(str(body.get("batch", ""))))
        except (json.JSONDecodeError, ValueError) as error:
            self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)


def main() -> None:
    port = int(os.getenv("PORT", "8090"))
    print(f"Pacte is running on http://localhost:{port}")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
