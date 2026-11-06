# -*- coding: utf-8 -*-
"""Voice command parser for VoiceStock.
Parses a transcript string and returns a dict describing the intended action.
Supported intents:
- add stock      -> {'action': 'add',    'product': <name>, 'qty': <int>, 'unit': <unit>}
- reduce stock   -> {'action': 'sell',   'product': <name>, 'qty': <int>, 'unit': <unit>}
- check stock    -> {'action': 'check',  'product': <name>}
- list low stock -> {'action': 'lowstock'}
Any unrecognised input returns {'action': 'unknown'}.
"""

import re
from typing import Dict, Any

_UNITS = r"(?:packets?|pcs|units?|items?|kg|g|litre|liter|litres|liters|pieces?|dozen|box|boxes|bottle|bottles|bag|bags|sachet|sachets)"


def clean_transcript(text: str) -> str:
    """Strip whitespace, Devanagari Danda (। / ॥), and standard punctuation from transcript edges."""
    if not text:
        return ""
    cleaned = text.strip()
    cleaned = re.sub(r"[।॥.,!?;:\'\"\-]+$", "", cleaned).strip()
    return cleaned.lower()


def parse_command(transcript: str) -> Dict[str, Any]:
    """Return a dict describing the command.
    The function is deliberately tolerant – it lower-cases the input,
    handles Hindi danda punctuation (।), and supports common STT misrecognitions
    like 'And' instead of 'Add' when followed by quantity and product.
    """
    txt = clean_transcript(transcript)
    if not txt:
        return {"action": "unknown"}

    # 1. Add stock: 'add 10 packets of coffee', 'and 10 packets of coffee', 'ad 10 packets coffee'
    add_match = re.search(
        r"^(?:please\s+)?(?:add|and|ad)\s+(\d+)\s+(?:(" + _UNITS + r")\s+)?(?:of\s+)?([a-z0-9]+(?:\s+[a-z0-9]+)*)",
        txt,
    )
    if add_match:
        qty = int(add_match.group(1))
        unit = add_match.group(2) if add_match.group(2) else "packets"
        product = add_match.group(3).strip()
        return {"action": "add", "qty": qty, "unit": unit, "product": product}

    # 2. Reduce stock: 'sell 5 packets of coffee', 'i sold 5 packets of coffee', 'sold 5 packets'
    sell_match = re.search(
        r"^(?:please\s+)?(?:i\s+)?(?:sold|sell|reduce|remove)\s+(\d+)\s+(?:(" + _UNITS + r")\s+)?(?:of\s+)?([a-z0-9]+(?:\s+[a-z0-9]+)*)",
        txt,
    )
    if sell_match:
        qty = int(sell_match.group(1))
        unit = sell_match.group(2) if sell_match.group(2) else "packets"
        product = sell_match.group(3).strip()
        return {"action": "sell", "qty": qty, "unit": unit, "product": product}

    # 3. Check stock: 'how much coffee is available?', 'how much coffee is left?'
    check_match = re.search(
        r"how\s+much\s+([a-z0-9]+(?:\s+[a-z0-9]+)*?)\s+(?:is\s+)?(?:available|left|in\s+stock|remaining|do\s+we\s+have|there)",
        txt,
    )
    if check_match:
        return {"action": "check", "product": check_match.group(1).strip()}

    # Alternative check syntax: 'check coffee stock' or 'check stock of coffee'
    check_alt = re.search(r"check\s+(?:stock\s+of\s+)?([a-z0-9]+(?:\s+[a-z0-9]+)*?)(?:\s+stock)?$", txt)
    if check_alt and check_alt.group(1).strip() != "low":
        return {"action": "check", "product": check_alt.group(1).strip()}

    # 4. Low stock: 'show low-stock products', 'show low stock products'
    if re.search(r"(?:show|list|get)\s+low[-\s]?stock(?:\s+products)?", txt):
        return {"action": "lowstock"}

    return {"action": "unknown"}
