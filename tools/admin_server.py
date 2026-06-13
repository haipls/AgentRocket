import json
import os
import sqlite3
from datetime import datetime, timezone, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parent
DEFAULT_DB = Path(r"D:\Temp\Download\TheAllInPlan-Challenge21Days\Day5\Database\brain.db")
DB_PATH = Path(os.environ.get("BRAIN_DB_PATH", DEFAULT_DB))
PORT = int(os.environ.get("ADMIN_PORT", "8000"))
GMT7 = timezone(timedelta(hours=7))


def now_iso():
    return datetime.now(GMT7).isoformat(timespec="seconds")


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("pragma foreign_keys = on")
    return conn


def rows_to_dicts(rows):
    return [dict(row) for row in rows]


def parse_json_body(handler):
    length = int(handler.headers.get("Content-Length", "0"))
    if length == 0:
        return {}
    body = handler.rfile.read(length).decode("utf-8")
    return json.loads(body)


def parse_money(value):
    if value in ("", None):
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = "".join(ch for ch in str(value) if ch.isdigit())
    return float(cleaned or 0)


def normalize_datetime_gmt7(value):
    if value in ("", None):
        return now_iso()

    text = str(value).strip()
    for pattern in ("%d/%m/%Y %H:%M", "%d/%m/%Y"):
        try:
            parsed = datetime.strptime(text, pattern)
            return parsed.replace(tzinfo=GMT7).isoformat(timespec="seconds")
        except ValueError:
            pass

    try:
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=GMT7)
        else:
            parsed = parsed.astimezone(GMT7)
        return parsed.isoformat(timespec="seconds")
    except ValueError:
        return text


def get_id_from_path(path, prefix):
    raw = path[len(prefix):].strip("/")
    if not raw:
        return None
    return int(raw)


class AdminHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        parsed = urlparse(path)
        if parsed.path == "/admin" or parsed.path == "/admin/":
            return str(ROOT / "admin" / "index.html")
        return super().translate_path(path)

    def send_json(self, data, status=200):
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def send_error_json(self, message, status=400):
        self.send_json({"ok": False, "error": message}, status)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        try:
            if path == "/api/products":
                return self.list_products()
            if path == "/api/customers":
                return self.list_customers()
            if path == "/api/orders":
                return self.list_orders()
            return super().do_GET()
        except Exception as exc:
            return self.send_error_json(str(exc), 500)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        try:
            if path == "/api/products":
                return self.create_product()
            if path == "/api/customers":
                return self.create_customer()
            if path == "/api/orders":
                return self.create_order()
            return self.send_error_json("Không tìm thấy API.", 404)
        except Exception as exc:
            return self.send_error_json(str(exc), 500)

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path

        try:
            if path.startswith("/api/products/"):
                return self.update_product(get_id_from_path(path, "/api/products/"))
            if path.startswith("/api/customers/"):
                return self.update_customer(get_id_from_path(path, "/api/customers/"))
            if path.startswith("/api/orders/"):
                return self.update_order(get_id_from_path(path, "/api/orders/"))
            return self.send_error_json("Không tìm thấy API.", 404)
        except Exception as exc:
            return self.send_error_json(str(exc), 500)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path

        try:
            if path.startswith("/api/products/"):
                return self.delete_row("products", get_id_from_path(path, "/api/products/"))
            if path.startswith("/api/customers/"):
                return self.delete_row("customers", get_id_from_path(path, "/api/customers/"))
            if path.startswith("/api/orders/"):
                return self.delete_row("orders", get_id_from_path(path, "/api/orders/"))
            return self.send_error_json("Không tìm thấy API.", 404)
        except Exception as exc:
            return self.send_error_json(str(exc), 500)

    def list_products(self):
        with db() as conn:
            rows = conn.execute("select * from products order by id desc").fetchall()
        self.send_json({"ok": True, "data": rows_to_dicts(rows)})

    def list_customers(self):
        with db() as conn:
            rows = conn.execute("select * from customers order by id desc").fetchall()
        self.send_json({"ok": True, "data": rows_to_dicts(rows)})

    def list_orders(self):
        query = """
            select
                o.*,
                c.name as customer_name,
                p.name as product_name,
                p.product_type as product_type
            from orders o
            left join customers c on c.id = o.customer_id
            left join products p on p.id = o.product_id
            order by o.id desc
        """
        with db() as conn:
            rows = conn.execute(query).fetchall()
        self.send_json({"ok": True, "data": rows_to_dicts(rows)})

    def create_product(self):
        data = parse_json_body(self)
        name = (data.get("name") or "").strip()
        product_type = (data.get("product_type") or "").strip()
        price = parse_money(data.get("price"))
        description = (data.get("description") or "").strip()
        stock_remaining = data.get("stock_remaining")
        stock_remaining = int(stock_remaining) if stock_remaining not in ("", None) else None

        if not name:
            return self.send_error_json("Tên sản phẩm là bắt buộc.")
        if product_type not in ("physical", "digital", "service"):
            return self.send_error_json("Loại sản phẩm không hợp lệ.")

        with db() as conn:
            cur = conn.execute(
                """
                insert into products (name, product_type, price, description, stock_remaining)
                values (?, ?, ?, ?, ?)
                """,
                (name, product_type, price, description, stock_remaining),
            )
            conn.commit()
        self.send_json({"ok": True, "id": cur.lastrowid})

    def update_product(self, product_id):
        data = parse_json_body(self)
        with db() as conn:
            conn.execute(
                """
                update products
                set name = ?, product_type = ?, price = ?, description = ?, stock_remaining = ?
                where id = ?
                """,
                (
                    (data.get("name") or "").strip(),
                    (data.get("product_type") or "").strip(),
                    parse_money(data.get("price")),
                    (data.get("description") or "").strip(),
                    int(data["stock_remaining"]) if data.get("stock_remaining") not in ("", None) else None,
                    product_id,
                ),
            )
            conn.commit()
        self.send_json({"ok": True})

    def create_customer(self):
        data = parse_json_body(self)
        name = (data.get("name") or "").strip()
        phone = (data.get("phone") or "").strip()
        zalo = (data.get("zalo") or "").strip()
        registered_at = normalize_datetime_gmt7(data.get("registered_at"))

        if not name:
            return self.send_error_json("Tên khách hàng là bắt buộc.")

        with db() as conn:
            cur = conn.execute(
                """
                insert into customers (name, phone, zalo, registered_at)
                values (?, ?, ?, ?)
                """,
                (name, phone, zalo, registered_at),
            )
            conn.commit()
        self.send_json({"ok": True, "id": cur.lastrowid})

    def update_customer(self, customer_id):
        data = parse_json_body(self)
        with db() as conn:
            conn.execute(
                """
                update customers
                set name = ?, phone = ?, zalo = ?, registered_at = ?
                where id = ?
                """,
                (
                    (data.get("name") or "").strip(),
                    (data.get("phone") or "").strip(),
                    (data.get("zalo") or "").strip(),
                    normalize_datetime_gmt7(data.get("registered_at")),
                    customer_id,
                ),
            )
            conn.commit()
        self.send_json({"ok": True})

    def create_order(self):
        data = parse_json_body(self)
        customer_id = int(data.get("customer_id") or 0)
        product_id = int(data.get("product_id") or 0)
        amount = parse_money(data.get("amount"))
        order_status = (data.get("order_status") or "new").strip()
        purchased_at = normalize_datetime_gmt7(data.get("purchased_at"))

        if customer_id <= 0 or product_id <= 0:
            return self.send_error_json("Khách hàng và sản phẩm là bắt buộc.")

        with db() as conn:
            product = conn.execute(
                "select id, product_type, stock_remaining from products where id = ?",
                (product_id,),
            ).fetchone()
            if not product:
                return self.send_error_json("Không tìm thấy sản phẩm.")

            product_type = product["product_type"]
            stock = product["stock_remaining"]
            if product_type == "physical":
                if stock is not None and stock <= 0:
                    return self.send_error_json("Sản phẩm vật lý đã hết tồn kho.")
                conn.execute(
                    """
                    update products
                    set stock_remaining = case
                        when stock_remaining is null then null
                        else stock_remaining - 1
                    end
                    where id = ?
                    """,
                    (product_id,),
                )

            cur = conn.execute(
                """
                insert into orders (customer_id, product_id, amount, order_status, purchased_at)
                values (?, ?, ?, ?, ?)
                """,
                (customer_id, product_id, amount, order_status, purchased_at),
            )
            conn.commit()
        self.send_json({"ok": True, "id": cur.lastrowid})

    def update_order(self, order_id):
        data = parse_json_body(self)
        with db() as conn:
            conn.execute(
                """
                update orders
                set customer_id = ?, product_id = ?, amount = ?, order_status = ?, purchased_at = ?
                where id = ?
                """,
                (
                    int(data.get("customer_id") or 0),
                    int(data.get("product_id") or 0),
                    parse_money(data.get("amount")),
                    (data.get("order_status") or "new").strip(),
                    normalize_datetime_gmt7(data.get("purchased_at")),
                    order_id,
                ),
            )
            conn.commit()
        self.send_json({"ok": True})

    def delete_row(self, table, row_id):
        with db() as conn:
            conn.execute(f"delete from {table} where id = ?", (row_id,))
            conn.commit()
        self.send_json({"ok": True})


def main():
    if not DB_PATH.exists():
        raise SystemExit(f"Không tìm thấy brain.db: {DB_PATH}")
    os.chdir(ROOT)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), AdminHandler)
    print(f"Admin panel: http://127.0.0.1:{PORT}/admin")
    print(f"Database: {DB_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    main()
