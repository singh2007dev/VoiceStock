from contextlib import asynccontextmanager
import sqlite3
from typing import List, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware

from backend.database import get_db_connection, init_db, row_to_dict
from backend.schemas import (
    ProductCreate,
    ProductResponse,
    ProductUpdateQuantity,
    STTResponse,
)
from backend.command_parser import parse_command
import backend.stt as stt
from backend.tts import call_gnani_timbre, generate_silence_wav



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
    stt.validate_audio_file(
        upload.filename or "",
        upload.content_type or "",
        file_bytes,
    )

    return await stt.call_gnani_stt(
        file_bytes,
        upload.filename or "recording.wav",
        upload.content_type or "audio/wav",
    )

# ------------------- Voice Command & TTS Endpoints -------------------

from pydantic import BaseModel as _BaseModel

class VoiceCommandRequest(_BaseModel):
    transcript: str


def find_product_by_name(name: str):
    """Return a product dict (with is_low_stock) or None."""
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM products WHERE lower(name) = lower(?)",
            (name,)
        ).fetchone()
        return row_to_dict(row) if row else None


@app.post(
    "/voice/command",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    tags=["Voice Commands"],
    summary="Parse transcript and execute inventory action",
)
async def voice_command_endpoint(req: VoiceCommandRequest):
    """Parse the transcript, perform the appropriate inventory operation,
    and return a textual result. No TTS is performed here.
    """
    transcript = req.transcript.strip()
    if not transcript:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Transcript cannot be empty.")

    parsed = parse_command(transcript)
    action = parsed.get("action")
    message = ""

    if action == "add":
        product_name = parsed.get("product", "").strip()
        qty = parsed.get("qty", 0)
        unit = parsed.get("unit", "units")

        if not product_name or qty <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid add command: product name and a positive quantity are required.",
            )

        product = find_product_by_name(product_name)
        if product:
            new_qty = product["quantity"] + qty
            with get_db_connection() as conn:
                conn.execute(
                    "UPDATE products SET quantity = ? WHERE id = ?",
                    (new_qty, product["id"]),
                )
                conn.commit()
            message = f"Updated {product['name']}: added {qty} {unit}. New quantity: {new_qty} {product['unit']}."
        else:
            # Auto-create the product
            min_stock = float(max(1, qty // 5))
            with get_db_connection() as conn:
                conn.execute(
                    "INSERT INTO products (name, quantity, unit, minimum_stock) VALUES (?, ?, ?, ?)",
                    (product_name.capitalize(), float(qty), unit, min_stock),
                )
                conn.commit()
            message = f"Created new product '{product_name.capitalize()}' with quantity {qty} {unit}."

    elif action == "sell":
        product_name = parsed.get("product", "").strip()
        qty = parsed.get("qty", 0)
        unit = parsed.get("unit", "units")

        if not product_name or qty <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid sell command: product name and a positive quantity are required.",
            )

        product = find_product_by_name(product_name)
        if not product:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Product '{product_name}' not found.")
        if product["quantity"] < qty:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Insufficient stock for '{product['name']}': only {product['quantity']} {product['unit']} available.",
            )
        new_qty = product["quantity"] - qty
        with get_db_connection() as conn:
            conn.execute(
                "UPDATE products SET quantity = ? WHERE id = ?",
                (new_qty, product["id"]),
            )
            conn.commit()
        message = f"Sold {qty} {unit} of {product['name']}. Remaining quantity: {new_qty} {product['unit']}."

    elif action == "check":
        product_name = parsed.get("product", "").strip()
        if not product_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Product name is required.")
        product = find_product_by_name(product_name)
        if not product:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Product '{product_name}' not found.")
        message = f"{product['name']} stock: {product['quantity']} {product['unit']}."

    elif action == "lowstock":
        with get_db_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM products WHERE quantity <= minimum_stock ORDER BY quantity ASC"
            ).fetchall()
        low = [row_to_dict(r) for r in rows]
        if not low:
            message = "No low‑stock products right now."
        else:
            names = ", ".join(f"{p['name']} ({p['quantity']} {p['unit']})" for p in low)
            message = f"Low‑stock products: {names}."

    else:
        message = "Sorry, I didn't understand that command. Try: 'Add 20 packets of Maggi' or 'I sold 5 packets of Maggi'."

    return {"success": True, "message": message}

class VoiceSpeakRequest(_BaseModel):
    text: str
    mock_tts: Optional[bool] = False


@app.post(
    "/voice/speak",
    status_code=status.HTTP_200_OK,
    tags=["Voice TTS"],
    summary="Generate spoken audio for a given text (Gnani Timbre)",
    response_class=Response,
    responses={
        200: {
            "content": {"audio/wav": {}},
            "description": "Playable WAV audio binary",
        }
    },
)
async def voice_speak_endpoint(
    req: Optional[VoiceSpeakRequest] = None,
    text: Optional[str] = None,
    mock_tts: Optional[bool] = False,
):
    """Generate spoken WAV audio for *text* using Gnani Timbre (Yashvi en-IN female).
    Accepts JSON body ({"text": "...", "mock_tts": false}) or query parameters.
    When ``mock_tts`` is true, returns a valid RIFF/WAVE audio placeholder without calling Gnani.
    """
    target_text = (req.text if req else text or "").strip()
    target_mock = (req.mock_tts if req and req.mock_tts is not None else mock_tts) or False

    if not target_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text cannot be empty.",
        )

    if target_mock:
        audio_bytes = generate_silence_wav(duration_seconds=0.3, sample_rate=48000)
    else:
        audio_bytes = await call_gnani_timbre(target_text)

    return Response(content=audio_bytes, media_type="audio/wav")
