"""Local, idempotent receipts for Pacte validation runs."""
from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path
from typing import Any


def _payload_hash(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class AuditLog:
    def __init__(self, database: Path) -> None:
        self.database = database
        self._legacy_score = False
        self.database.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.database)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self.connect() as conn:
            conn.execute(
                """CREATE TABLE IF NOT EXISTS validation_runs (
                id INTEGER PRIMARY KEY,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                run_id TEXT,
                batch TEXT NOT NULL,
                batch_fingerprint TEXT,
                contract_name TEXT,
                contract_version TEXT NOT NULL,
                contract_fingerprint TEXT,
                decision TEXT NOT NULL,
                payload_hash TEXT,
                payload TEXT NOT NULL)"""
            )
            existing = {row["name"] for row in conn.execute("PRAGMA table_info(validation_runs)").fetchall()}
            self._legacy_score = "score" in existing
            for name, definition in (
                ("run_id", "TEXT"),
                ("batch_fingerprint", "TEXT"),
                ("contract_name", "TEXT"),
                ("contract_fingerprint", "TEXT"),
                ("payload_hash", "TEXT"),
            ):
                if name not in existing:
                    conn.execute(f"ALTER TABLE validation_runs ADD COLUMN {name} {definition}")
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS validation_runs_run_id ON validation_runs(run_id) WHERE run_id IS NOT NULL")

    def record(self, result: dict[str, Any]) -> dict[str, object]:
        """Store a result once, then return a receipt for fresh or replayed input."""
        payload = json.dumps(result, ensure_ascii=False, sort_keys=True)
        payload_hash = _payload_hash(result)
        with self.connect() as conn:
            existing = conn.execute(
                "SELECT id, created_at, payload_hash FROM validation_runs WHERE run_id = ?", (result["run_id"],)
            ).fetchone()
            replayed = existing is not None
            if existing is None:
                fields = [
                    "run_id",
                    "batch",
                    "batch_fingerprint",
                    "contract_name",
                    "contract_version",
                    "contract_fingerprint",
                    "decision",
                    "payload_hash",
                    "payload",
                ]
                values: list[object] = [
                    result["run_id"],
                    result["batch"],
                    result["batch_fingerprint"],
                    result["contract"],
                    result["contract_version"],
                    result["contract_fingerprint"],
                    result["decision"],
                    payload_hash,
                    payload,
                ]
                # Databases created before the score was removed retain a
                # non-null column. It is populated with a neutral legacy value
                # but is no longer exposed or used to make a decision.
                if self._legacy_score:
                    fields.append("score")
                    values.append(0)
                placeholders = ", ".join("?" for _ in fields)
                cursor = conn.execute(
                    f"INSERT INTO validation_runs({', '.join(fields)}) VALUES ({placeholders})",
                    values,
                )
                row = conn.execute(
                    "SELECT id, created_at, payload_hash FROM validation_runs WHERE id = ?", (cursor.lastrowid,)
                ).fetchone()
            else:
                row = existing
        return {
            "run_id": result["run_id"],
            "record_id": row["id"],
            "recorded_at": row["created_at"],
            "payload_hash": row["payload_hash"],
            "replayed": replayed,
        }

    def recent(self, limit: int = 8) -> list[dict[str, object]]:
        with self.connect() as conn:
            rows = conn.execute(
                """SELECT id, created_at, run_id, batch, contract_name, contract_version,
                decision, payload_hash, payload FROM validation_runs ORDER BY id DESC LIMIT ?""",
                (limit,),
            ).fetchall()
        receipts: list[dict[str, object]] = []
        for row in rows:
            receipt = dict(row)
            payload = json.loads(str(receipt.pop("payload")))
            summary = payload.get("summary") if isinstance(payload, dict) else None
            receipt["summary"] = summary if isinstance(summary, dict) else {}
            receipts.append(receipt)
        return receipts

    def get(self, run_id: str) -> dict[str, Any] | None:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT id, created_at, payload_hash, payload FROM validation_runs WHERE run_id = ?", (run_id,)
            ).fetchone()
        if row is None:
            return None
        payload = json.loads(row["payload"])
        payload["audit"] = {
            "run_id": run_id,
            "record_id": row["id"],
            "recorded_at": row["created_at"],
            "payload_hash": row["payload_hash"],
            "replayed": True,
        }
        return payload
