import json
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path

from pacte import server
from pacte.server import RateLimit, trial

ROOT = Path(__file__).resolve().parents[1]
QUALITY = (ROOT / "data" / "orders_quality_issues.csv").read_text(encoding="utf-8")
DRIFT = (ROOT / "data" / "orders_schema_drift.csv").read_text(encoding="utf-8")


def corrected(text, replacements):
    for old, new in replacements:
        text = text.replace(old, new)
    return text


class TrialRulesTests(unittest.TestCase):
    """Each edit offered by the page, checked with the real engine."""

    def test_unchanged_copy_gives_the_same_decision_as_the_file(self):
        self.assertEqual(trial(QUALITY)["decision"], "quarantine")

    def test_fixing_date_and_amount_of_line_3_is_not_enough(self):
        result = trial(corrected(QUALITY, [("not-a-date,-15.00", "2026-08-01,15.00")]))
        self.assertEqual(result["decision"], "quarantine")
        by_line = {line["line"]: [f["field"] for f in line["findings"]] for line in result["lines"]}
        self.assertEqual(by_line[3], ["order_id"])
        self.assertEqual(by_line[4], ["customer_id", "status"])

    def test_fixing_every_cell_accepts_the_batch(self):
        text = corrected(
            QUALITY,
            [("ord-1001,cust-81,not-a-date,-15.00", "ord-1002,cust-81,2026-08-01,15.00"), ("ord-1003,,2026-08-02,42.50,unknown", "ord-1003,cust-7,2026-08-02,42.50,paid")],
        )
        self.assertEqual(trial(text)["decision"], "accept")

    def test_removing_faulty_rows_accepts_the_batch(self):
        text = "\n".join(QUALITY.splitlines()[:2]) + "\n"
        result = trial(text)
        self.assertEqual(result["decision"], "accept")
        self.assertEqual(result["rows"], 1)

    def test_added_empty_row_is_reported_on_its_line(self):
        result = trial(QUALITY.rstrip("\n") + "\n,,,,\n")
        self.assertEqual(result["lines"][-1]["line"], 5)
        self.assertIn("order_id manquant", [f["message"] for f in result["lines"][-1]["findings"]])

    def test_removing_the_unexpected_column_accepts_the_drifted_batch(self):
        self.assertEqual(trial(DRIFT)["decision"], "review")
        trimmed = "\n".join(line.rsplit(",", 1)[0] for line in DRIFT.splitlines()) + "\n"
        self.assertEqual(trial(trimmed)["decision"], "accept")


class TrialSafetyTests(unittest.TestCase):
    def test_size_limits(self):
        header = QUALITY.splitlines()[0]
        too_many = header + "\n" + "".join(f"ord-{i},c,2026-08-01,1,paid\n" for i in range(201))
        with self.assertRaisesRegex(ValueError, "200 lignes"):
            trial(too_many)
        too_big = header + "\nord-1,c,2026-08-01,1," + "x" * 70_000 + "\n"
        with self.assertRaisesRegex(ValueError, "64 Ko"):
            trial(too_big)
        with self.assertRaises(ValueError):
            trial(["not", "text"])

    def test_markup_and_formulas_come_back_as_inert_text(self):
        payload = '<script>alert(1)</script>'
        text = QUALITY.splitlines()[0] + f'\n"{payload}",=1+1,2026-08-01,=SUM(A1:A2),paid\n'
        line = trial(text)["lines"][0]
        self.assertEqual(line["values"][0], payload)
        self.assertEqual(line["values"][1], "=1+1")
        self.assertIn("amount_eur « =SUM(A1:A2) » n'est pas un nombre", [f["message"] for f in line["findings"]])

    def test_rate_limit_is_per_client_and_slides(self):
        limit = RateLimit(2, window_seconds=60)
        self.assertTrue(limit.allow("a", now=0))
        self.assertTrue(limit.allow("a", now=1))
        self.assertFalse(limit.allow("a", now=2))
        self.assertTrue(limit.allow("b", now=2))
        self.assertTrue(limit.allow("a", now=61))


class QuietHandler(server.Handler):
    def log_message(self, *args):
        pass


class TrialEndpointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def post(self, body, ip="203.0.113.1"):
        connection = HTTPConnection("127.0.0.1", self.httpd.server_address[1])
        payload = json.dumps(body).encode("utf-8")
        connection.request("POST", "/api/trial", payload, {"Content-Type": "application/json", "X-Forwarded-For": ip})
        response = connection.getresponse()
        data = json.loads(response.read())
        connection.close()
        return response.status, data

    def test_trials_are_isolated_and_never_stored(self):
        before = len(server.AUDIT.recent(limit=10_000))
        status_a, first = self.post({"csv": QUALITY}, ip="203.0.113.10")
        fixed = QUALITY.splitlines()[0] + "\nord-1,cust-1,2026-08-01,10.00,paid\n"
        status_b, second = self.post({"csv": fixed}, ip="203.0.113.11")
        status_c, again = self.post({"csv": QUALITY}, ip="203.0.113.10")
        self.assertEqual((status_a, status_b, status_c), (200, 200, 200))
        self.assertEqual(first["decision"], "quarantine")
        self.assertEqual(second["decision"], "accept")
        # Le second visiteur n'a rien changé pour le premier : même entrée, même résultat.
        self.assertEqual(again["decision"], "quarantine")
        self.assertEqual(again["batch_fingerprint"], first["batch_fingerprint"])
        self.assertTrue(first["trial"])
        self.assertNotIn("audit", first)
        self.assertNotIn("run_id", first)
        self.assertEqual(len(server.AUDIT.recent(limit=10_000)), before)

    def test_endpoint_rejects_oversized_input_and_too_many_calls(self):
        status, data = self.post({"csv": "a\n" * 70_000}, ip="203.0.113.20")
        self.assertEqual(status, 400)
        self.assertIn("error", data)
        original = server.TRIAL_LIMIT
        server.TRIAL_LIMIT = RateLimit(1)
        try:
            self.assertEqual(self.post({"csv": QUALITY}, ip="203.0.113.30")[0], 200)
            self.assertEqual(self.post({"csv": QUALITY}, ip="203.0.113.30")[0], 429)
            self.assertEqual(self.post({"csv": QUALITY}, ip="203.0.113.31")[0], 200)
        finally:
            server.TRIAL_LIMIT = original


if __name__ == "__main__":
    unittest.main()
