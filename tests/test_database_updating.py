"""
Regression tests for VoiceStock database updating via voice commands.
Verifies that:
- Adding non-existent product creates it in SQLite.
- Adding to existing product updates quantity in SQLite.
- GET /products immediately reflects the SQLite updates.
- Selling reduces quantity in SQLite.
- Hindi danda (।) and STT variations ('And' instead of 'Add') work correctly.
- Unrelated commands do not modify inventory.
"""

import sys
import os
import sqlite3
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.database import get_db_connection
import backend.database as db_module
from backend.main import app

client = TestClient(app)


def cleanup_coffee():
    with get_db_connection() as conn:
        conn.execute("DELETE FROM products WHERE lower(name) = 'coffee'")
        conn.commit()


def get_direct_db_product(name: str):
    """Read product directly from SQLite using raw sqlite3 query on the active database."""
    conn = sqlite3.connect(db_module.DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT * FROM products WHERE lower(name) = lower(?)", (name,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def test_scenario_add_creates_coffee_and_get_products_reflects():
    """Step 3 Test 1: 'Add 10 packets of Coffee' creates Coffee with quantity 10."""
    cleanup_coffee()

    # 1. Execute voice command
    resp = client.post("/voice/command", json={"transcript": "Add 10 packets of Coffee"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True
    assert "Coffee" in body["message"]

    # 2. Verify direct SQLite database
    db_prod = get_direct_db_product("Coffee")
    assert db_prod is not None, "Product must exist in SQLite database"
    assert db_prod["quantity"] == 10.0
    assert db_prod["unit"] == "packets"

    # 3. Verify GET /products endpoint reads the exact same database
    get_resp = client.get("/products")
    assert get_resp.status_code == 200
    all_prods = get_resp.json()
    coffee_in_list = next((p for p in all_prods if p["name"].lower() == "coffee"), None)
    assert coffee_in_list is not None
    assert coffee_in_list["quantity"] == 10.0
    assert coffee_in_list["unit"] == "packets"


def test_scenario_add_to_existing_coffee():
    """Step 3 Test 2: When Coffee already has 15, adding 10 increases quantity to 25."""
    cleanup_coffee()

    # Set Coffee to 15 packets directly
    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO products (name, quantity, unit, minimum_stock) VALUES ('Coffee', 15.0, 'packets', 5.0)"
        )
        conn.commit()

    # Verify initial state
    assert get_direct_db_product("Coffee")["quantity"] == 15.0

    # Execute 'Add 10 packets of Coffee'
    resp = client.post("/voice/command", json={"transcript": "Add 10 packets of Coffee"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True

    # Verify direct SQLite
    db_prod = get_direct_db_product("Coffee")
    assert db_prod["quantity"] == 25.0

    # Verify GET /products
    get_resp = client.get("/products")
    coffee = next(p for p in get_resp.json() if p["name"].lower() == "coffee")
    assert coffee["quantity"] == 25.0


def test_scenario_sell_packets_of_coffee():
    """Step 3 Test 3: 'Sell 5 packets of Coffee' reduces quantity from 25 to 20."""
    # Ensure Coffee has 25 packets
    with get_db_connection() as conn:
        conn.execute("UPDATE products SET quantity = 25.0 WHERE lower(name) = 'coffee'")
        conn.commit()

    resp = client.post("/voice/command", json={"transcript": "Sell 5 packets of Coffee"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True

    # Verify directly in SQLite
    db_prod = get_direct_db_product("Coffee")
    assert db_prod["quantity"] == 20.0

    # Verify GET /products
    get_resp = client.get("/products")
    coffee = next(p for p in get_resp.json() if p["name"].lower() == "coffee")
    assert coffee["quantity"] == 20.0


def test_scenario_how_much_coffee_available():
    """Step 3 Test 4: 'How much Coffee is available?' checks current quantity."""
    resp = client.post("/voice/command", json={"transcript": "How much Coffee is available?"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True
    assert "20" in body["message"]
    assert "stock" in body["message"].lower() or "coffee" in body["message"].lower()


def test_hindi_danda_punctuation():
    """Step 3: Trailing Hindi punctuation '।' should be parsed and processed cleanly."""
    # Add 5 packets with trailing danda
    resp = client.post("/voice/command", json={"transcript": "Add 5 packets of Coffee।"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["success"] is True
    assert get_direct_db_product("Coffee")["quantity"] == 25.0

    # Sell 5 packets with trailing danda
    resp = client.post("/voice/command", json={"transcript": "Sell 5 packets of Coffee।"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["success"] is True
    assert get_direct_db_product("Coffee")["quantity"] == 20.0

    # Check with trailing danda
    resp = client.post("/voice/command", json={"transcript": "How much Coffee is available।"})
    assert resp.status_code == 200, resp.text
    assert "20" in resp.json()["message"]


def test_stt_variation_and_instead_of_add():
    """Step 3: STT mishearing 'And 10 packets of Coffee' should be interpreted as Add."""
    resp = client.post("/voice/command", json={"transcript": "And 10 packets of Coffee"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["success"] is True
    # Previous was 20, + 10 = 30
    assert get_direct_db_product("Coffee")["quantity"] == 30.0


def test_unrelated_command_does_not_modify_inventory():
    """Unrelated sentences (even starting with And) must not modify inventory."""
    initial_qty = get_direct_db_product("Coffee")["quantity"]

    resp = client.post("/voice/command", json={"transcript": "And what is the weather today?"})
    assert resp.status_code == 200
    assert "didn't understand" in resp.json()["message"].lower() or "sorry" in resp.json()["message"].lower()

    # Verify inventory was NOT touched
    assert get_direct_db_product("Coffee")["quantity"] == initial_qty


def test_sell_insufficient_stock_does_not_modify_inventory():
    """Selling more than available stock returns 400 and keeps quantity unchanged."""
    initial_qty = get_direct_db_product("Coffee")["quantity"]

    resp = client.post("/voice/command", json={"transcript": "Sell 999 packets of Coffee"})
    assert resp.status_code == 400
    assert "insufficient" in resp.json()["detail"].lower()

    # Verify inventory unchanged
    assert get_direct_db_product("Coffee")["quantity"] == initial_qty

    # Clean up after tests
    cleanup_coffee()
