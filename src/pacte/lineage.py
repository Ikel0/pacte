"""Translate an ingestion decision into a deliberately small lineage plan."""
from __future__ import annotations

from typing import Any


def gate_for(decision: str) -> dict[str, object]:
    """Describe exactly what a downstream writer is allowed to do."""
    if decision == "accept":
        return {
            "state": "open",
            "allows_write": True,
            "requires_review": False,
            "message": "Le lot peut être publié vers les consommateurs déclarés.",
        }
    if decision == "accept_with_warnings":
        return {
            "state": "review",
            "allows_write": False,
            "requires_review": True,
            "message": "La publication attend la revue du propriétaire du contrat.",
        }
    return {
        "state": "closed",
        "allows_write": False,
        "requires_review": True,
        "message": "Le lot est en quarantaine. Aucun consommateur déclaré ne reçoit une nouvelle version.",
    }


def impact_for(contract: dict[str, Any], decision: str) -> list[dict[str, str]]:
    """Map decisions to visible actions for each known consumer."""
    impacts: list[dict[str, str]] = []
    for asset in contract["downstream"]:
        if decision == "accept":
            action = "clear"
        elif decision == "quarantine" and asset["tier"] in {"critical", "high"}:
            action = "blocked"
        else:
            action = "review"
        impacts.append({**asset, "action": action})
    return impacts
