from contextlib import asynccontextmanager
import sqlite3
from typing import List, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware

from backend.database import get_db_connection, init_db, row_to_dict
from backend.schemas import (
    ProductCreate,
    ProductResponse,
    ProductUpdateQuantity,
    STTResponse,
)
from backend.stt import call_gnani_stt, validate_audio_file


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup tasks: automatically create the database and tables."""
    init_db()
    yield


app = FastAPI(
    title="VoiceStock API",
    description="Voice-powered inventory management for small kirana stores",
    lifespan=lifespan,
)

# Enable CORS for the frontend development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["Health"])
def read_root():
    """Root health-check endpoint."""
    return {"message": "VoiceStock API is running"}


@app.post(
    "/products",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Products"],
)
def add_product(product: ProductCreate):
    """Add a new product to inventory."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                """
                INSERT INTO products (name, quantity, unit, minimum_stock)
                VALUES (?, ?, ?, ?)
                """,
                (
                    product.name,
                    product.quantity,
                    product.unit,
                    product.minimum_stock,
                ),
            )
            conn.commit()
            product_id = cursor.lastrowid
        except sqlite3.IntegrityError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Product with name '{product.name}' already exists in inventory.",
            )

        row = conn.execute(
            "SELECT * FROM products WHERE id = ?", (product_id,)
        ).fetchone()
        return row_to_dict(row)


@app.get(
    "/products",
    response_model=List[ProductResponse],
    tags=["Products"],
)
def list_products():
    """List all products in inventory."""
    with get_db_connection() as conn:
        rows = conn.execute("SELECT * FROM products ORDER BY id ASC").fetchall()
        return [row_to_dict(r) for r in rows]


@app.get(
    "/products/low-stock",
    response_model=List[ProductResponse],
    tags=["Products"],
)
def get_low_stock_products():
    """Identify products whose quantity is less than or equal to their minimum stock threshold."""
    with get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM products
            WHERE quantity <= minimum_stock
            ORDER BY quantity ASC
            """
        ).fetchall()
        return [row_to_dict(r) for r in rows]


@app.get(
    "/products/{product_id}",
    response_model=ProductResponse,
    tags=["Products"],
)
def get_product(product_id: int):
    """Fetch a single product by its ID."""
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM products WHERE id = ?", (product_id,)
        ).fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product with ID {product_id} not found.",
            )
        return row_to_dict(row)


@app.patch(
    "/products/{product_id}/quantity",
    response_model=ProductResponse,
    tags=["Products"],
)
def update_product_quantity(product_id: int, update: ProductUpdateQuantity):
    """Update stock quantity for an existing product."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE products SET quantity = ? WHERE id = ?",
            (update.quantity, product_id),
        )
        conn.commit()

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product with ID {product_id} not found.",
            )

        row = conn.execute(
            "SELECT * FROM products WHERE id = ?", (product_id,)
        ).fetchone()
        return row_to_dict(row)


@app.delete(
    "/products/{product_id}",
    tags=["Products"],
)
def delete_product(product_id: int):
    """Delete a product from inventory."""
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM products WHERE id = ?", (product_id,)
        ).fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product with ID {product_id} not found.",
            )

        conn.execute("DELETE FROM products WHERE id = ?", (product_id,))
        conn.commit()

        return {
            "message": f"Product '{row['name']}' (ID {product_id}) successfully deleted."
        }


@app.post(
    "/voice/transcribe",
    response_model=STTResponse,
    status_code=status.HTTP_200_OK,
    tags=["Voice STT"],
    summary="Transcribe audio recording using Gnani Prisma V3.0",
)
@app.post(
    "/stt/transcribe",
    response_model=STTResponse,
    status_code=status.HTTP_200_OK,
    tags=["Voice STT"],
    include_in_schema=False,
)
async def transcribe_audio(
    audio_file: Optional[UploadFile] = File(
        None, description="Audio file in WAV, MP3, OGG, FLAC, AAC, or M4A format"
    ),
    file: Optional[UploadFile] = File(
        None, description="Alternative field name for audio file"
    ),
):
    """Upload an audio file (max 30s, up to 10MB) to transcribe into text using Gnani Prisma V3.0."""
    upload = audio_file or file
    if not upload:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio file is required. Please upload using 'audio_file' or 'file' field.",
        )

    file_bytes = await upload.read()
    validate_audio_file(
        upload.filename or "",
        upload.content_type or "",
        file_bytes,
    )

    return await call_gnani_stt(
        file_bytes=file_bytes,
        filename=upload.filename or "recording.wav",
        content_type=upload.content_type or "audio/wav",
    )
