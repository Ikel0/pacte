from __future__ import annotations

import csv
from collections import Counter
from datetime import date
from pathlib import Path


def _issue(check: str, severity: str, message: str, affected: int = 0) -> dict:
    return {"check": check, "severity": severity, "message": message, "affected": affected}


def _valid(value: str, field: dict) -> bool:
    if value == "":
        return not field.get("required", False)
    try:
        if field["type"] == "number":
            number = float(value)
            if "min" in field and number < field["min"]:
                return False
        elif field["type"] == "date":
            date.fromisoformat(value)
    except ValueError:
        return False
    if field.get("allowed") and value not in field["allowed"]:
        return False
    return True


def validate_batch(path: Path, contract: dict) -> dict:
    with path.open(encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        headers = reader.fieldnames or []
        rows = list(reader)

    fields = contract["fields"]
    expected = {field["name"] for field in fields}
    received = set(headers)
    issues: list[dict] = []
    missing = expected - received
    unexpected = received - expected
    if missing:
        issues.append(_issue("schema.missing_fields", "critical", f"Missing fields: {', '.join(sorted(missing))}"))
    if unexpected:
        issues.append(_issue("schema.unexpected_fields", "warning", f"Unexpected fields: {', '.join(sorted(unexpected))}"))

    for field in fields:
        name = field["name"]
        if name not in received:
            continue
        invalid = [row for row in rows if not _valid((row.get(name) or "").strip(), field)]
        if invalid:
            severity = "critical" if field.get("required") or field["type"] != "string" else "warning"
            issues.append(_issue(f"field.{name}", severity, f"{len(invalid)} invalid value(s) in {name}", len(invalid)))
        if field.get("unique"):
            values = [row.get(name) for row in rows if row.get(name)]
            duplicates = sum(count - 1 for count in Counter(values).values() if count > 1)
            if duplicates:
                issues.append(_issue(f"uniqueness.{name}", "critical", f"{duplicates} duplicate value(s) in {name}", duplicates))

    critical = [item for item in issues if item["severity"] == "critical"]
    decision = "quarantine" if critical else "accept_with_warnings" if issues else "accept"
    score = max(0, 100 - 25 * len(critical) - 8 * len([item for item in issues if item["severity"] == "warning"]))
    return {
        "batch": path.name,
        "contract": contract["name"],
        "contract_version": contract["version"],
        "rows": len(rows),
        "decision": decision,
        "score": score,
        "issues": issues,
    }
