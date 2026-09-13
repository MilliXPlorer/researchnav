"""JSON-only CLI boundary for bounded private manuscript extraction."""

from __future__ import annotations

import json
import logging
import os
import sys

from similarity.document_reader import DocumentReadError, extract_parts


for parser_logger in ("pymupdf", "docx", "pdfminer"):
    logging.getLogger(parser_logger).setLevel(logging.CRITICAL)


def main(argv: list[str]) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    if len(argv) != 2:
        _write("failed", [])
        return 1

    try:
        maximum_part_characters = int(os.environ.get("MANUSCRIPT_PART_CHARACTERS", "100000"))
        parts = extract_parts(argv[1], maximum_part_characters)
    except (DocumentReadError, OSError, ValueError):
        _write("failed", [])
        return 1
    except Exception:
        _write("failed", [])
        return 1

    _write("ready", parts)
    return 0


def _write(status: str, parts: list[str]) -> None:
    # stdout is the complete protocol. Never include exception details or paths.
    sys.stdout.write(
        json.dumps(
            {"status": status, "parts": parts}, ensure_ascii=False, separators=(",", ":")
        )
    )


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
