"""
Tests for Gnani AI Timbre Text-to-Speech (TTS) integration.
Verifies that:
- Timbre REST endpoint: https://api.vachana.ai/api/v1/tts/inference
- Authentication header: X-API-Key-ID: <GNANI_API_KEY> (no Bearer auth)
- Request body structure:
    text: <response text>
    model: timbre-v2.5
    voice: Kaveri
    language: en-IN
    audio_config:
      sample_rate: 48000
      num_channels: 1
      sample_width: 2
      encoding: linear_pcm
      container: wav
- Endpoint POST /voice/speak returns binary WAV with Content-Type: audio/wav.
- Mock TTS returns valid RIFF/WAVE silence without making external HTTP requests.
- Missing API key returns HTTP 500 status.
- Upstream network errors and timeouts are mapped to 502/504 status codes.
- Inventory updates succeed even if TTS endpoint encounters an error.
"""

import io
import wave
from unittest import mock
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.tts import (
    generate_silence_wav,
    DEFAULT_TTS_MODEL,
    DEFAULT_TTS_LANGUAGE,
    DEFAULT_TTS_VOICE,
    DEFAULT_TTS_SAMPLE_RATE,
    DEFAULT_TTS_NUM_CHANNELS,
    DEFAULT_TTS_SAMPLE_WIDTH,
    DEFAULT_TTS_ENCODING,
    DEFAULT_TTS_CONTAINER,
    GNANI_TTS_ENDPOINT,
)

client = TestClient(app)


def test_generate_silence_wav_produces_valid_riff():
    """Verify that mock silence generator produces a valid RIFF/WAVE file with 48000Hz."""
    wav_bytes = generate_silence_wav(duration_seconds=0.2, sample_rate=48000)
    assert wav_bytes[:4] == b"RIFF"
    assert wav_bytes[8:12] == b"WAVE"

    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        assert wf.getframerate() == 48000
        assert wf.getnchannels() == 1
        assert wf.getsampwidth() == 2


def test_voice_speak_mock_mode_returns_wav():
    """Verify POST /voice/speak with mock_tts=True returns 200 with audio/wav."""
    resp = client.post("/voice/speak", json={"text": "Stock updated successfully", "mock_tts": True})
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/wav"
    audio_bytes = resp.content
    assert audio_bytes[:4] == b"RIFF"
    assert audio_bytes[8:12] == b"WAVE"


def test_voice_speak_empty_text_returns_400():
    """Verify POST /voice/speak returns 400 when text is empty."""
    resp = client.post("/voice/speak", json={"text": "   "})
    assert resp.status_code == 400
    assert "empty" in resp.json()["detail"].lower()


def test_voice_speak_calls_gnani_timbre_with_correct_payload():
    """Verify endpoint, X-API-Key-ID authentication, and exact timbre-v2.5 Kaveri payload."""
    mock_audio = generate_silence_wav(0.1, 48000)

    with mock.patch("backend.tts.get_gnani_api_key", return_value="mock_gnani_key_123"):
        with mock.patch("httpx.AsyncClient.post") as mock_post:
            # Configure mock response returning raw audio/wav
            mock_resp = mock.MagicMock()
            mock_resp.status_code = 200
            mock_resp.headers = {"content-type": "audio/wav"}
            mock_resp.content = mock_audio
            mock_post.return_value = mock_resp

            resp = client.post(
                "/voice/speak",
                json={"text": "Your stock has been updated successfully.", "mock_tts": False},
            )

            assert resp.status_code == 200
            assert resp.headers["content-type"] == "audio/wav"
            assert resp.content == mock_audio

            # 1. Verify endpoint URL
            assert mock_post.called
            call_url = mock_post.call_args[0][0]
            assert call_url == "https://api.vachana.ai/api/v1/tts/inference"
            assert call_url == GNANI_TTS_ENDPOINT

            # 2. Verify authentication headers
            call_headers = mock_post.call_args[1]["headers"]
            assert call_headers["X-API-Key-ID"] == "mock_gnani_key_123"
            assert "Authorization" not in call_headers
            assert call_headers["Content-Type"] == "application/json"

            # 3. Verify request body
            call_json = mock_post.call_args[1]["json"]
            assert call_json["text"] == "Your stock has been updated successfully."
            assert call_json["model"] == "timbre-v2.5"
            assert call_json["voice"] == "Kaveri"
            assert call_json["language"] == "en-IN"
            assert call_json["audio_config"] == {
                "sample_rate": 48000,
                "num_channels": 1,
                "sample_width": 2,
                "encoding": "linear_pcm",
                "container": "wav",
            }


def test_voice_speak_missing_api_key_returns_500():
    """Verify that missing API key returns a 500 error with descriptive guidance."""
    with mock.patch("backend.tts.get_gnani_api_key", return_value=""):
        resp = client.post("/voice/speak", json={"text": "Testing missing key", "mock_tts": False})
        assert resp.status_code == 500
        assert "api key" in resp.json()["detail"].lower()


def test_voice_speak_upstream_timeout_returns_504():
    """Verify that upstream timeout is mapped to 504 Gateway Timeout."""
    import httpx

    with mock.patch("backend.tts.get_gnani_api_key", return_value="test_key"):
        with mock.patch("httpx.AsyncClient.post", side_effect=httpx.TimeoutException("Timed out")):
            resp = client.post("/voice/speak", json={"text": "Timeout test", "mock_tts": False})
            assert resp.status_code == 504
            assert "timed out" in resp.json()["detail"].lower()


def test_voice_speak_upstream_error_returns_502():
    """Verify that upstream 500/502 from Gnani is handled gracefully."""
    with mock.patch("backend.tts.get_gnani_api_key", return_value="test_key"):
        with mock.patch("httpx.AsyncClient.post") as mock_post:
            mock_resp = mock.MagicMock()
            mock_resp.status_code = 502
            mock_resp.headers = {"content-type": "application/json"}
            mock_resp.json.return_value = {"error": "TTS Engine overloaded"}
            mock_post.return_value = mock_resp

            resp = client.post("/voice/speak", json={"text": "Error test", "mock_tts": False})
            assert resp.status_code == 502
            assert "overloaded" in resp.json()["detail"].lower() or "502" in resp.json()["detail"]


def test_tts_failure_does_not_break_inventory_command():
    """Verify that an inventory voice command succeeds and updates database even if TTS fails."""
    # Execute an add command via POST /voice/command
    cmd_resp = client.post("/voice/command", json={"transcript": "Add 5 packets of Maggi"})
    assert cmd_resp.status_code == 200
    data = cmd_resp.json()
    assert data["success"] is True

    # If the subsequent TTS call fails (e.g. simulated 500):
    with mock.patch("backend.tts.get_gnani_api_key", return_value=""):
        tts_resp = client.post("/voice/speak", json={"text": data["message"], "mock_tts": False})
        assert tts_resp.status_code == 500

    # The inventory record was still updated and remains intact:
    get_resp = client.get("/products")
    maggi = next((p for p in get_resp.json() if p["name"].lower() == "maggi"), None)
    assert maggi is not None
