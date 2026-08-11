import unittest
from pathlib import Path

from pacte.contracts import load_contract
from pacte.lineage import impact_for
from pacte.validation import validate_batch

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = load_contract(ROOT / "contracts" / "orders.json")


class ValidationTests(unittest.TestCase):
    def test_clean_batch_is_accepted(self):
        result = validate_batch(ROOT / "data" / "orders_clean.csv", CONTRACT)
        self.assertEqual(result["decision"], "accept")
        self.assertEqual(result["score"], 100)

    def test_quality_issues_are_quarantined(self):
        result = validate_batch(ROOT / "data" / "orders_quality_issues.csv", CONTRACT)
        self.assertEqual(result["decision"], "quarantine")
        checks = {issue["check"] for issue in result["issues"]}
        self.assertIn("uniqueness.order_id", checks)
        self.assertIn("field.order_date", checks)

    def test_schema_drift_is_visible_and_impact_is_blocked(self):
        result = validate_batch(ROOT / "data" / "orders_schema_drift.csv", CONTRACT)
        self.assertEqual(result["decision"], "accept_with_warnings")
        self.assertIn("schema.unexpected_fields", {issue["check"] for issue in result["issues"]})
        impact = impact_for(CONTRACT, result["decision"])
        self.assertEqual(impact[0]["action"], "review")


if __name__ == "__main__":
    unittest.main()
