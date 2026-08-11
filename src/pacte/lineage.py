from __future__ import annotations


def impact_for(contract: dict, decision: str) -> list[dict]:
    return [
        {
            **asset,
            "action": "blocked" if decision == "quarantine" and asset["tier"] in {"critical", "high"} else "review" if decision != "accept" else "clear",
        }
        for asset in contract["downstream"]
    ]
