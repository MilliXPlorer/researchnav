import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from similarity.document_reader import (
    DocumentReadError,
    MAX_PDF_PAGES,
    _pdf_text,
    extract_text,
)


class DocumentReaderTest(unittest.TestCase):
    def test_pdf_page_cap_is_enforced_before_text_is_read(self):
        document = MagicMock()
        document.__enter__.return_value = document
        document.page_count = MAX_PDF_PAGES + 1
        document.needs_pass = False
        with patch("similarity.document_reader.pymupdf.open", return_value=document):
            with self.assertRaises(DocumentReadError):
                _pdf_text(io.BytesIO(b"pdf"))

    def test_docx_is_not_supported(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manuscript.docx"
            path.write_bytes(b"legacy-docx")
            with self.assertRaises(DocumentReadError):
                extract_text(path)
