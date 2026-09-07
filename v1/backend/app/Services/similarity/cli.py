"""JSON stdin/stdout entry point for Laravel's similarity process boundary."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, NoReturn

try:
    from .engine import InvalidWorkerInput, compare_query, compare_titles
except ImportError:  # Direct script execution from Laravel's fixed command.
    from engine import compare_query, compare_titles, InvalidWorkerInput  # type: ignore[import-not-found,no-redef]


def _bounded_environment_integer(name: str, default: int, maximum: int) -> int:
    try:
        value = int(os.environ.get(name, str(default)))
    except ValueError:
        return default
    return min(maximum, max(1, value))


MAX_INPUT_BYTES = _bounded_environment_integer(
    "SIMILARITY_MAXIMUM_INPUT_BYTES", 256 * 1024 * 1024, 512 * 1024 * 1024
)
MAX_CANDIDATES = 250
MAX_TITLE_LENGTH = 500
MAX_CONTENT_LENGTH = _bounded_environment_integer(
    "SIMILARITY_MAXIMUM_CONTENT_CHARACTERS", 1_000_000, 2_000_000
)


def _error(code: str, exit_code: int) -> NoReturn:
    sys.stdout.write(json.dumps({"error": {"code": code}}, separators=(",", ":")))
    sys.stdout.flush()
    raise SystemExit(exit_code)


def _record(
    value: Any,
    field: str,
    with_content: bool = False,
    optional_content: bool = False,
) -> dict[str, Any]:
    expected = {"id", "title", "content"} if with_content else {"id", "title"}
    valid_keys = [expected]
    if optional_content:
        valid_keys.append({"id", "title", "content"})
    if not isinstance(value, dict) or set(value) not in valid_keys:
        raise InvalidWorkerInput(f"Invalid {field} record.")
    if not isinstance(value["id"], int) or value["id"] < 1:
        raise InvalidWorkerInput(f"Invalid {field} identifier.")
    if (
        not isinstance(value["title"], str)
        or not value["title"].strip()
        or len(value["title"]) > MAX_TITLE_LENGTH
    ):
        raise InvalidWorkerInput(f"Invalid {field} title.")
    if "content" in value and (
        not isinstance(value["content"], str)
        or not value["content"].strip()
        or len(value["content"]) > MAX_CONTENT_LENGTH
    ):
        raise InvalidWorkerInput(f"Invalid {field} content.")
    return value


def _payload(raw: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    value = json.loads(raw)
    if not isinstance(value, dict) or set(value) != {"source", "candidates"}:
        raise InvalidWorkerInput("Invalid worker payload.")
    source = _record(value["source"], "source", optional_content=True)
    if (
        not isinstance(value["candidates"], list)
        or len(value["candidates"]) > MAX_CANDIDATES
    ):
        raise InvalidWorkerInput("Invalid candidates.")
    candidates = [
        _record(candidate, "candidate", optional_content=True)
        for candidate in value["candidates"]
    ]
    ids = [candidate["id"] for candidate in candidates]
    if source["id"] in ids or len(ids) != len(set(ids)):
        raise InvalidWorkerInput(
            "Candidate identifiers must be distinct from the source."
        )
    return source, candidates


def _query_payload(raw: str) -> tuple[str, list[dict[str, Any]]]:
    value = json.loads(raw)
    if not isinstance(value, dict) or set(value) != {"query", "candidates"}:
        raise InvalidWorkerInput("Invalid public query payload.")
    query = value["query"]
    if not isinstance(query, str) or not 2 <= len(query) <= 200:
        raise InvalidWorkerInput("Invalid public query.")
    if (
        not isinstance(value["candidates"], list)
        or len(value["candidates"]) > MAX_CANDIDATES
    ):
        raise InvalidWorkerInput("Invalid candidates.")
    candidates = [
        _record(candidate, "candidate", optional_content=True)
        for candidate in value["candidates"]
    ]
    ids = [candidate["id"] for candidate in candidates]
    if len(ids) != len(set(ids)):
        raise InvalidWorkerInput("Candidate identifiers must be distinct.")
    return query, candidates


def _optional_fasttext_model() -> Any | None:
    """Load contextual support for search without making it a dependency."""
    model_path = os.environ.get("SIMILARITY_FASTTEXT_MODEL_PATH", "")
    if not model_path or not Path(model_path).is_file():
        return None
    try:
        import fasttext  # type: ignore[import-not-found]

        return fasttext.load_model(model_path)
    except (ImportError, OSError, RuntimeError, ValueError):
        return None


def main() -> None:
    raw_bytes = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
    if len(raw_bytes) > MAX_INPUT_BYTES:
        _error("INVALID_INPUT", 2)
    try:
        raw = raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        _error("INVALID_INPUT", 2)
    try:
        value = json.loads(raw)
        if isinstance(value, dict) and set(value) == {"query", "candidates"}:
            query, candidates = _query_payload(raw)
            is_public_query = True
        else:
            source, candidates = _payload(raw)
            is_public_query = False
    except (InvalidWorkerInput, TypeError, ValueError, json.JSONDecodeError):
        _error("INVALID_INPUT", 2)

    try:
        if is_public_query:
            # TF-IDF/cosine remains the official rank. FastText contributes an
            # independent semantic support score when a model is configured.
            results = compare_query(query, candidates, _optional_fasttext_model())
        else:
            # FastText is contextual support only on both protocols. Its model,
            # package, or runtime must never make official TF-IDF unavailable.
            results = compare_titles(source, candidates, _optional_fasttext_model())
    except ArithmeticError:
        _error("PROCESSING_FAILED", 4)
    except (TypeError, ValueError):
        _error("PROCESSING_FAILED", 4)
    sys.stdout.write(
        json.dumps({"results": results}, ensure_ascii=False, separators=(",", ":"))
    )
    sys.stdout.flush()


if __name__ == "__main__":
    main()
