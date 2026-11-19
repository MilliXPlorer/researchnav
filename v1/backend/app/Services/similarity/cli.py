"""JSON stdin/stdout entry point for Laravel's similarity process boundary."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, NoReturn

try:
    from .engine import (
        InvalidUploadedContentScope,
        uploaded_content_scope_diagnostic,
        InvalidWorkerInput,
        SimilarityCapacityExceeded,
        compare_query,
        compare_titles,
    )
except ImportError:  # Direct script execution from Laravel's fixed command.
    from engine import (  # type: ignore[import-not-found,no-redef]
        InvalidUploadedContentScope,
        uploaded_content_scope_diagnostic,
        InvalidWorkerInput,
        SimilarityCapacityExceeded,
        compare_query,
        compare_titles,
    )


def _bounded_environment_integer(name: str, default: int, maximum: int) -> int:
    try:
        value = int(os.environ.get(name, str(default)))
    except ValueError:
        return default
    return min(maximum, max(1, value))


MAX_INPUT_BYTES = _bounded_environment_integer(
    "SIMILARITY_MAXIMUM_INPUT_BYTES", 256 * 1024 * 1024, 512 * 1024 * 1024
)
MAX_CANDIDATES = _bounded_environment_integer(
    "SIMILARITY_MAXIMUM_CANDIDATES", 1000, 1000
)
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
    optional_metadata: bool = False,
) -> dict[str, Any]:
    expected = {"id", "title", "content"} if with_content else {"id", "title"}
    valid_keys = [expected]
    if optional_content:
        valid_keys.append({"id", "title", "content"})
    if optional_metadata:
        valid_keys.extend([
            {"id", "title", "metadata"},
            {"id", "title", "metadata", "content"},
        ])
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
    if "metadata" in value and (
        not isinstance(value["metadata"], str)
        or len(value["metadata"]) > MAX_CONTENT_LENGTH
    ):
        raise InvalidWorkerInput(f"Invalid {field} metadata.")
    return value


def _payload(raw: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    value = json.loads(raw)
    if not isinstance(value, dict) or set(value) != {"source", "candidates"}:
        raise InvalidWorkerInput("Invalid worker payload.")
    source = _record(value["source"], "source", optional_content=True)
    if not isinstance(value["candidates"], list):
        raise InvalidWorkerInput("Invalid candidates.")
    if len(value["candidates"]) > MAX_CANDIDATES:
        raise SimilarityCapacityExceeded("Candidate capacity exceeded.")
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
    if not isinstance(value["candidates"], list):
        raise InvalidWorkerInput("Invalid candidates.")
    if len(value["candidates"]) > MAX_CANDIDATES:
        raise SimilarityCapacityExceeded("Candidate capacity exceeded.")
    candidates = [
        _record(candidate, "candidate", optional_content=True, optional_metadata=True)
        for candidate in value["candidates"]
    ]
    ids = [candidate["id"] for candidate in candidates]
    if len(ids) != len(set(ids)):
        raise InvalidWorkerInput("Candidate identifiers must be distinct.")
    return query, candidates


def _uploaded_content_payload(raw: str) -> tuple[str, list[dict[str, Any]]]:
    value = json.loads(raw)
    if not isinstance(value, dict) or set(value) != {"uploaded_content", "candidates"}:
        raise InvalidWorkerInput("Invalid uploaded content payload.")
    uploaded_content = value["uploaded_content"]
    if (
        not isinstance(uploaded_content, str)
        or not uploaded_content.strip()
        or len(uploaded_content) > MAX_CONTENT_LENGTH
    ):
        raise InvalidWorkerInput("Invalid uploaded content.")
    if not isinstance(value["candidates"], list):
        raise InvalidWorkerInput("Invalid candidates.")
    if len(value["candidates"]) > MAX_CANDIDATES:
        raise SimilarityCapacityExceeded("Candidate capacity exceeded.")
    candidates = [
        _record(candidate, "candidate", optional_content=True)
        for candidate in value["candidates"]
    ]
    ids = [candidate["id"] for candidate in candidates]
    if len(ids) != len(set(ids)):
        raise InvalidWorkerInput("Candidate identifiers must be distinct.")
    return uploaded_content, candidates


def _scope_batch_payload(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, dict) or set(value) != {"scope_texts"}:
        raise InvalidWorkerInput("Invalid scope batch payload.")
    scope_texts = value["scope_texts"]
    if not isinstance(scope_texts, list) or not 1 <= len(scope_texts) <= 20:
        raise InvalidWorkerInput("Invalid scope texts.")
    validated = []
    for item in scope_texts:
        if not isinstance(item, dict) or set(item) != {"text", "require_chapter_one"}:
            raise InvalidWorkerInput("Invalid scope text record.")
        if not isinstance(item["text"], str) or not item["text"].strip() or len(item["text"]) > MAX_CONTENT_LENGTH:
            raise InvalidWorkerInput("Invalid scope text.")
        if not isinstance(item["require_chapter_one"], bool):
            raise InvalidWorkerInput("Invalid scope mode.")
        validated.append(item)
    return validated


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
        is_scope_diagnostic = False
        is_scope_batch = False
        if isinstance(value, dict) and set(value) == {"query", "candidates"}:
            query, candidates = _query_payload(raw)
            is_public_query = True
            is_uploaded_content = False
        elif isinstance(value, dict) and set(value) in ({"scope_text"}, {"scope_text", "require_chapter_one"}):
            scope_text = value["scope_text"]
            if not isinstance(scope_text, str) or not scope_text.strip() or len(scope_text) > MAX_CONTENT_LENGTH:
                raise InvalidWorkerInput("Invalid scope text.")
            query = scope_text
            candidates = []
            is_public_query = False
            is_uploaded_content = False
            is_scope_diagnostic = True
            require_chapter_one = value.get("require_chapter_one", True)
            if not isinstance(require_chapter_one, bool):
                raise InvalidWorkerInput("Invalid scope mode.")
        elif isinstance(value, dict) and set(value) == {"scope_texts"}:
            scope_texts = _scope_batch_payload(value)
            is_public_query = False
            is_uploaded_content = False
            is_scope_batch = True
        elif isinstance(value, dict) and set(value) == {
            "uploaded_content",
            "candidates",
        }:
            query, candidates = _uploaded_content_payload(raw)
            is_public_query = True
            is_uploaded_content = True
            is_scope_diagnostic = False
        else:
            source, candidates = _payload(raw)
            is_public_query = False
            is_scope_diagnostic = False
    except SimilarityCapacityExceeded:
        _error("CAPACITY_EXCEEDED", 3)
    except (InvalidWorkerInput, TypeError, ValueError, json.JSONDecodeError):
        _error("INVALID_INPUT", 2)

    try:
        if is_scope_batch:
            batch_results = []
            for item in scope_texts:
                try:
                    chapters = uploaded_content_scope_diagnostic(
                        item["text"], item["require_chapter_one"]
                    )["chapters"]
                    batch_results.append({"status": "valid", "chapters": chapters})
                except InvalidUploadedContentScope as exception:
                    if exception.reason != "chapter_one_not_found":
                        raise
                    batch_results.append({"status": "supporting", "chapters": []})
            results = {"results": batch_results}
        elif is_scope_diagnostic:
            results = uploaded_content_scope_diagnostic(query, require_chapter_one)
        elif is_public_query:
            if is_uploaded_content:
                # Upload content is fully deterministic and must not even load
                # optional FastText support.
                results = compare_query(query, candidates, None, uploaded_content=True)
            else:
                # TF-IDF/cosine remains the official rank. FastText contributes
                # an independent semantic support score when configured.
                results = compare_query(
                    query,
                    candidates,
                    _optional_fasttext_model(),
                )
        else:
            # FastText is contextual support only on both protocols. Its model,
            # package, or runtime must never make official TF-IDF unavailable.
            results = compare_titles(source, candidates, _optional_fasttext_model())
    except SimilarityCapacityExceeded:
        _error("CAPACITY_EXCEEDED", 3)
    except InvalidUploadedContentScope as exception:
        _error(exception.reason.upper(), 2)
    except ArithmeticError:
        _error("PROCESSING_FAILED", 4)
    except (TypeError, ValueError):
        _error("PROCESSING_FAILED", 4)
    response = results if is_scope_diagnostic or is_scope_batch else {"results": results}
    sys.stdout.write(json.dumps(response, ensure_ascii=False, separators=(",", ":")))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
