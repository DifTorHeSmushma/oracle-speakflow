#!/usr/bin/env python3
"""Patch Oracle SpeakFlow workflow diagram for M6 accuracy (text updates)."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).parent
DIAGRAM = ROOT / "Oracle_SpeakFlow_Workflow_Indigo.excalidraw"

TEXT_BY_ID: dict[str, str] = {
    "title_sub": "Windows shipped · macOS beta · Linux M7 · MIT open source",
    "l1_txt": "Listen  →  VAD  →  Transcribe (cloud / local tier)  →  Dictionary  →  Paste  →  Loop",
    "int_b1": "Groq cloud OR",
    "int_b2": "bundled whisper-cli (Win)",
    "int_b3": "3-tier ladder + dictionary",
    "del_b1": "yield-focus guard",
    "del_b2": "Ctrl+V · nut-js",
    "del_b3": "clipboard fallback",
    "st_t2": "TRANSCRIBING\nGroq / local\ntier picker",
    "st_t3": "CORRECTING\ndictionary\nspoken → written",
    "st_ev_t": "yield-focus · click target BEFORE speaking · clipboard if SpeakFlow focused",
    "ev_t2": "transcription.ts",
    "ev_d2": "Groq remote path\nwhisper-cli local\nFast · Balanced · Accurate",
    "ev_t3": "paste.ts + dictionary",
    "ev_d3": "HWND guard · yield\nSettings → Dictionary\ndictionary.json",
    "dev_ttl": "PLATFORMS · M6 · USER TIPS",
    "dev_body": (
        "Windows ✅ shipped — bundled Fast tier, offline local\n"
        "macOS 🟡 beta — CI .dmg/.zip, cloud transcribe only\n"
        "Linux ⏳ M7 — CI tests pass, no installer yet\n\n"
        "Dictionary: tray → Settings → Dictionary → Add\n"
        "Paste: focus target app before speaking"
    ),
    "footer_txt": "Tray  →  focus target app  →  speak  →  paste  →  mute for calls  →  repeat",
    "leg_3": "◆ correction · red = mute · focus target before paste",
}


def patch() -> None:
    data = json.loads(DIAGRAM.read_text(encoding="utf-8"))
    updated = 0
    for el in data["elements"]:
        eid = el.get("id")
        if eid in TEXT_BY_ID and el.get("type") == "text":
            text = TEXT_BY_ID[eid]
            el["text"] = text
            el["originalText"] = text
            updated += 1
    DIAGRAM.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"Patched {DIAGRAM.name} ({updated}/{len(TEXT_BY_ID)} text updates)")


if __name__ == "__main__":
    patch()
