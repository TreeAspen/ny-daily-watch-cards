#!/usr/bin/env python3
"""Regenerate assets/logo.js (a data-URI copy of assets/logo.png).

The web tool reads the logo from logo.js so it never needs a network fetch and
never taints the export canvas. Run this after replacing assets/logo.png:

    python tools/embed_logo.py [source.png]
"""
import base64
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEST_PNG = ROOT / "assets" / "logo.png"
DEST_JS = ROOT / "assets" / "logo.js"
SIZE = 320


def main():
    if len(sys.argv) > 1:
        from PIL import Image
        im = Image.open(sys.argv[1]).convert("RGBA")
        im.thumbnail((SIZE, SIZE), Image.LANCZOS)
        im.save(DEST_PNG, optimize=True)
        print(f"wrote {DEST_PNG} at {im.size}")

    b64 = base64.b64encode(DEST_PNG.read_bytes()).decode()
    DEST_JS.write_text(
        "// Auto-generated from assets/logo.png by tools/embed_logo.py -- do not edit by hand.\n"
        f'window.NDW_LOGO = "data:image/png;base64,{b64}";\n',
        encoding="utf-8",
    )
    print(f"wrote {DEST_JS} ({DEST_JS.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
