from __future__ import annotations

import json
import sqlite3
from pathlib import Path


class AuditLog:
    def __init__(self, database: Path) -> None:
        self.database = database
        self.database.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as conn:
            conn.execute(
                """CREATE TABLE IF NOT EXISTS validation_runs (
                id INTEGER PRIMARY KEY, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                batch TEXT NOT NULL, contract_version TEXT NOT NULL, decision TEXT NOT NULL,
                score INTEGER NOT NULL, payload TEXT NOT NULL)"""
            )

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.database)
        conn.row_factory = sqlite3.Row
        return conn

    def record(self, result: dict) -> None:
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO validation_runs(batch, contract_version, decision, score, payload) VALUES (?, ?, ?, ?, ?)",
                (result["batch"], result["contract_version"], result["decision"], result["score"], json.dumps(result)),
            )

    def recent(self, limit: int = 8) -> list[dict]:
        with self.connect() as conn:
            rows = conn.execute("SELECT id, created_at, batch, contract_version, decision, score FROM validation_runs ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        return [dict(row) for row in rows]
