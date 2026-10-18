"""AlgoKopi: dependency-free HTTP API with persistent SQLite storage."""
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import threading
import time
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("ALGOKOPI_DB", ROOT / "data" / "algokopi.sqlite3"))
REAL = os.environ.get("ALGOKOPI_REAL_ORDERS") == "1" and os.environ.get("ALGOKOPI_PRICES_CONFIRMED") == "1"
PROVIDER_KEY = os.environ.get("ALGOKOPI_AUTOGOPAY_KEY", "")
PROVIDER = "https://v1-gateway.autogopay.site"
LOCK = threading.RLock()
RATE = {}
STATUS = {"pending": "processing", "processing": "ready", "ready": "completed"}
NAMES = {
    "Minuman": ["Americano", "Espresso", "Cold Brew", "Cappuccino", "Macchiato", "Flat White", "Matcha"],
    "Makanan": ["Nasi Goreng", "Beef Bowl", "Pasta"],
    "Dessert": ["Brownies", "Cake", "Waffle", "French Fries", "Croissant"],
}
SAMPLE_PRICES = [28000, 24000, 32000, 34000, 33000, 35000, 36000, 42000, 48000, 44000, 29000, 32000, 36000, 26000, 28000]
DESCRIPTIONS = {
    "Americano": "Espresso dengan air, sederhana dan kaya rasa.",
    "Espresso": "Satu takaran kopi pekat dengan karakter yang dalam.",
    "Cold Brew": "Kopi seduh dingin yang halus dan menyegarkan.",
    "Cappuccino": "Espresso, susu hangat, dan busa yang lembut.",
    "Macchiato": "Espresso dengan sentuhan busa susu.",
    "Flat White": "Espresso dan susu dengan tekstur lembut.",
    "Matcha": "Teh hijau lembut dengan susu.",
    "Nasi Goreng": "Nasi goreng hangat untuk menemani waktu santai.",
    "Beef Bowl": "Semangkuk nasi dengan daging sapi berbumbu.",
    "Pasta": "Pasta hangat dengan saus gurih.",
    "Brownies": "Cokelat padat dan lembut di setiap gigitan.",
    "Cake": "Sepotong kue lembut untuk teman kopi.",
    "Waffle": "Waffle hangat dengan bagian luar yang renyah.",
    "French Fries": "Kentang goreng renyah untuk dinikmati bersama.",
    "Croissant": "Pastry berlapis dengan rasa mentega yang ringan.",
}


def now():
    return datetime.now(timezone.utc).isoformat()


def db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    con.execute("PRAGMA journal_mode=WAL")
    return con


def rowdict(row):
    return dict(row) if row else None


def init_db():
    with db() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY, category TEXT NOT NULL, name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE, description TEXT NOT NULL, price INTEGER NOT NULL,
            available INTEGER NOT NULL DEFAULT 1, archived INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL, options TEXT NOT NULL DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS tables (
            id INTEGER PRIMARY KEY, label TEXT NOT NULL UNIQUE, area TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY, number TEXT NOT NULL UNIQUE, token_hash TEXT NOT NULL UNIQUE,
            idempotency_key TEXT NOT NULL UNIQUE, table_id INTEGER NOT NULL,
            table_label TEXT NOT NULL, items TEXT NOT NULL, subtotal INTEGER NOT NULL,
            total INTEGER NOT NULL, method TEXT NOT NULL, payment_status TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending', version INTEGER NOT NULL DEFAULT 1,
            is_demo INTEGER NOT NULL, created_at TEXT NOT NULL, paid_at TEXT,
            updated_at TEXT NOT NULL, cancel_reason TEXT, provider_transaction_id TEXT UNIQUE,
            provider_order_id TEXT, qr_url TEXT, checkout_url TEXT, expires_at TEXT,
            last_check_at TEXT, refund_due INTEGER NOT NULL DEFAULT 0,
            refund_recorded INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY(table_id) REFERENCES tables(id)
        );
        CREATE TABLE IF NOT EXISTS audit (
            id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, kind TEXT NOT NULL,
            from_value TEXT, to_value TEXT, actor TEXT NOT NULL,
            reason TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS payment_events (
            id INTEGER PRIMARY KEY, fingerprint TEXT NOT NULL UNIQUE,
            provider_transaction_id TEXT, result TEXT NOT NULL, received_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS payment_attempts (
            id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL,
            transaction_id TEXT NOT NULL UNIQUE, provider_order_id TEXT NOT NULL,
            amount INTEGER NOT NULL, status TEXT NOT NULL, allocated INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL, FOREIGN KEY(order_id) REFERENCES orders(id)
        );
        CREATE TABLE IF NOT EXISTS extra_receipts (
            id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL,
            transaction_id TEXT NOT NULL UNIQUE, amount INTEGER NOT NULL,
            received_at TEXT NOT NULL, review_status TEXT NOT NULL DEFAULT 'open',
            FOREIGN KEY(order_id) REFERENCES orders(id)
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY, username TEXT NOT NULL, role TEXT NOT NULL,
            expires_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY, value TEXT NOT NULL
        );
        """)
        if not con.execute("SELECT 1 FROM settings WHERE key='token_secret'").fetchone():
            con.execute("INSERT INTO settings VALUES('token_secret',?)", (secrets.token_hex(32),))
        if not con.execute("SELECT 1 FROM settings WHERE key='orders_open'").fetchone():
            con.execute("INSERT INTO settings VALUES('orders_open','1')")
        if not con.execute("SELECT 1 FROM products LIMIT 1").fetchone():
            i = 0
            for category, names in NAMES.items():
                for name in names:
                    slug = name.lower().replace(" ", "-")
                    options = []
                    if name in ("Americano", "Cappuccino", "Macchiato", "Flat White", "Matcha"):
                        options = [{"name": "Suhu", "required": True, "choices": [
                            {"id": "hot", "label": "Panas", "delta": 0},
                            {"id": "iced", "label": "Dingin", "delta": 0}]}]
                    con.execute("INSERT INTO products(category,name,slug,description,price,sort_order,options) VALUES(?,?,?,?,?,?,?)",
                                (category, name, slug, DESCRIPTIONS[name], SAMPLE_PRICES[i], i, json.dumps(options)))
                    i += 1
        if not con.execute("SELECT 1 FROM tables LIMIT 1").fetchone():
            for n in range(1, 13):
                con.execute("INSERT INTO tables(label,area) VALUES(?,?)", (f"Meja {n:02d}", "Indoor" if n <= 8 else "Teras"))


def fail(code, message, status=400, **extra):
    return status, {"code": code, "message": message, **extra}


def rate_allowed(key, limit, seconds):
    stamp = time.monotonic()
    recent = [value for value in RATE.get(key, []) if stamp - value < seconds]
    if len(recent) >= limit:
        RATE[key] = recent
        return False
    recent.append(stamp)
    RATE[key] = recent
    if len(RATE) > 10000:
        RATE.clear()
    return True


def safe_order(con, order, token=None):
    d = rowdict(order)
    d["items"] = json.loads(d["items"])
    d.pop("token_hash", None)
    d.pop("idempotency_key", None)
    if token:
        d["token"] = token
    return d


def get_order(con, token):
    digest = hashlib.sha256(token.encode()).hexdigest()
    return con.execute("SELECT * FROM orders WHERE token_hash=?", (digest,)).fetchone()


def token_for_key(con, key):
    secret = con.execute("SELECT value FROM settings WHERE key='token_secret'").fetchone()[0]
    return hmac.new(bytes.fromhex(secret), key.encode(), hashlib.sha256).hexdigest()


def public_menu(con):
    products = [dict(p) for p in con.execute("SELECT * FROM products WHERE archived=0 ORDER BY sort_order,id")]
    for p in products:
        p["options"] = json.loads(p["options"])
    return products


def provider_call(path, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(PROVIDER + path, data=data, method="POST",
        headers={"Authorization": "Bearer " + PROVIDER_KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=12) as response:
        return json.load(response)


def provider_data(result):
    # Some gateway responses wrap the documented fields in data.
    return result.get("data", result) if isinstance(result, dict) else {}


def provider_url(value):
    if not value:
        return None
    parsed = urlparse(str(value))
    return str(value) if parsed.scheme == "https" and parsed.netloc else None


def mark_paid(con, order, actor, transaction_id=None):
    if order["payment_status"] == "paid":
        return
    stamp = now()
    if transaction_id:
        con.execute("UPDATE payment_attempts SET allocated=1,status='paid' WHERE transaction_id=?", (transaction_id,))
        if order["method"] == "cashier":
            con.execute("UPDATE orders SET method='qris' WHERE id=?", (order["id"],))
            audit(con, order["id"], "method", "cashier", "qris", actor, "QRIS terlambat diterima sebelum pembayaran kasir")
    if order["status"] == "cancelled":
        con.execute("UPDATE orders SET payment_status='refund_due',paid_at=?,refund_due=total,updated_at=? WHERE id=?",
                    (stamp, stamp, order["id"]))
    else:
        con.execute("UPDATE orders SET payment_status='paid',paid_at=?,updated_at=? WHERE id=?", (stamp, stamp, order["id"]))
    audit(con, order["id"], "payment", order["payment_status"], "paid", actor)


def audit(con, oid, kind, before, after, actor, reason=None):
    con.execute("INSERT INTO audit(order_id,kind,from_value,to_value,actor,reason,created_at) VALUES(?,?,?,?,?,?,?)",
                (oid, kind, before, after, actor, reason, now()))


def reconcile(con, order):
    if not PROVIDER_KEY or not order["provider_transaction_id"] or order["payment_status"] in ("paid", "refund_due", "refunded_manual"):
        return
    result = provider_data(provider_call("/qris/status", {"transaction_id": order["provider_transaction_id"]}))
    state = str(result.get("transaction_status", "")).lower()
    if state == "settlement":
        attempt = con.execute("SELECT * FROM payment_attempts WHERE transaction_id=?", (order["provider_transaction_id"],)).fetchone()
        if attempt and attempt["amount"] == order["total"]:
            mark_paid(con, order, "autogopay:reconcile", attempt["transaction_id"])
        else:
            audit(con, order["id"], "payment_review", None, "amount_mismatch", "autogopay:reconcile")
    elif state in ("expire", "cancel") and order["payment_status"] != "paid":
        mapped = "expired" if state == "expire" else "cancelled"
        con.execute("UPDATE payment_attempts SET status=? WHERE transaction_id=?", (mapped, order["provider_transaction_id"]))
        con.execute("UPDATE orders SET payment_status=?,updated_at=? WHERE id=?", (mapped, now(), order["id"]))


def authenticated(con, handler, admin=False):
    cookie = SimpleCookie()
    try:
        cookie.load(handler.headers.get("Cookie", ""))
    except Exception:
        return None
    morsel = cookie.get("algokopi_session")
    if not morsel:
        return None
    digest = hashlib.sha256(morsel.value.encode()).hexdigest()
    session = con.execute("SELECT * FROM sessions WHERE token_hash=? AND expires_at>?", (digest, now())).fetchone()
    if not session or (admin and session["role"] != "admin"):
        return None
    return session


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Default HTTP logging includes URL paths containing order access tokens.
        pass

    def respond(self, status, obj, headers=None):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > 1_000_000:
            raise ValueError("Data terlalu besar")
        raw = self.rfile.read(length)
        return raw, json.loads(raw or b"{}")

    def do_GET(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")

    def do_PATCH(self):
        self.route("PATCH")

    def do_DELETE(self):
        self.route("DELETE")

    def route(self, method):
        path = urlparse(self.path).path
        if not path.startswith("/api/"):
            return self.static(path)
        try:
            with LOCK, db() as con:
                result = self.api(con, method, path)
                if result is not None:
                    status, data, *more = result
                    con.commit()
                    return self.respond(status, data, more[0] if more else None)
        except (ValueError, json.JSONDecodeError) as exc:
            return self.respond(400, {"code": "invalid_input", "message": str(exc)})
        except urllib.error.URLError:
            return self.respond(503, {"code": "provider_unavailable", "message": "Penyedia pembayaran belum dapat dihubungi. Coba lagi atau hubungi staf."})
        except Exception as exc:
            print("Server error:", type(exc).__name__, str(exc))
            return self.respond(500, {"code": "server_error", "message": "Terjadi kendala. Silakan coba lagi."})

    def static(self, path):
        assets = {
            "/": "index.html",
            "/styles.css": "styles.css",
            "/app.js": "app.js",
            "/core.js": "core.js",
            "/views.js": "views.js",
        }
        filename = assets.get(path, "index.html")
        p = ROOT / "public" / filename
        if not p.is_file():
            self.send_error(404)
            return
        body = p.read_bytes()
        mime = "text/javascript" if filename.endswith(".js") else {
            "index.html": "text/html", "styles.css": "text/css"
        }[filename]
        self.send_response(200)
        self.send_header("Content-Type", mime + "; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def api(self, con, method, path):
        segments = path.strip("/").split("/")
        query = parse_qs(urlparse(self.path).query)
        if method == "GET" and path == "/api/config":
            open_flag = con.execute("SELECT value FROM settings WHERE key='orders_open'").fetchone()[0] == "1"
            return 200, {"demo": not REAL, "qris_enabled": REAL and bool(PROVIDER_KEY), "outlet": "AlgoKopi", "orders_open": open_flag}
        if method == "GET" and path == "/api/menu":
            return 200, public_menu(con)
        if method == "GET" and path == "/api/tables":
            return 200, [dict(t) for t in con.execute("SELECT * FROM tables WHERE active=1 ORDER BY id")]
        if method == "POST" and path == "/api/orders":
            _, body = self.body()
            key = self.headers.get("Idempotency-Key", "")
            if len(key) < 16 or len(key) > 128:
                return fail("invalid_idempotency_key", "Kunci permintaan tidak valid.")
            previous = con.execute("SELECT * FROM orders WHERE idempotency_key=?", (key,)).fetchone()
            if previous:
                return 200, safe_order(con, previous, token_for_key(con, key))
            if con.execute("SELECT value FROM settings WHERE key='orders_open'").fetchone()[0] != "1":
                return fail("outlet_closed", "Outlet sedang tidak menerima pesanan. Menu tetap dapat dilihat.", 409)
            if not rate_allowed(("order", self.client_address[0]), 30, 60):
                return fail("rate_limited", "Terlalu banyak permintaan. Tunggu sebentar.", 429)
            table = con.execute("SELECT * FROM tables WHERE id=? AND active=1", (body.get("table_id"),)).fetchone()
            if not table:
                return fail("invalid_table", "Pilih meja yang aktif.")
            raw_items = body.get("items")
            if not isinstance(raw_items, list) or not raw_items:
                return fail("empty_cart", "Keranjang masih kosong.")
            if body.get("method") not in ("cashier", "qris"):
                return fail("invalid_method", "Pilih metode pembayaran.")
            if body["method"] == "qris" and not (REAL and PROVIDER_KEY):
                return fail("qris_unavailable", "QRIS belum tersedia. Pilih bayar di kasir.")
            items, subtotal = [], 0
            for item in raw_items:
                p = con.execute("SELECT * FROM products WHERE id=? AND archived=0", (item.get("product_id"),)).fetchone()
                if not p or not p["available"]:
                    return fail("product_unavailable", "Ada menu yang sudah habis. Periksa keranjang.")
                qty = item.get("quantity")
                if not isinstance(qty, int) or not 1 <= qty <= 20:
                    return fail("invalid_quantity", "Jumlah per menu harus 1 sampai 20.")
                note = str(item.get("notes", "")).strip()
                if len(note) > 300:
                    return fail("invalid_note", "Catatan maksimal 300 karakter.")
                groups = json.loads(p["options"])
                selected = item.get("option_ids", [])
                if not isinstance(selected, list):
                    return fail("invalid_options", "Pilihan menu tidak valid.")
                option_snapshots = []
                for group in groups:
                    matches = [c for c in group["choices"] if c["id"] in selected]
                    if group.get("required") and len(matches) != 1:
                        return fail("required_option", f"Pilih {group['name']} untuk {p['name']}.")
                    if len(matches) > 1:
                        return fail("invalid_options", "Terlalu banyak pilihan dalam satu kelompok.")
                    for choice in matches:
                        option_snapshots.append({"group": group["name"], "label": choice["label"], "delta": choice["delta"]})
                valid_ids = {c["id"] for g in groups for c in g["choices"]}
                if any(v not in valid_ids for v in selected):
                    return fail("invalid_options", "Pilihan menu tidak valid.")
                unit = p["price"] + sum(o["delta"] for o in option_snapshots)
                subtotal += unit * qty
                items.append({"product_id": p["id"], "name": p["name"], "base_price": p["price"],
                              "unit_price": unit, "quantity": qty, "notes": note, "options": option_snapshots})
            if body["method"] == "qris" and not 1 <= subtotal <= 10_000_000:
                return fail("qris_amount", "Total QRIS harus Rp1 sampai Rp10.000.000.")
            if body.get("expected_total") != subtotal:
                return 409, {"code": "price_changed", "message": "Harga berubah. Periksa total terbaru sebelum membuat pesanan.", "total": subtotal}
            token = token_for_key(con, key)
            number = "AK-" + datetime.now().strftime("%y%m%d") + "-" + secrets.token_hex(3).upper()
            stamp = now()
            con.execute("""INSERT INTO orders(number,token_hash,idempotency_key,table_id,table_label,items,subtotal,total,
                method,payment_status,is_demo,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (number, hashlib.sha256(token.encode()).hexdigest(), key, table["id"],
                 f"{table['area']} · {table['label']}", json.dumps(items), subtotal, subtotal,
                 body["method"], "unpaid" if body["method"] == "cashier" else "pending", int(not REAL), stamp, stamp))
            order = con.execute("SELECT * FROM orders WHERE number=?", (number,)).fetchone()
            audit(con, order["id"], "status", None, "pending", "customer")
            return 201, safe_order(con, order, token)
        if len(segments) >= 3 and segments[1] == "orders":
            token = segments[2]
            order = get_order(con, token)
            if not order:
                return fail("not_found", "Pesanan tidak ditemukan.", 404)
            if len(segments) == 3 and method == "GET":
                return 200, safe_order(con, order)
            if len(segments) == 4 and segments[3] == "payment-status" and method == "GET":
                try:
                    if order["method"] == "qris" and (not order["last_check_at"] or
                        (datetime.now(timezone.utc) - datetime.fromisoformat(order["last_check_at"])).total_seconds() >= 15):
                        con.execute("UPDATE orders SET last_check_at=? WHERE id=?", (now(), order["id"]))
                        reconcile(con, order)
                except urllib.error.URLError:
                    pass
                return 200, safe_order(con, con.execute("SELECT * FROM orders WHERE id=?", (order["id"],)).fetchone())
            if len(segments) == 4 and segments[3] == "payments" and method == "POST":
                if order["method"] != "qris" or order["payment_status"] in ("paid", "refund_due"):
                    return fail("invalid_state", "QRIS tidak dapat dibuat untuk pesanan ini.", 409)
                if order["provider_transaction_id"] and order["payment_status"] == "pending":
                    return 200, safe_order(con, order)
                if order["payment_status"] == "creating_unknown":
                    return fail("payment_uncertain", "Pembuatan QR sebelumnya belum pasti. Hubungi staf.", 409)
                if not REAL or not PROVIDER_KEY:
                    return fail("qris_unavailable", "QRIS belum tersedia.")
                con.execute("UPDATE orders SET payment_status='creating_unknown' WHERE id=?", (order["id"],))
                con.commit()
                try:
                    response = provider_data(provider_call("/qris/generate", {"amount": order["total"]}))
                except Exception:
                    return fail("payment_uncertain", "Status pembuatan QR belum pasti. Hubungi staf.", 503)
                if int(response.get("amount", -1)) != order["total"] or not response.get("transaction_id") or not response.get("order_id"):
                    return fail("provider_response", "Respons pembayaran perlu ditinjau staf.", 503)
                con.execute("""INSERT INTO payment_attempts(order_id,transaction_id,provider_order_id,amount,status,created_at)
                    VALUES(?,?,?,?,?,?)""", (order["id"], response["transaction_id"], response["order_id"],
                    order["total"], "pending", now()))
                con.execute("""UPDATE orders SET payment_status='pending',provider_transaction_id=?,provider_order_id=?,
                    qr_url=?,checkout_url=?,expires_at=?,updated_at=? WHERE id=?""",
                    (response["transaction_id"], response["order_id"], provider_url(response.get("qr_url")),
                     provider_url(response.get("checkout_url")), response.get("expiry_time"), now(), order["id"]))
                return 200, safe_order(con, con.execute("SELECT * FROM orders WHERE id=?", (order["id"],)).fetchone())
            if len(segments) == 4 and segments[3] == "payment-method" and method == "POST":
                _, body = self.body()
                if body.get("method") != "cashier" or order["method"] != "qris":
                    return fail("invalid_method", "Pergantian metode tidak diizinkan.", 409)
                if order["payment_status"] in ("paid", "refund_due", "refunded_manual"):
                    return fail("already_paid", "Pesanan sudah dibayar melalui QRIS.", 409)
                if order["payment_status"] == "creating_unknown":
                    return fail("payment_uncertain", "Status QRIS belum pasti. Hubungi staf.", 409)
                if order["provider_transaction_id"]:
                    if not PROVIDER_KEY:
                        return fail("provider_unavailable", "Status QRIS belum bisa diverifikasi.", 503)
                    reconcile(con, order)
                    order = con.execute("SELECT * FROM orders WHERE id=?", (order["id"],)).fetchone()
                    if order["payment_status"] == "paid":
                        return fail("already_paid", "Pesanan sudah dibayar melalui QRIS.", 409)
                    if order["payment_status"] == "pending":
                        result = provider_data(provider_call("/qris/cancel", {"transaction_id": order["provider_transaction_id"]}))
                        # A cancellation request is not proof that payment did not settle concurrently.
                        reconcile(con, order)
                        order = con.execute("SELECT * FROM orders WHERE id=?", (order["id"],)).fetchone()
                        if order["payment_status"] not in ("cancelled", "expired"):
                            return fail("payment_uncertain", "Pembatalan QRIS belum terkonfirmasi. Hubungi staf.", 409)
                con.execute("UPDATE orders SET method='cashier',payment_status='unpaid',updated_at=? WHERE id=?", (now(), order["id"]))
                audit(con, order["id"], "method", "qris", "cashier", "customer")
                return 200, safe_order(con, con.execute("SELECT * FROM orders WHERE id=?", (order["id"],)).fetchone())
        if method == "POST" and path == "/api/webhooks/autogopay":
            raw, _ = self.body_raw_webhook()
            signature = self.headers.get("X-Signature", "")
            expected = hmac.new(PROVIDER_KEY.encode(), raw, hashlib.sha256).hexdigest()
            if not PROVIDER_KEY or not hmac.compare_digest(signature, expected):
                return fail("bad_signature", "Signature tidak valid.", 401)
            event = json.loads(raw)
            fingerprint = hashlib.sha256(raw).hexdigest()
            if con.execute("SELECT 1 FROM payment_events WHERE fingerprint=?", (fingerprint,)).fetchone():
                return 200, {"ok": True}
            transaction = event.get("transaction_id")
            attempt = con.execute("SELECT * FROM payment_attempts WHERE transaction_id=?", (transaction,)).fetchone()
            order = con.execute("SELECT * FROM orders WHERE id=?", (attempt["order_id"],)).fetchone() if attempt else None
            valid = bool(order and event.get("order_id") == attempt["provider_order_id"] and
                         event.get("amount") == attempt["amount"] and event.get("status") == "PAID" and
                         event.get("payment_method") == "QRIS")
            result = "paid" if valid else "review"
            if valid and attempt["allocated"]:
                result = "duplicate"
            elif valid and order["payment_status"] in ("paid", "refund_due", "refunded_manual"):
                result = "excess"
            con.execute("INSERT INTO payment_events(fingerprint,provider_transaction_id,result,received_at) VALUES(?,?,?,?)",
                        (fingerprint, transaction, result, now()))
            if result == "paid":
                mark_paid(con, order, "autogopay:webhook", transaction)
            elif result == "excess":
                con.execute("INSERT OR IGNORE INTO extra_receipts(order_id,transaction_id,amount,received_at) VALUES(?,?,?,?)",
                            (order["id"], transaction, attempt["amount"], now()))
                con.execute("UPDATE payment_attempts SET status='paid' WHERE transaction_id=?", (transaction,))
                audit(con, order["id"], "payment_review", None, "excess", "autogopay:webhook")
            return 200, {"ok": True}
        if method == "POST" and path == "/api/admin/login":
            _, body = self.body()
            if not rate_allowed(("login", self.client_address[0]), 10, 300):
                return fail("rate_limited", "Terlalu banyak percobaan masuk. Coba lagi nanti.", 429)
            supplied_user = str(body.get("username", ""))
            supplied_password = str(body.get("password", ""))
            accounts = [
                (os.environ.get("ALGOKOPI_ADMIN_USER", ""), os.environ.get("ALGOKOPI_ADMIN_PASSWORD", ""), "admin"),
                (os.environ.get("ALGOKOPI_STAFF_USER", ""), os.environ.get("ALGOKOPI_STAFF_PASSWORD", ""), "staff"),
            ]
            match = next(((user, role) for user, password, role in accounts
                          if user and password and hmac.compare_digest(supplied_user, user) and
                          hmac.compare_digest(supplied_password, password)), None)
            if not match:
                return fail("invalid_credentials", "Akun atau kata sandi salah.", 401)
            user, role = match
            token = secrets.token_urlsafe(32)
            expiry = datetime.fromtimestamp(datetime.now(timezone.utc).timestamp() + 8 * 3600, timezone.utc).isoformat()
            con.execute("INSERT INTO sessions VALUES(?,?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), user, role, expiry))
            secure = "; Secure" if self.headers.get("X-Forwarded-Proto") == "https" else ""
            return 200, {"username": user, "role": role}, {"Set-Cookie": f"algokopi_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800{secure}"}
        if path.startswith("/api/admin/"):
            session = authenticated(con, self)
            if not session:
                return fail("unauthorized", "Masuk sebagai staf terlebih dahulu.", 401)
            actor = session["username"]
            restricted = path in ("/api/admin/sales", "/api/admin/audit", "/api/admin/payment-review", "/api/admin/products", "/api/admin/tables", "/api/admin/settings")
            restricted = restricted or (len(segments) >= 4 and segments[2] in ("products", "tables"))
            restricted = restricted or (len(segments) >= 4 and segments[2] == "extra-receipts")
            restricted = restricted or (len(segments) == 5 and segments[2] == "orders" and segments[4] == "refunds")
            if restricted and session["role"] != "admin":
                return fail("forbidden", "Hanya admin yang dapat melakukan tindakan ini.", 403)
            if method == "GET" and path == "/api/admin/me":
                return 200, {"username": actor, "role": session["role"]}
            if method == "GET" and path == "/api/admin/settings":
                return 200, {"orders_open": con.execute("SELECT value FROM settings WHERE key='orders_open'").fetchone()[0] == "1",
                             "real_orders": REAL, "qris_enabled": REAL and bool(PROVIDER_KEY)}
            if method == "PATCH" and path == "/api/admin/settings":
                _, body = self.body()
                if not isinstance(body.get("orders_open"), bool):
                    return fail("invalid_settings", "Status penerimaan pesanan tidak valid.")
                con.execute("UPDATE settings SET value=? WHERE key='orders_open'", ("1" if body["orders_open"] else "0",))
                return 200, {"orders_open": body["orders_open"]}
            if method == "POST" and path == "/api/admin/logout":
                cookie = SimpleCookie()
                cookie.load(self.headers.get("Cookie", ""))
                if cookie.get("algokopi_session"):
                    con.execute("DELETE FROM sessions WHERE token_hash=?",
                        (hashlib.sha256(cookie["algokopi_session"].value.encode()).hexdigest(),))
                return 200, {"ok": True}, {"Set-Cookie": "algokopi_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"}
            if method == "GET" and path == "/api/admin/orders":
                rows = con.execute("SELECT * FROM orders ORDER BY created_at ASC").fetchall()
                mode = query.get("mode", ["all"])[0]
                status = query.get("status", ["all"])[0]
                result = [safe_order(con, o) for o in rows if
                          (mode == "all" or bool(o["is_demo"]) == (mode == "demo")) and
                          (status == "all" or o["status"] == status)]
                return 200, result
            if method == "GET" and path == "/api/admin/sales":
                orders = con.execute("SELECT * FROM orders WHERE is_demo=0").fetchall()
                period = query.get("period", ["today"])[0]
                jakarta = ZoneInfo("Asia/Jakarta")
                today = datetime.now(jakarta).date()
                def in_period(stamp):
                    if not stamp:
                        return False
                    day = datetime.fromisoformat(stamp).astimezone(jakarta).date()
                    if period == "all":
                        return True
                    if period == "7days":
                        return 0 <= (today - day).days < 7
                    if period == "month":
                        return day.year == today.year and day.month == today.month
                    if period == "custom":
                        start = query.get("from", [""])[0]
                        end = query.get("to", [""])[0]
                        return bool(start and end and start <= day.isoformat() <= end)
                    return day == today
                paid = [o for o in orders if in_period(o["paid_at"])]
                gross = sum(o["total"] for o in paid)
                refunds = sum(int(a["to_value"]) for a in con.execute(
                    "SELECT a.* FROM audit a JOIN orders o ON o.id=a.order_id WHERE a.kind='refund' AND o.is_demo=0")
                    if in_period(a["created_at"]))
                open_bills = sum(o["total"] for o in orders if o["payment_status"] == "unpaid" and o["status"] != "cancelled")
                quantities = Counter()
                for order in paid:
                    for item in json.loads(order["items"]):
                        quantities[item["name"]] += item["quantity"]
                return 200, {"gross": gross, "refunds": refunds, "net": gross - refunds,
                             "paid_orders": len(paid), "average": round(gross / len(paid)) if paid else 0,
                             "open_bills": open_bills, "refund_due": sum(o["refund_due"] - o["refund_recorded"] for o in orders),
                             "demo_orders": con.execute("SELECT COUNT(*) FROM orders WHERE is_demo=1").fetchone()[0],
                             "qris_gross": sum(o["total"] for o in paid if o["method"] == "qris"),
                             "cashier_gross": sum(o["total"] for o in paid if o["method"] == "cashier"),
                             "best_sellers": [{"name": name, "quantity": qty} for name, qty in quantities.most_common(5)],
                             "review_events": con.execute("SELECT COUNT(*) FROM payment_events WHERE result='review'").fetchone()[0],
                             "extra_receipts": con.execute("""SELECT COALESCE(SUM(e.amount),0) FROM extra_receipts e
                                 JOIN orders o ON o.id=e.order_id WHERE e.review_status='open' AND o.is_demo=0""").fetchone()[0],
                             "period": period}
            if method == "GET" and path == "/api/admin/audit":
                return 200, [dict(r) for r in con.execute("SELECT * FROM audit ORDER BY id DESC LIMIT 100")]
            if method == "GET" and path == "/api/admin/payment-review":
                events = [dict(r) for r in con.execute(
                    "SELECT * FROM payment_events WHERE result='review' ORDER BY id DESC LIMIT 100")]
                extras = [dict(r) for r in con.execute("""SELECT e.*,o.number,o.is_demo FROM extra_receipts e
                    JOIN orders o ON o.id=e.order_id ORDER BY e.id DESC LIMIT 100""")]
                return 200, {"events": events, "extra_receipts": extras}
            if len(segments) == 5 and segments[2] == "extra-receipts" and segments[4] == "refund" and method == "POST":
                _, body = self.body()
                receipt = con.execute("SELECT * FROM extra_receipts WHERE id=?", (segments[3],)).fetchone()
                if not receipt:
                    return fail("not_found", "Penerimaan tambahan tidak ditemukan.", 404)
                if receipt["review_status"] == "refunded_manual":
                    return 200, {"ok": True}
                reference = str(body.get("reference", "")).strip()
                if not reference:
                    return fail("reference_required", "Referensi pengembalian wajib diisi.")
                con.execute("UPDATE extra_receipts SET review_status='refunded_manual' WHERE id=?", (receipt["id"],))
                audit(con, receipt["order_id"], "extra_refund", str(receipt["amount"]), "refunded_manual", actor, reference)
                return 200, {"ok": True}
            if method == "GET" and path == "/api/admin/products":
                return 200, public_menu(con)
            if method == "POST" and path == "/api/admin/products":
                _, body = self.body()
                name = str(body.get("name", "")).strip()
                category = body.get("category")
                price = body.get("price")
                if not name or len(name) > 100 or category not in NAMES or not isinstance(price, int) or price < 0:
                    return fail("invalid_product", "Nama, kategori, atau harga produk tidak valid.")
                slug = "-".join(name.lower().split())
                if con.execute("SELECT 1 FROM products WHERE slug=?", (slug,)).fetchone():
                    return fail("duplicate_product", "Nama menu sudah dipakai.", 409)
                options = body.get("options", [])
                if not isinstance(options, list):
                    return fail("invalid_options", "Pilihan varian tidak valid.")
                sort_order = con.execute("SELECT COALESCE(MAX(sort_order),0)+1 FROM products").fetchone()[0]
                cursor = con.execute("""INSERT INTO products(category,name,slug,description,price,sort_order,options)
                    VALUES(?,?,?,?,?,?,?)""", (category, name, slug, str(body.get("description", "")).strip()[:300],
                    price, sort_order, json.dumps(options)))
                return 201, {"id": cursor.lastrowid}
            if method == "GET" and path == "/api/admin/tables":
                return 200, [dict(r) for r in con.execute("SELECT * FROM tables ORDER BY id")]
            if method == "POST" and path == "/api/admin/tables":
                _, body = self.body()
                label = str(body.get("label", "")).strip()
                area = str(body.get("area", "")).strip()
                if not label or not area or len(label) > 80 or len(area) > 80:
                    return fail("invalid_table", "Label dan area meja wajib diisi.")
                try:
                    cursor = con.execute("INSERT INTO tables(label,area) VALUES(?,?)", (label, area))
                except sqlite3.IntegrityError:
                    return fail("duplicate_table", "Label meja sudah dipakai.", 409)
                return 201, {"id": cursor.lastrowid}
            if len(segments) >= 4 and segments[2] == "orders":
                oid = segments[3]
                order = con.execute("SELECT * FROM orders WHERE id=?", (oid,)).fetchone()
                if not order:
                    return fail("not_found", "Pesanan tidak ditemukan.", 404)
                if len(segments) == 5 and segments[4] == "status" and method == "PATCH":
                    _, body = self.body()
                    target = body.get("status")
                    if body.get("version") != order["version"]:
                        return fail("version_conflict", "Pesanan telah berubah. Muat ulang data.", 409)
                    allowed = STATUS.get(order["status"])
                    if target != allowed and not (target == "cancelled" and order["status"] in STATUS):
                        return fail("invalid_transition", "Perubahan tahap tidak diizinkan.", 409)
                    if target == "processing" and order["method"] == "qris" and order["payment_status"] != "paid":
                        return fail("payment_pending", "Tunggu pelunasan QRIS sebelum memproses.", 409)
                    reason = str(body.get("reason", "")).strip() if target == "cancelled" else None
                    if target == "cancelled" and not reason:
                        return fail("reason_required", "Alasan pembatalan wajib diisi.")
                    refund_due = order["total"] if target == "cancelled" and order["payment_status"] == "paid" else order["refund_due"]
                    con.execute("UPDATE orders SET status=?,version=version+1,updated_at=?,cancel_reason=?,refund_due=? WHERE id=?",
                                (target, now(), reason, refund_due, oid))
                    audit(con, oid, "status", order["status"], target, actor, reason)
                    return 200, safe_order(con, con.execute("SELECT * FROM orders WHERE id=?", (oid,)).fetchone())
                if len(segments) == 5 and segments[4] == "cashier-payment" and method == "POST":
                    if order["method"] != "cashier":
                        return fail("invalid_method", "Pesanan ini bukan bayar di kasir.", 409)
                    if order["payment_status"] == "paid":
                        return 200, safe_order(con, order)
                    if order["status"] == "cancelled":
                        return fail("cancelled", "Pesanan telah dibatalkan.", 409)
                    mark_paid(con, order, actor)
                    return 200, safe_order(con, con.execute("SELECT * FROM orders WHERE id=?", (oid,)).fetchone())
                if len(segments) == 5 and segments[4] == "refunds" and method == "POST":
                    _, body = self.body()
                    amount = body.get("amount")
                    if not isinstance(amount, int) or amount <= 0 or amount > order["refund_due"] - order["refund_recorded"]:
                        return fail("invalid_refund", "Nominal pengembalian tidak valid.")
                    if not str(body.get("reference", "")).strip():
                        return fail("reference_required", "Catat referensi pengembalian manual.")
                    con.execute("UPDATE orders SET refund_recorded=refund_recorded+?,payment_status=?,updated_at=? WHERE id=?",
                        (amount, "refunded_manual" if amount == order["refund_due"] - order["refund_recorded"] else "refund_due", now(), oid))
                    audit(con, oid, "refund", None, str(amount), actor, str(body["reference"]))
                    return 200, safe_order(con, con.execute("SELECT * FROM orders WHERE id=?", (oid,)).fetchone())
            if len(segments) == 4 and segments[2] == "products" and method == "PATCH":
                _, body = self.body()
                p = con.execute("SELECT * FROM products WHERE id=?", (segments[3],)).fetchone()
                if not p:
                    return fail("not_found", "Produk tidak ditemukan.", 404)
                fields = {}
                for field in ("name", "description", "category"):
                    if field in body and isinstance(body[field], str) and body[field].strip():
                        fields[field] = body[field].strip()[:300]
                for field in ("price", "available", "archived"):
                    if field in body and isinstance(body[field], int) and body[field] >= 0:
                        fields[field] = body[field]
                if "options" in body and isinstance(body["options"], list):
                    fields["options"] = json.dumps(body["options"])
                if not fields:
                    return fail("invalid_input", "Tidak ada perubahan valid.")
                con.execute("UPDATE products SET " + ",".join(f"{k}=?" for k in fields) + " WHERE id=?",
                            (*fields.values(), p["id"]))
                return 200, {"ok": True}
            if len(segments) == 4 and segments[2] == "tables" and method == "PATCH":
                _, body = self.body()
                table = con.execute("SELECT * FROM tables WHERE id=?", (segments[3],)).fetchone()
                if not table:
                    return fail("not_found", "Meja tidak ditemukan.", 404)
                fields = {}
                for field in ("label", "area"):
                    if field in body and isinstance(body[field], str) and body[field].strip():
                        fields[field] = body[field].strip()[:80]
                if "active" in body and body["active"] in (0, 1, False, True):
                    fields["active"] = int(body["active"])
                if not fields:
                    return fail("invalid_input", "Tidak ada perubahan valid.")
                con.execute("UPDATE tables SET " + ",".join(f"{k}=?" for k in fields) + " WHERE id=?",
                            (*fields.values(), table["id"]))
                return 200, {"ok": True}
        return fail("not_found", "Halaman tidak ditemukan.", 404)

    def body_raw_webhook(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > 1_000_000:
            raise ValueError("Data terlalu besar")
        return self.rfile.read(length), None


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "127.0.0.1")
    print(f"AlgoKopi berjalan di http://{host}:{port}")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
