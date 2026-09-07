"""Safe, bounded local PDF/DOCX text extraction."""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path
from typing import BinaryIO
import logging
import warnings
from xml.etree import ElementTree
from zipfile import ZIP_DEFLATED, ZipFile

from pypdf import PdfReader


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


def _pdf_text(stream: BinaryIO) -> str:
    # pypdf emits parser warnings for malformed input. This is the private
    # reader boundary, so suppress them here and let extract_text return its
    # intentionally sanitized failure instead of leaking parser diagnostics.
    # pypdf uses child loggers (for example ``pypdf._reader``), so disabling
    # only the named parent does not suppress records captured by an embedding
    # process. Suppress logging for this private parser call and restore it.
    previous_disable_level = logging.root.manager.disable
    logging.disable(logging.CRITICAL)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            reader = PdfReader(stream)
            if reader.is_encrypted and reader.decrypt("") == 0:
                raise DocumentReadError("Document could not be read.")
            if len(reader.pages) > MAX_PDF_PAGES:
                raise DocumentReadError("Document could not be read.")
            return _join_text(page.extract_text() or "" for page in reader.pages)
    finally:
        logging.disable(previous_disable_level)


def _docx_text(stream: BinaryIO) -> str:
    _validate_docx_zip(stream)
    stream.seek(0)
    with ZipFile(stream) as archive:
        try:
            document_xml = archive.read("word/document.xml")
        except KeyError:
            raise DocumentReadError("Document could not be read.") from None

    root = ElementTree.fromstring(document_xml)
    word_namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    parts = [
        "".join(node.text or "" for node in paragraph.iter(f"{word_namespace}t"))
        for paragraph in root.iter(f"{word_namespace}p")
    ]
    return _join_text(parts)


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
