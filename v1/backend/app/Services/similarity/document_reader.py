"""Safe, bounded local PDF/DOCX text extraction."""

from __future__ import annotations

from collections.abc import Iterable, Iterator
from pathlib import Path
from typing import BinaryIO
import logging
import warnings
from xml.etree import ElementTree
from zipfile import ZIP_DEFLATED, ZipFile

import pymupdf  # type: ignore[import-untyped]


MAX_DOCUMENT_BYTES = 25 * 1024 * 1024
MAX_EXTRACTED_CHARACTERS = 1_000_000
MAX_PDF_PAGES = 500
MAX_DOCX_ENTRIES = 2_000
MAX_DOCX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
MAX_DOCX_COMPRESSION_RATIO = 100


class DocumentReadError(ValueError):
    """A deliberately generic error that never discloses a document path."""


def extract_text(document_path: str | Path) -> str:
    """Extract PDF/DOCX text without logging paths, filenames, or content.

    Callers receive a generic error for absent, malformed, oversized, or
    unsupported documents so private storage details cannot cross a process/API
    boundary.
    """
    try:
        path = Path(document_path)
        if (
            not path.is_file()
            or path.is_symlink()
            or path.stat().st_size > MAX_DOCUMENT_BYTES
        ):
            raise DocumentReadError("Document could not be read.")
        with path.open("rb") as stream:
            if path.suffix.casefold() == ".pdf":
                text = _pdf_text(stream)
            elif path.suffix.casefold() == ".docx":
                text = _docx_text(stream)
            else:
                raise DocumentReadError("Document type is not supported.")
    except DocumentReadError:
        raise
    except Exception:
        # Do not chain the original exception: library messages can include paths.
        raise DocumentReadError("Document could not be read.") from None

    if len(text) > MAX_EXTRACTED_CHARACTERS:
        raise DocumentReadError("Document could not be read.")
    return text


def extract_parts(document_path: str | Path, maximum_part_characters: int) -> list[str]:
    """Extract sequential bounded parts without materializing one full text string."""
    if maximum_part_characters < 1:
        raise DocumentReadError("Document could not be read.")
    try:
        path = Path(document_path)
        if not path.is_file() or path.is_symlink() or path.stat().st_size > MAX_DOCUMENT_BYTES:
            raise DocumentReadError("Document could not be read.")
        with path.open("rb") as stream:
            if path.suffix.casefold() == ".pdf":
                units = _pdf_units(stream)
            elif path.suffix.casefold() == ".docx":
                units = _docx_units(stream)
            else:
                raise DocumentReadError("Document type is not supported.")
            return _parts_from_units(units, maximum_part_characters)
    except DocumentReadError:
        raise
    except Exception:
        raise DocumentReadError("Document could not be read.") from None


def _pdf_text(stream: BinaryIO) -> str:
    return _join_text(_pdf_units(stream))


def _pdf_units(stream: BinaryIO) -> Iterator[str]:
    # This is the private reader boundary. Suppress parser diagnostics here and
    # let extract_text return its intentionally sanitized failure instead of
    # leaking document details.
    previous_disable_level = logging.root.manager.disable
    logging.disable(logging.CRITICAL)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            stream.seek(0)
            with pymupdf.open(stream=stream.read(), filetype="pdf") as document:
                if document.needs_pass and document.authenticate("") == 0:
                    raise DocumentReadError("Document could not be read.")
                if document.page_count > MAX_PDF_PAGES:
                    raise DocumentReadError("Document could not be read.")
                for index in range(document.page_count):
                    yield document.load_page(index).get_text("text", sort=True)
    finally:
        logging.disable(previous_disable_level)


def _docx_text(stream: BinaryIO) -> str:
    return _join_text(_docx_units(stream))


def _docx_units(stream: BinaryIO) -> Iterator[str]:
    _validate_docx_zip(stream)
    stream.seek(0)
    with ZipFile(stream) as archive:
        try:
            document_xml = archive.read("word/document.xml")
        except KeyError:
            raise DocumentReadError("Document could not be read.") from None

    root = ElementTree.fromstring(document_xml)
    word_namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    for paragraph in root.iter(f"{word_namespace}p"):
        yield "".join(node.text or "" for node in paragraph.iter(f"{word_namespace}t"))


def _parts_from_units(units: Iterable[object], limit: int) -> list[str]:
    parts: list[str] = []
    current = ""
    total = 0
    for unit in units:
        if not isinstance(unit, str):
            continue
        for word in unit.split():
            addition = word if not current else f" {word}"
            if current and len(current) + len(addition) > limit:
                parts.append(current + " ")
                total += len(current) + 1
                current = word
            else:
                current += addition
            if total + len(current) > MAX_EXTRACTED_CHARACTERS:
                raise DocumentReadError("Document could not be read.")
    if current:
        parts.append(current)
    return parts


def _join_text(parts: Iterable[object]) -> str:
    text: list[str] = []
    characters = 0
    for part in parts:
        if not isinstance(part, str) or not (cleaned := part.strip()):
            continue
        characters += len(cleaned) + (1 if text else 0)
        if characters > MAX_EXTRACTED_CHARACTERS:
            raise DocumentReadError("Document could not be read.")
        text.append(cleaned)
    return "\n".join(text)


def _validate_docx_zip(stream: BinaryIO) -> None:
    """Reject ZIP bombs before python-docx expands OOXML entries."""
    with ZipFile(stream) as archive:
        entries = archive.infolist()
        if len(entries) > MAX_DOCX_ENTRIES:
            raise DocumentReadError("Document could not be read.")

        total_uncompressed = 0
        for entry in entries:
            if entry.is_dir() or entry.filename.endswith("/"):
                continue
            if entry.flag_bits & 0x1 or entry.compress_type not in (0, ZIP_DEFLATED):
                raise DocumentReadError("Document could not be read.")
            if entry.file_size < 0 or entry.compress_size < 0:
                raise DocumentReadError("Document could not be read.")
            total_uncompressed += entry.file_size
            if total_uncompressed > MAX_DOCX_UNCOMPRESSED_BYTES:
                raise DocumentReadError("Document could not be read.")
            if entry.file_size > 0 and entry.compress_size == 0:
                raise DocumentReadError("Document could not be read.")
            if (
                entry.compress_size > 0
                and entry.file_size / entry.compress_size > MAX_DOCX_COMPRESSION_RATIO
            ):
                raise DocumentReadError("Document could not be read.")
