import json
import hashlib
import hmac
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import server


class FlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        server.DB_PATH = Path(cls.tmp.name) / "test.sqlite3"
        os.environ["ALGOKOPI_ADMIN_USER"] = "admin"
        os.environ["ALGOKOPI_ADMIN_PASSWORD"] = "test-password"
        server.init_db()
        cls.http = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.http.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.thread.join()
        cls.tmp.cleanup()

    def request(self, path, method="GET", body=None, headers=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method,
                                     headers={"Content-Type": "application/json", **(headers or {})})
        try:
            with urllib.request.urlopen(req) as response:
                return response.status, json.load(response), response.headers
        except urllib.error.HTTPError as error:
            return error.code, json.load(error), error.headers

    def test_catalog_and_idempotent_order(self):
        _, menu, _ = self.request("/api/menu")
        self.assertEqual(len(menu), 15)
        self.assertEqual([p["category"] for p in menu].count("Dessert"), 5)
        body = {"table_id": 1, "method": "cashier", "expected_total": 34000,
                "items": [{"product_id": 4, "quantity": 1, "option_ids": ["hot"], "notes": "Sedikit gula"}]}
        headers = {"Idempotency-Key": "test-idempotency-key-001"}
        first = self.request("/api/orders", "POST", body, headers)
        second = self.request("/api/orders", "POST", body, headers)
        self.assertEqual(first[0], 201)
        self.assertEqual(second[0], 200)
        self.assertEqual(first[1]["number"], second[1]["number"])
        self.assertEqual(first[1]["token"], second[1]["token"])
        self.assertEqual(first[1]["payment_status"], "unpaid")
        self.assertTrue(first[1]["is_demo"])
        self.assertEqual(self.request("/api/orders/" + first[1]["token"])[0], 200)
        self.assertEqual(self.request("/api/orders/wrong-token")[0], 404)

    def test_demo_admin_credentials_only_without_configured_admin(self):
        original_user = os.environ.pop("ALGOKOPI_ADMIN_USER", None)
        original_password = os.environ.pop("ALGOKOPI_ADMIN_PASSWORD", None)
        original_real = server.REAL
        try:
            status, account, _ = self.request("/api/admin/login", "POST",
                                              {"username": "admin", "password": "demoadmin"})
            self.assertEqual((status, account["role"]), (200, "admin"))
            server.REAL = True
            status, _, _ = self.request("/api/admin/login", "POST",
                                         {"username": "admin", "password": "demoadmin"})
            self.assertEqual(status, 401)
        finally:
            server.REAL = original_real
            if original_user is not None:
                os.environ["ALGOKOPI_ADMIN_USER"] = original_user
            if original_password is not None:
                os.environ["ALGOKOPI_ADMIN_PASSWORD"] = original_password

    def test_required_variant_and_price_change(self):
        base = {"table_id": 1, "method": "cashier", "expected_total": 34000,
                "items": [{"product_id": 4, "quantity": 1, "option_ids": []}]}
        status, data, _ = self.request("/api/orders", "POST", base, {"Idempotency-Key": "test-variant-key-0001"})
        self.assertEqual((status, data["code"]), (400, "required_option"))
        base["items"][0]["option_ids"] = ["hot"]
        base["expected_total"] = 1
        status, data, _ = self.request("/api/orders", "POST", base, {"Idempotency-Key": "test-price-key-00001"})
        self.assertEqual((status, data["code"], data["total"]), (409, "price_changed", 34000))

    def test_outlet_closed_blocks_new_order(self):
        status, _, headers = self.request("/api/admin/login", "POST", {"username": "admin", "password": "test-password"})
        self.assertEqual(status, 200)
        auth = {"Cookie": headers["Set-Cookie"].split(";", 1)[0]}
        self.assertEqual(self.request("/api/admin/settings", "PATCH", {"orders_open": False}, auth)[0], 200)
        try:
            body = {"table_id": 1, "method": "cashier", "expected_total": 24000,
                    "items": [{"product_id": 2, "quantity": 1, "option_ids": []}]}
            status, data, _ = self.request("/api/orders", "POST", body, {"Idempotency-Key": "test-closed-key-0001"})
            self.assertEqual((status, data["code"]), (409, "outlet_closed"))
            self.assertEqual(self.request("/api/menu")[0], 200)
        finally:
            self.request("/api/admin/settings", "PATCH", {"orders_open": True}, auth)

    def test_staff_status_and_cashier_payment(self):
        body = {"table_id": 2, "method": "cashier", "expected_total": 24000,
                "items": [{"product_id": 2, "quantity": 1, "option_ids": []}]}
        _, order, _ = self.request("/api/orders", "POST", body, {"Idempotency-Key": "test-staff-key-00001"})
        self.assertEqual(self.request("/api/admin/orders")[0], 401)
        status, _, headers = self.request("/api/admin/login", "POST", {"username": "admin", "password": "test-password"})
        self.assertEqual(status, 200)
        cookie = headers["Set-Cookie"].split(";", 1)[0]
        auth = {"Cookie": cookie}
        status, data, _ = self.request(f"/api/admin/orders/{order['id']}/status", "PATCH",
                                       {"status": "processing", "version": 1}, auth)
        self.assertEqual((status, data["status"]), (200, "processing"))
        self.assertEqual(self.request(f"/api/admin/orders/{order['id']}/status", "PATCH",
                                      {"status": "completed", "version": 1}, auth)[0], 409)
        status, paid, _ = self.request(f"/api/admin/orders/{order['id']}/cashier-payment", "POST", {}, auth)
        self.assertEqual((status, paid["payment_status"]), (200, "paid"))
        status, paid_again, _ = self.request(f"/api/admin/orders/{order['id']}/cashier-payment", "POST", {}, auth)
        self.assertEqual((status, paid_again["paid_at"]), (200, paid["paid_at"]))
        _, sales, _ = self.request("/api/admin/sales", headers=auth)
        self.assertEqual(sales["gross"], 0)
        self.assertGreaterEqual(sales["demo_orders"], 2)

    def test_webhook_signature_replay_and_excess_receipt(self):
        body = {"table_id": 3, "method": "cashier", "expected_total": 24000,
                "items": [{"product_id": 2, "quantity": 1, "option_ids": []}]}
        _, order, _ = self.request("/api/orders", "POST", body, {"Idempotency-Key": "test-webhook-key-0001"})
        server.PROVIDER_KEY = "test-provider-secret"
        try:
            with server.db() as con:
                for n in (1, 2):
                    con.execute("""INSERT INTO payment_attempts(order_id,transaction_id,provider_order_id,amount,status,created_at)
                        VALUES(?,?,?,?,?,?)""", (order["id"], f"tx-{n}", f"provider-{n}", 24000, "pending", server.now()))
            def webhook(n, signature=True):
                event = {"transaction_id": f"tx-{n}", "order_id": f"provider-{n}", "amount": 24000,
                         "status": "PAID", "payment_method": "QRIS"}
                raw = json.dumps(event).encode()
                digest = hmac.new(server.PROVIDER_KEY.encode(), raw, hashlib.sha256).hexdigest()
                req = urllib.request.Request(self.base + "/api/webhooks/autogopay", data=raw, method="POST",
                    headers={"Content-Type": "application/json", "X-Signature": digest if signature else "wrong"})
                try:
                    with urllib.request.urlopen(req) as response:
                        return response.status
                except urllib.error.HTTPError as error:
                    return error.code
            self.assertEqual(webhook(1, False), 401)
            self.assertEqual(webhook(1), 200)
            self.assertEqual(webhook(1), 200)
            self.assertEqual(webhook(2), 200)
            with server.db() as con:
                current = con.execute("SELECT * FROM orders WHERE id=?", (order["id"],)).fetchone()
                self.assertEqual(current["payment_status"], "paid")
                self.assertEqual(con.execute("SELECT COUNT(*) FROM extra_receipts WHERE order_id=?", (order["id"],)).fetchone()[0], 1,
                    [dict(r) for r in con.execute("SELECT * FROM payment_events")])
                self.assertEqual(con.execute("SELECT COUNT(*) FROM payment_events WHERE result='paid'").fetchone()[0], 1)
            _, _, headers = self.request("/api/admin/login", "POST",
                                         {"username": "admin", "password": "test-password"})
            auth = {"Cookie": headers["Set-Cookie"].split(";", 1)[0]}
            _, review, _ = self.request("/api/admin/payment-review", headers=auth)
            receipt = review["extra_receipts"][0]
            self.assertEqual(receipt["review_status"], "open")
            status, _, _ = self.request(f"/api/admin/extra-receipts/{receipt['id']}/refund", "POST",
                                         {"reference": "refund-extra-001"}, auth)
            self.assertEqual(status, 200)
            _, review, _ = self.request("/api/admin/payment-review", headers=auth)
            self.assertEqual(review["extra_receipts"][0]["review_status"], "refunded_manual")
        finally:
            server.PROVIDER_KEY = ""

    def test_staff_role_cannot_change_catalog_or_view_sales(self):
        os.environ["ALGOKOPI_STAFF_USER"] = "kasir"
        os.environ["ALGOKOPI_STAFF_PASSWORD"] = "staff-password"
        status, user, headers = self.request("/api/admin/login", "POST",
                                              {"username": "kasir", "password": "staff-password"})
        self.assertEqual((status, user["role"]), (200, "staff"))
        auth = {"Cookie": headers["Set-Cookie"].split(";", 1)[0]}
        self.assertEqual(self.request("/api/admin/orders", headers=auth)[0], 200)
        self.assertEqual(self.request("/api/admin/sales", headers=auth)[0], 403)
        self.assertEqual(self.request("/api/admin/products", headers=auth)[0], 403)
        self.assertEqual(self.request("/api/admin/tables", headers=auth)[0], 403)
        self.assertEqual(self.request("/api/admin/settings", headers=auth)[0], 403)
        self.assertEqual(self.request("/api/admin/audit", headers=auth)[0], 403)
        self.assertEqual(self.request("/api/admin/payment-review", headers=auth)[0], 403)

    def test_z_reporting_open_bill_and_refund(self):
        _, _, headers = self.request("/api/admin/login", "POST", {"username": "admin", "password": "test-password"})
        auth = {"Cookie": headers["Set-Cookie"].split(";", 1)[0]}
        body = {"table_id": 4, "method": "cashier", "expected_total": 24000,
                "items": [{"product_id": 2, "quantity": 1, "option_ids": []}]}
        _, first, _ = self.request("/api/orders", "POST", body, {"Idempotency-Key": "test-report-key-0001"})
        _, second, _ = self.request("/api/orders", "POST", body, {"Idempotency-Key": "test-report-key-0002"})
        with server.db() as con:
            con.execute("UPDATE orders SET is_demo=0 WHERE id IN (?,?)", (first["id"], second["id"]))
        version = first["version"]
        for stage in ("processing", "ready", "completed"):
            status, updated, _ = self.request(f"/api/admin/orders/{first['id']}/status", "PATCH",
                {"status": stage, "version": version}, auth)
            self.assertEqual(status, 200)
            version = updated["version"]
        _, sales, _ = self.request("/api/admin/sales?period=all", headers=auth)
        self.assertEqual(sales["open_bills"], 48000)
        self.assertEqual(sales["gross"], 0)
        self.request(f"/api/admin/orders/{first['id']}/cashier-payment", "POST", {}, auth)
        self.request(f"/api/admin/orders/{second['id']}/cashier-payment", "POST", {}, auth)
        self.request(f"/api/admin/orders/{second['id']}/status", "PATCH",
                     {"status": "cancelled", "version": second["version"], "reason": "Stok habis"}, auth)
        _, sales, _ = self.request("/api/admin/sales?period=all", headers=auth)
        self.assertEqual((sales["gross"], sales["refund_due"], sales["open_bills"]), (48000, 24000, 0))
        self.request(f"/api/admin/orders/{second['id']}/refunds", "POST",
                     {"amount": 24000, "reference": "pengembalian-manual-001"}, auth)
        _, sales, _ = self.request("/api/admin/sales?period=all", headers=auth)
        self.assertEqual((sales["refunds"], sales["net"], sales["refund_due"]), (24000, 24000, 0))


if __name__ == "__main__":
    unittest.main()
