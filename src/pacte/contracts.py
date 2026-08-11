from __future__ import annotations

import json
from pathlib import Path


def load_contract(path: Path) -> dict:
    with path.open(encoding="utf-8") as stream:
        contract = json.load(stream)
    required = {"name", "version", "owner", "fields", "downstream"}
    missing = required - set(contract)
    if missing:
        raise ValueError(f"Contract is missing: {', '.join(sorted(missing))}")
    names = [field["name"] for field in contract["fields"]]
    if len(names) != len(set(names)):
        raise ValueError("Contract contains duplicate field names")
    return contract
