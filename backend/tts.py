# -*- coding: utf-8 -*-
"""Gnani AI Timbre Text-to-Speech (TTS) integration.
Connects to Gnani Timbre REST endpoint:
  POST https://api.vachana.ai/api/v1/tts/inference
using the official API specifications:
  Header: X-API-Key-ID: <GNANI_API_KEY>
  Payload:
    - text: <text>
    - model: timbre-v2.5
    - voice: Kaveri
    - language: en-IN
    - audio_config:
        sample_rate: 48000
        num_channels: 1
        sample_width: 2
        encoding: linear_pcm
        container: wav
Provides mock mode fallback with valid RIFF/WAVE silence to protect credits.
"""

import os
import io
import wave
import base64
from pathlib import Path
from typing import Optional, Dict, Any
import httpx
from dotenv import load_dotenv
from fastapi import HTTPException, status

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=BASE_DIR / ".env")

GNANI_TTS_ENDPOINT = "https://api.vachana.ai/api/v1/tts/inference"

# Timbre TTS default parameters
DEFAULT_TTS_MODEL = "timbre-v2.5"
DEFAULT_TTS_LANGUAGE = "en-IN"
DEFAULT_TTS_VOICE = "Kaveri"
DEFAULT_TTS_SAMPLE_RATE = 48000
DEFAULT_TTS_NUM_CHANNELS = 1
DEFAULT_TTS_SAMPLE_WIDTH = 2
DEFAULT_TTS_ENCODING = "linear_pcm"
DEFAULT_TTS_CONTAINER = "wav"


def get_gnani_api_key() -> str:
    """Retrieve Gnani API key securely from environment."""
    return os.getenv("GNANI_API_KEY", "").strip()


# Backward compatibility alias
get_gnani_tts_api_key = get_gnani_api_key


def generate_silence_wav(duration_seconds: float = 0.3, sample_rate: int = DEFAULT_TTS_SAMPLE_RATE) -> bytes:
    """Return a minimal valid WAV file containing 16-bit PCM silence.
    Used for local testing and mock mode to avoid calling Gnani APIs.
    """
    n_frames = int(duration_seconds * sample_rate)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wf:
        wf.setnchannels(DEFAULT_TTS_NUM_CHANNELS)  # Mono
        wf.setsampwidth(DEFAULT_TTS_SAMPLE_WIDTH)  # 16-bit PCM (2 bytes)
        wf.setframerate(sample_rate)
        wf.writeframes(b"\x00\x00" * n_frames)
    return buffer.getvalue()


async def call_gnani_timbre(
    text: str,
    client: Optional[httpx.AsyncClient] = None,
    api_key: Optional[str] = None,
) -> bytes:
    """Call Gnani Timbre TTS REST endpoint and return raw binary WAV audio bytes.
    Sends:
      text: <text>
      model: timbre-v2.5
      voice: Kaveri
      language: en-IN
      audio_config:
        sample_rate: 48000
        num_channels: 1
        sample_width: 2
        encoding: linear_pcm
        container: wav
    """
    key = api_key or get_gnani_api_key()
    if not key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gnani API key is not configured. Please set GNANI_API_KEY in .env.",
        )

    headers = {
        "X-API-Key-ID": key,
        "Content-Type": "application/json",
    }

    payload = {
        "text": text,
        "model": DEFAULT_TTS_MODEL,
        "voice": DEFAULT_TTS_VOICE,
        "language": DEFAULT_TTS_LANGUAGE,
        "audio_config": {
            "sample_rate": DEFAULT_TTS_SAMPLE_RATE,
            "num_channels": DEFAULT_TTS_NUM_CHANNELS,
            "sample_width": DEFAULT_TTS_SAMPLE_WIDTH,
            "encoding": DEFAULT_TTS_ENCODING,
            "container": DEFAULT_TTS_CONTAINER,
        },
    }

    timeout = httpx.Timeout(30.0, connect=10.0)

    try:
        if client:
            response = await client.post(
                GNANI_TTS_ENDPOINT,
                headers=headers,
                json=payload,
                timeout=timeout,
            )
        else:
            async with httpx.AsyncClient() as default_client:
                response = await default_client.post(
                    GNANI_TTS_ENDPOINT,
                    headers=headers,
                    json=payload,
                    timeout=timeout,
                )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Gnani Timbre TTS service timed out.",
        )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to communicate with Gnani Timbre service: {str(exc)}",
        )

    if response.status_code != 200:
        try:
            err_json = response.json()
            msg = err_json.get("message") or err_json.get("error") or response.text
        except Exception:
            msg = response.text
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gnani Timbre TTS error ({response.status_code}): {msg}",
        )

    content_type = response.headers.get("content-type", "").lower()
    # If the response is JSON containing base64 audio
    if "application/json" in content_type:
        try:
            res_data = response.json()
            audio_b64 = (
                res_data.get("audio")
                or res_data.get("audio_content")
                or res_data.get("audioContent")
                or res_data.get("data")
            )
            if audio_b64:
                return base64.b64decode(audio_b64)
        except Exception:
            pass

    # If already binary audio or raw content
    return response.content
