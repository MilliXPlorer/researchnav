import io
import unittest
from unittest.mock import MagicMock, patch
from zipfile import ZIP_DEFLATED, ZipFile

from similarity.document_reader import (
    DocumentReadError,
    MAX_DOCX_COMPRESSION_RATIO,
    MAX_PDF_PAGES,
    _docx_text,
    _pdf_text,
)


class DocumentReaderTest(unittest.TestCase):
    def test_pdf_page_cap_is_enforced_before_text_is_read(self):
        reader = MagicMock()
        reader.is_encrypted = False
        reader.pages = [MagicMock()] * (MAX_PDF_PAGES + 1)
        with patch("similarity.document_reader.PdfReader", return_value=reader):
            with self.assertRaises(DocumentReadError):
                _pdf_text(io.BytesIO(b"pdf"))

    def test_docx_compression_ratio_is_rejected_before_parser_runs(self):
        stream = io.BytesIO()
        with ZipFile(stream, "w", ZIP_DEFLATED) as archive:
            archive.writestr("word/document.xml", b"a" * (MAX_DOCX_COMPRESSION_RATIO * 1000))
        stream.seek(0)
        with self.assertRaises(DocumentReadError):
            _docx_text(stream)
