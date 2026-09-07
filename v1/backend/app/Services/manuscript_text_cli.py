"""JSON-only CLI boundary for bounded private manuscript extraction."""

from __future__ import annotations

import json
import logging
import sys

from similarity.document_reader import DocumentReadError, extract_text


for parser_logger in ("pypdf", "docx", "pdfminer"):
    logging.getLogger(parser_logger).setLevel(logging.CRITICAL)


def normalize(text: str) -> str:
    return " ".join(text.split())


def main(argv: list[str]) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    if len(argv) != 2:
        _write("failed", "")
        return 1

    try:
        text = normalize(extract_text(argv[1]))
    except (DocumentReadError, OSError, ValueError):
        _write("failed", "")
        return 1
    except Exception:
        _write("failed", "")
        return 1

    _write("ready", text)
    return 0


def _write(status: str, text: str) -> None:
    # stdout is the complete protocol. Never include exception details or paths.
    sys.stdout.write(
        json.dumps(
            {"status": status, "text": text}, ensure_ascii=False, separators=(",", ":")
        )
    )


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
