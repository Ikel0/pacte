"""Deterministic checks run before a CSV batch is admitted downstream."""
from __future__ import annotations

import csv
import hashlib
import math
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any


def count(n: int, singular: str, plural: str) -> str:
    """French agreement: 0 and 1 take the singular."""
    return f"{n} {singular if n < 2 else plural}"


def _issue(check: str, severity: str, message: str, affected: int = 0) -> dict[str, Any]:
    return {"check": check, "severity": severity, "message": message, "affected": affected}


def batch_fingerprint(path: Path) -> str:
    """Fingerprint raw bytes so an audit receipt identifies an exact input."""
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(65536), b""):
            digest.update(block)
    return digest.hexdigest()


def _valid(value: str, field: dict[str, Any]) -> bool:
    if value == "":
        return not field.get("required", False)
    try:
        if field["type"] == "number":
            number = float(value)
            if not math.isfinite(number):
                return False
            if "min" in field and number < field["min"]:
                return False
        elif field["type"] == "date":
            date.fromisoformat(value)
    except ValueError:
        return False
    if field.get("allowed") and value not in field["allowed"]:
        return False
    return True


def _control(identifier: str, label: str, issues: list[dict[str, Any]]) -> dict[str, Any]:
    """Return a UI and API friendly control result without hiding individual issues."""
    scoped = [issue for issue in issues if issue["check"] == identifier or issue["check"].startswith(f"{identifier}.")]
    if any(issue["severity"] == "critical" for issue in scoped):
        state = "failed"
    elif scoped:
        state = "review"
    else:
        state = "passed"
    return {"id": identifier, "label": label, "state": state, "issues": len(scoped)}


def validate_batch(path: Path, contract: dict[str, Any]) -> dict[str, Any]:
    """Validate one file and produce a reproducible admission decision.

    The decision is deliberately conservative: a missing required field, invalid
    required value, duplicate business key, malformed header or empty batch
    never reaches downstream consumers automatically.
    """
    issues: list[dict[str, Any]] = []
    try:
        with path.open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            headers = reader.fieldnames or []
            rows = list(reader)
    except csv.Error as error:
        headers = []
        rows = []
        issues.append(_issue("schema.csv_parse", "critical", f"Lecture du CSV impossible : {error}"))

    fields = contract["fields"]
    expected = {field["name"] for field in fields}
    received = {header for header in headers if header}
    duplicated_headers = sorted({header for header, count in Counter(headers).items() if header and count > 1})
    extra_cells = sum(len(row.get(None) or []) for row in rows)
    if not headers:
        issues.append(_issue("schema.header", "critical", "Le lot ne contient pas d'en-tête lisible"))
    if duplicated_headers:
        issues.append(_issue("schema.duplicate_headers", "critical", f"En-têtes dupliqués : {', '.join(duplicated_headers)}"))
    if extra_cells:
        issues.append(_issue("schema.extra_values", "critical", count(extra_cells, "valeur ne correspond", "valeurs ne correspondent") + " à aucun en-tête", extra_cells))
    if not rows:
        issues.append(_issue("volume.empty_batch", "critical", "Le lot ne contient aucune ligne de données"))

    missing = expected - received
    unexpected = received - expected
    if missing:
        issues.append(_issue("schema.missing_fields", "critical", f"Champs absents : {', '.join(sorted(missing))}"))
    if unexpected:
        issues.append(_issue("schema.unexpected_fields", "warning", f"Champs non prévus : {', '.join(sorted(unexpected))}"))

    for field in fields:
        name = field["name"]
        if name not in received:
            continue
        invalid = [row for row in rows if not _valid((row.get(name) or "").strip(), field)]
        if invalid:
            severity = "critical" if field.get("required") or field["type"] != "string" else "warning"
            issues.append(_issue(f"field.{name}", severity, f"{count(len(invalid), 'valeur invalide', 'valeurs invalides')} pour {name}", len(invalid)))
        if field.get("unique"):
            values = [(row.get(name) or "").strip() for row in rows if (row.get(name) or "").strip()]
            duplicates = sum(count - 1 for count in Counter(values).values() if count > 1)
            if duplicates:
                issues.append(_issue(f"uniqueness.{name}", "critical", f"{count(duplicates, 'identifiant', 'identifiants')} en double pour {name}", duplicates))

    critical = [item for item in issues if item["severity"] == "critical"]
    warnings = [item for item in issues if item["severity"] == "warning"]
    decision = "quarantine" if critical else "review" if warnings else "accept"
    controls = [
        _control("schema", "Schéma", issues),
        _control("field", "Validité des champs", issues),
        _control("uniqueness", "Clés métier", issues),
        _control("volume", "Volume du lot", issues),
    ]
    return {
        "batch": path.name,
        "batch_fingerprint": batch_fingerprint(path),
        "contract": contract["name"],
        "contract_version": contract["version"],
        "contract_fingerprint": contract["fingerprint"],
        "contract_owner": contract["owner"],
        "rows": len(rows),
        "headers": headers,
        "decision": decision,
        "issues": issues,
        "controls": controls,
        "summary": {
            "critical": len(critical),
            "warnings": len(warnings),
            "checks": len(controls),
            "affected_values": sum(issue["affected"] for issue in issues),
        },
    }
