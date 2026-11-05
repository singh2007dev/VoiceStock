from contextlib import contextmanager
from pathlib import Path
import sqlite3
from typing import Generator

# Define database location at the project root
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "inventory.db"


@contextmanager
def get_db_connection() -> Generator[sqlite3.Connection, None, None]:
    """Context manager providing a SQLite connection.

    Commits on success, rolls back on exception, and automatically closes the connection.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def init_db() -> None:
    """Create the products table automatically if it does not already exist."""
    with get_db_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                quantity REAL NOT NULL DEFAULT 0.0,
                unit TEXT NOT NULL,
                minimum_stock REAL NOT NULL DEFAULT 0.0
            );
            """
        )


def row_to_dict(row: sqlite3.Row) -> dict:
    """Helper to convert a sqlite3.Row into a Python dict with a calculated low-stock flag."""
    item = dict(row)
    item["is_low_stock"] = item["quantity"] <= item["minimum_stock"]
    return item
