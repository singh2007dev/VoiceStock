# -*- coding: utf-8 -*-
"""Gnani Timbre Text-to-Speech backward-compatibility helper.
Delegates to backend.tts module.
"""

from backend.tts import (
    call_gnani_timbre,
    generate_silence_wav,
    get_gnani_api_key,
    get_gnani_tts_api_key,
    GNANI_TTS_ENDPOINT,
    DEFAULT_TTS_MODEL,
    DEFAULT_TTS_LANGUAGE,
    DEFAULT_TTS_VOICE,
    DEFAULT_TTS_SAMPLE_RATE,
    DEFAULT_TTS_NUM_CHANNELS,
    DEFAULT_TTS_SAMPLE_WIDTH,
    DEFAULT_TTS_ENCODING,
    DEFAULT_TTS_CONTAINER,
)

__all__ = [
    "call_gnani_timbre",
    "generate_silence_wav",
    "get_gnani_api_key",
    "get_gnani_tts_api_key",
    "GNANI_TTS_ENDPOINT",
    "DEFAULT_TTS_MODEL",
    "DEFAULT_TTS_LANGUAGE",
    "DEFAULT_TTS_VOICE",
    "DEFAULT_TTS_SAMPLE_RATE",
    "DEFAULT_TTS_NUM_CHANNELS",
    "DEFAULT_TTS_SAMPLE_WIDTH",
    "DEFAULT_TTS_ENCODING",
    "DEFAULT_TTS_CONTAINER",
]
