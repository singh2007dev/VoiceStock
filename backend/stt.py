import os
from pathlib import Path
from typing import Dict, Optional, Set
import httpx
from dotenv import load_dotenv
from fastapi import HTTPException, status

# Load .env from project root
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"
load_dotenv(dotenv_path=ENV_PATH)

GNANI_STT_ENDPOINT = "https://api.vachana.ai/stt/v3"
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB limit (max 30s audio)

ALLOWED_EXTENSIONS: Set[str] = {
    ".wav",
    ".mp3",
    ".ogg",
    ".flac",
    ".aac",
    ".m4a",
    ".webm",
}

ALLOWED_MIME_TYPES: Set[str] = {
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/mpeg",
    "audio/mp3",
    "audio/ogg",
    "application/ogg",
    "audio/flac",
    "audio/x-flac",
    "audio/aac",
    "audio/x-aac",
    "audio/m4a",
    "audio/x-m4a",
    "audio/mp4",
    "video/mp4",  # Often sent by browsers recording audio/mp4 (m4a)
    "audio/webm",
    "video/webm",
}


def get_gnani_api_key() -> str:
    """Retrieve Gnani API key securely from environment."""
    key = os.getenv("GNANI_API_KEY", "").strip()
    return key


def validate_audio_file(filename: str, content_type: str, file_bytes: bytes) -> None:
    """Validate audio file extension, MIME type, and size."""
    if not file_bytes or len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded audio file is empty.",
        )

    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=(
                f"Audio file exceeds maximum size limit of "
                f"{MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB (max 30 seconds)."
            ),
        )

    ext = Path(filename).suffix.lower() if filename else ""
    is_ext_valid = ext in ALLOWED_EXTENSIONS
    is_mime_valid = bool(content_type and content_type.lower() in ALLOWED_MIME_TYPES)

    # Permit if either extension or MIME type is recognized as valid audio
    if not (is_ext_valid or is_mime_valid):
        supported = ", ".join(ext.lstrip(".").upper() for ext in sorted(ALLOWED_EXTENSIONS))
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported audio format '{ext or content_type}'. Supported formats: {supported}.",
        )


def extract_transcript_and_language(data: dict) -> Dict[str, str]:
    """Extract transcript and detected language code from Gnani response payload."""
    if not isinstance(data, dict):
        return {"transcript": str(data), "language": "unknown"}

    payload = data.get("data", data) if isinstance(data.get("data"), dict) else data

    transcript = (
        payload.get("transcript")
        or payload.get("transcription")
        or payload.get("text")
        or data.get("transcript")
        or data.get("transcription")
        or data.get("text")
        or ""
    )

    language = (
        payload.get("language")
        or payload.get("language_code")
        or payload.get("lang")
        or payload.get("detected_language")
        or data.get("language")
        or data.get("language_code")
        or data.get("lang")
        or "unknown"
    )

    return {"transcript": transcript.strip(), "language": language.strip()}


async def call_gnani_stt(
    file_bytes: bytes,
    filename: str,
    content_type: str,
    client: Optional[httpx.AsyncClient] = None,
) -> Dict[str, str]:
    """Send audio to Gnani Prisma V3.0 STT API and return parsed transcript and language.

    Uses an optional httpx client to facilitate mocked unit testing without credit consumption.
    """
    api_key = get_gnani_api_key()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Gnani API key is not configured on the server. Please check .env file.",
        )

    headers = {
        "X-API-Key-ID": api_key,
    }

    form_data = {
        "model": "prisma-v3.0",
        "language_code": "indic-auto",
        "lang": "indic-auto",
        "format": "transcribe",
    }

    files = {
        "audio_file": (filename or "recording.wav", file_bytes, content_type or "audio/wav"),
    }

    timeout = httpx.Timeout(45.0, connect=10.0)

    try:
        if client is not None:
            response = await client.post(
                GNANI_STT_ENDPOINT,
                headers=headers,
                data=form_data,
                files=files,
                timeout=timeout,
            )
        else:
            async with httpx.AsyncClient() as default_client:
                response = await default_client.post(
                    GNANI_STT_ENDPOINT,
                    headers=headers,
                    data=form_data,
                    files=files,
                    timeout=timeout,
                )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Gnani STT service request timed out. Please try again.",
        )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to communicate with Gnani STT service: {str(exc)}",
        )

    if response.status_code != 200:
        error_msg = response.text
        try:
            err_json = response.json()
            error_msg = err_json.get("message") or err_json.get("error") or response.text
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gnani STT service error ({response.status_code}): {error_msg}",
        )

    try:
        response_json = response.json()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Invalid response format received from Gnani STT service.",
        )

    return extract_transcript_and_language(response_json)
