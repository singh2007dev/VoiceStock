# -*- coding: utf-8 -*-
"""Tests for the live STT pipeline without calling the real Gnani service.
The test:
1. Generates a minimal valid WAV file in memory (a few samples of silence).
2. Sends it to the `/voice/transcribe` endpoint using FastAPI's TestClient.
3. Mocks `backend.stt.call_gnani_stt` to capture the arguments and return a deterministic response.
4. Verifies that:
   * The endpoint accepts the WAV upload (status 200).
   * The WAV header starts with the RIFF/WAVE marker.
   * The mock receives the same bytes and the MIME type `audio/wav`.
   * The endpoint returns the mocked transcript + language.
   * Other inventory endpoints remain functional.
"""

import io
import wave
from unittest import mock

import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def generate_silence_wav(duration_seconds: float = 0.1, sample_rate: int = 16000) -> bytes:
    """Return a minimal WAV file containing silence.
    The file is small enough for a unit test but still has a correct RIFF header.
    """
    n_frames = int(duration_seconds * sample_rate)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16‑bit PCM
        wf.setframerate(sample_rate)
        wf.writeframes(b"\x00\x00" * n_frames)
    return buffer.getvalue()


@pytest.fixture
def wav_bytes():
    return generate_silence_wav()


def test_voice_transcribe_endpoint_accepts_wav_and_calls_mocked_gnani(wav_bytes):
    # Prepare a mock for the Gnani call that records its arguments
    with mock.patch("backend.stt.call_gnani_stt") as mock_gnani:
        # Configure the mock to return a predictable payload
        mock_gnani.return_value = {"transcript": "mocked transcription", "language": "en"}

        # Send the request – FastAPI expects a file field named 'audio_file'
        files = {
            "audio_file": ("test.wav", wav_bytes, "audio/wav"),
        }
        response = client.post("/voice/transcribe", files=files)

        # 1. Endpoint should respond with 200 OK and the mocked JSON
        assert response.status_code == 200, response.text
        json_resp = response.json()
        assert json_resp["transcript"] == "mocked transcription"
        assert json_resp["language"] == "en"

        # 2. Verify the WAV header – first 12 bytes should be RIFF + size + WAVE
        assert wav_bytes[:4] == b"RIFF"
        assert wav_bytes[8:12] == b"WAVE"

        # 3. Ensure the mocked Gnani function was called exactly once
        assert mock_gnani.called
        assert mock_gnani.call_count == 1
        # Extract the arguments the backend passed to call_gnani_stt
        args, kwargs = mock_gnani.call_args
        file_bytes_passed, filename_passed, content_type_passed = args[:3]
        # Verify the bytes are identical to what we sent (the header check is enough)
        assert file_bytes_passed == wav_bytes
        assert filename_passed == "test.wav"
        assert content_type_passed == "audio/wav"


def test_inventory_endpoints_still_work():
    # Clean up TestItem if present from previous runs
    from backend.database import get_db_connection
    with get_db_connection() as conn:
        conn.execute("DELETE FROM products WHERE lower(name) = 'testitem'")
        conn.commit()

    # Simple sanity check that other routes are unchanged
    resp = client.get("/products")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)

    # Add a product, then fetch it
    new_product = {
        "name": "TestItem",
        "quantity": 5,
        "unit": "pcs",
        "minimum_stock": 2,
    }
    add_resp = client.post("/products", json=new_product)
    assert add_resp.status_code == 201
    prod = add_resp.json()
    assert prod["name"] == "TestItem"
    get_resp = client.get(f"/products/{prod['id']}")
    assert get_resp.status_code == 200
    fetched = get_resp.json()

    # Clean up afterwards
    with get_db_connection() as conn:
        conn.execute("DELETE FROM products WHERE lower(name) = 'testitem'")
        conn.commit()
    assert fetched["name"] == "TestItem"
