"""Loading and defensive validation for Pacte data contracts."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any


FIELD_TYPES = {"string", "number", "date"}
SEMVER = re.compile(r"^\d+\.\d+\.\d+$")


def contract_fingerprint(contract: dict[str, Any]) -> str:
    """Return a stable fingerprint for the exact contract that was evaluated."""
    canonical = json.dumps(contract, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _require_text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Contract {label} must be a non-empty string")
    return value.strip()


def _validate_field(field: Any, index: int) -> None:
    if not isinstance(field, dict):
        raise ValueError(f"Contract field {index} must be an object")
    _require_text(field.get("name"), f"field {index} name")
    field_type = field.get("type")
    if field_type not in FIELD_TYPES:
        raise ValueError(f"Contract field {field['name']} has an unsupported type")
    if not isinstance(field.get("required"), bool):
        raise ValueError(f"Contract field {field['name']} must declare required as a boolean")
    if "unique" in field and not isinstance(field["unique"], bool):
        raise ValueError(f"Contract field {field['name']} has an invalid unique flag")
    if "allowed" in field and (
        not isinstance(field["allowed"], list) or not all(isinstance(item, str) for item in field["allowed"])
    ):
        raise ValueError(f"Contract field {field['name']} has invalid allowed values")
    if "min" in field and (field_type != "number" or not isinstance(field["min"], (int, float))):
        raise ValueError(f"Contract field {field['name']} has an invalid minimum")


def _validate_downstream(asset: Any, index: int) -> None:
    if not isinstance(asset, dict):
        raise ValueError(f"Downstream asset {index} must be an object")
    _require_text(asset.get("asset"), f"downstream asset {index}")
    if asset.get("tier") not in {"critical", "high", "medium", "low"}:
        raise ValueError(f"Downstream asset {asset['asset']} has an invalid tier")
    _require_text(asset.get("reason"), f"downstream reason for {asset['asset']}")


def load_contract(path: Path) -> dict[str, Any]:
    """Load a contract and reject malformed configuration before a batch is read."""
    with path.open(encoding="utf-8") as stream:
        contract = json.load(stream)
    if not isinstance(contract, dict):
        raise ValueError("Contract must contain an object")

    for key in ("name", "version", "owner"):
        _require_text(contract.get(key), key)
    if not SEMVER.fullmatch(contract["version"]):
        raise ValueError("Contract version must use major.minor.patch")
    if not isinstance(contract.get("freshness_hours"), int) or contract["freshness_hours"] <= 0:
        raise ValueError("Contract freshness_hours must be a positive integer")

    fields = contract.get("fields")
    if not isinstance(fields, list) or not fields:
        raise ValueError("Contract must contain at least one field")
    for index, field in enumerate(fields, start=1):
        _validate_field(field, index)
    names = [field["name"] for field in fields]
    if len(names) != len(set(names)):
        raise ValueError("Contract contains duplicate field names")

    downstream = contract.get("downstream")
    if not isinstance(downstream, list) or not downstream:
        raise ValueError("Contract must declare downstream assets")
    for index, asset in enumerate(downstream, start=1):
        _validate_downstream(asset, index)

    enriched = dict(contract)
    enriched["fingerprint"] = contract_fingerprint(contract)
    return enriched
