import unittest
import tempfile
from pathlib import Path

from pacte.audit import AuditLog
from pacte.contracts import load_contract
from pacte.lineage import gate_for, impact_for
from pacte.validation import batch_fingerprint, validate_batch

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = load_contract(ROOT / "contracts" / "orders.json")


class ValidationTests(unittest.TestCase):
    def test_clean_batch_is_accepted(self):
        result = validate_batch(ROOT / "data" / "orders_clean.csv", CONTRACT)
        self.assertEqual(result["decision"], "accept")
        self.assertEqual(result["score"], 100)
        self.assertEqual(result["controls"][0]["state"], "passed")
        self.assertEqual(len(result["batch_fingerprint"]), 64)

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
        self.assertFalse(gate_for(result["decision"])["allows_write"])

    def test_empty_batch_is_quarantined(self):
        with tempfile.TemporaryDirectory() as directory:
            batch = Path(directory) / "empty.csv"
            batch.write_text("order_id,customer_id,order_date,amount_eur,status\n", encoding="utf-8")
            result = validate_batch(batch, CONTRACT)
        self.assertEqual(result["decision"], "quarantine")
        self.assertIn("volume.empty_batch", {issue["check"] for issue in result["issues"]})

    def test_non_finite_values_and_ragged_rows_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            batch = Path(directory) / "invalid.csv"
            batch.write_text(
                "order_id,customer_id,order_date,amount_eur,status\n"
                "ord-1,cust-1,2026-10-01,nan,paid,unexpected\n",
                encoding="utf-8",
            )
            result = validate_batch(batch, CONTRACT)
        self.assertEqual(result["decision"], "quarantine")
        checks = {issue["check"] for issue in result["issues"]}
        self.assertIn("schema.extra_values", checks)
        self.assertIn("field.amount_eur", checks)

    def test_contract_fails_before_a_batch_is_read(self):
        with tempfile.TemporaryDirectory() as directory:
            contract = Path(directory) / "invalid.json"
            contract.write_text('{"name":"orders","version":"1","owner":"billing","fields":[],"downstream":[]}', encoding="utf-8")
            with self.assertRaises(ValueError):
                load_contract(contract)

    def test_audit_receipt_is_idempotent_for_an_exact_input(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "audit.db"
            result = validate_batch(ROOT / "data" / "orders_clean.csv", CONTRACT)
            result["run_id"] = "run_test_exact_input"
            audit = AuditLog(database)
            first = audit.record(result)
            second = audit.record(result)
            self.assertFalse(first["replayed"])
            self.assertTrue(second["replayed"])
            self.assertEqual(first["payload_hash"], second["payload_hash"])
            self.assertEqual(len(audit.recent()), 1)
            recovered = audit.get("run_test_exact_input")
            self.assertEqual(recovered["batch_fingerprint"], batch_fingerprint(ROOT / "data" / "orders_clean.csv"))


if __name__ == "__main__":
    unittest.main()
