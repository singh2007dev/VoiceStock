"""
Tests for /voice/command – 'add' action with auto-creation.
Runs against an isolated temporary SQLite database; restored afterwards.
"""

import sys
import os
import sqlite3
import tempfile
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import backend.database as db_module
from backend.main import app

client = TestClient(app)

_tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp_db.close()
TMP_DB_PATH = _tmp_db.name


@pytest.fixture(scope="module", autouse=True)
def isolated_test_db():
    """Switch DB_PATH to isolated temp DB during this test module, then restore."""
    original_path = db_module.DB_PATH
    db_module.DB_PATH = TMP_DB_PATH
    db_module.init_db()
    yield
    db_module.DB_PATH = original_path
    if os.path.exists(TMP_DB_PATH):
        try:
            os.remove(TMP_DB_PATH)
        except OSError:
            pass


@pytest.fixture(autouse=True)
def clean_db():
    """Wipe products table before each test in this module."""
    conn = sqlite3.connect(TMP_DB_PATH)
    conn.execute("DELETE FROM products")
    conn.commit()
    conn.close()
    yield


# ------------------------------------------------------------------ helpers --
def add_product(name, quantity, unit="packets", minimum_stock=5):
    conn = sqlite3.connect(TMP_DB_PATH)
    conn.execute(
        "INSERT INTO products (name, quantity, unit, minimum_stock) VALUES (?,?,?,?)",
        (name, quantity, unit, minimum_stock),
    )
    conn.commit()
    conn.close()


def get_product(name):
    conn = sqlite3.connect(TMP_DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT * FROM products WHERE lower(name)=lower(?)", (name,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


# ------------------------------------------------------------------ tests --
def test_add_creates_new_product():
    """Add 15 packets of Coffee when Coffee does not exist → should create it."""
    resp = client.post("/voice/command", json={"transcript": "Add 15 packets of Coffee"})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["success"] is True
    assert "created" in data["message"].lower() or "coffee" in data["message"].lower()

    product = get_product("Coffee")
    assert product is not None, "Coffee should have been created"
    assert product["quantity"] == 15
    assert product["unit"] == "packets"


def test_add_updates_existing_product():
    """Add 10 more packets of Coffee when it already has 15 → quantity becomes 25."""
    add_product("Coffee", 15)

    resp = client.post("/voice/command", json={"transcript": "Add 10 packets of Coffee"})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["success"] is True
    assert "25" in data["message"], f"Expected 25 in message but got: {data['message']}"

    product = get_product("Coffee")
    assert product["quantity"] == 25


def test_maggi_unaffected_by_coffee_operations():
    """Maggi stock must remain unchanged when Coffee operations run."""
    add_product("Maggi", 20)
    add_product("Coffee", 15)

    # Update Coffee
    client.post("/voice/command", json={"transcript": "Add 10 packets of Coffee"})

    maggi = get_product("Maggi")
    assert maggi["quantity"] == 20, f"Maggi should still be 20, got {maggi['quantity']}"


def test_sell_reduces_stock():
    """I sold 5 packets of Maggi → Maggi drops from 20 to 15."""
    add_product("Maggi", 20)

    resp = client.post("/voice/command", json={"transcript": "I sold 5 packets of Maggi"})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["success"] is True

    maggi = get_product("Maggi")
    assert maggi["quantity"] == 15


def test_sell_insufficient_stock_returns_error():
    """Selling more than available stock should return 400."""
    add_product("Maggi", 3)

    resp = client.post("/voice/command", json={"transcript": "I sold 10 packets of Maggi"})
    assert resp.status_code == 400, resp.text
    assert "insufficient" in resp.json()["detail"].lower()


def test_check_stock():
    """How much Maggi is left? → returns current quantity."""
    add_product("Maggi", 20)

    resp = client.post("/voice/command", json={"transcript": "How much Maggi is left?"})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "20" in data["message"]


def test_unknown_command_returns_message():
    """Unrecognised transcript should return success with a 'didn't understand' message."""
    resp = client.post("/voice/command", json={"transcript": "blah blah blah"})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["success"] is True
    assert "didn't understand" in data["message"].lower() or "sorry" in data["message"].lower()


def test_empty_transcript_returns_400():
    """Empty transcript should return 400."""
    resp = client.post("/voice/command", json={"transcript": "   "})
    assert resp.status_code == 400, resp.text


def test_invalid_product_in_sell_returns_404():
    """Selling a product that doesn't exist should return 404."""
    resp = client.post("/voice/command", json={"transcript": "I sold 5 packets of GhostProduct"})
    assert resp.status_code == 404, resp.text
