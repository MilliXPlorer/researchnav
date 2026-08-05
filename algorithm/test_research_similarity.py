import contextlib
import io
import tempfile
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from research_similarity import (
    Study,
    SimilarityResult,
    _print_table,
    check_similarity,
    classify,
    extract_title,
    find_keyword_matches,
    keyword_context,
    keyword_occurrence_count,
    level_range,
    parse_keywords,
)


class ResearchSimilarityTests(unittest.TestCase):
    def test_extracts_multiline_docx_title_without_reading_media(self) -> None:
        document_xml = """<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>HEALTHLINK: A MOBILE AND WEB-BASED</w:t></w:r></w:p>
    <w:p><w:r><w:t>HEALTH INFORMATION SYSTEM</w:t></w:r></w:p>
    <w:p><w:r><w:t>A Research Proposal Presented to the</w:t></w:r></w:p>
  </w:body>
</w:document>"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "study.docx"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("word/document.xml", document_xml)
                archive.writestr("word/media/image1.png", b"not an image")

            self.assertEqual(
                extract_title(path),
                "HEALTHLINK: A MOBILE AND WEB-BASED HEALTH INFORMATION SYSTEM",
            )

    @mock.patch("research_similarity.PdfReader")
    def test_extracts_title_from_pdf_text(self, pdf_reader: mock.Mock) -> None:
        pdf_reader.return_value.pages = [
            SimpleNamespace(
                extract_text=lambda: (
                    "SMART ARCHIVE: A DIGITAL REPOSITORY SYSTEM\n"
                    "A Research Proposal Presented to the\n"
                    "Faculty of Computing"
                )
            )
        ]

        title = extract_title(Path("study.pdf"))

        self.assertEqual(title, "SMART ARCHIVE: A DIGITAL REPOSITORY SYSTEM")

    def test_exact_title_is_ranked_first(self) -> None:
        studies = [
            Study(
                "Smart Attendance Monitoring System Using QR Code",
                "attendance.docx",
            ),
            Study("Inventory and Procurement Management System", "inventory.docx"),
            Study("Community Extension Planning and Mapping", "mapping.docx"),
        ]

        results = check_similarity(
            "Smart Attendance Monitoring System Using QR Code", studies
        )

        self.assertEqual(results[0].file, "attendance.docx")
        self.assertEqual(results[0].similarity_score, 100.0)
        self.assertEqual(results[0].level, "High")

    def test_similarity_thresholds(self) -> None:
        self.assertEqual(classify(39.99), "Low")
        self.assertEqual(classify(40.0), "Moderate")
        self.assertEqual(classify(69.99), "Moderate")
        self.assertEqual(classify(70.0), "High")
        self.assertEqual(level_range("Low"), "0%-39%")
        self.assertEqual(level_range("Moderate"), "40%-69%")
        self.assertEqual(level_range("High"), "70%-100%")

    def test_fasttext_context_does_not_change_final_score(self) -> None:
        results = check_similarity(
            "educational",
            [Study("Education System", "education.docx")],
        )

        self.assertEqual(results[0].similarity_score, 0.0)
        self.assertGreater(results[0].fasttext_context_score, 0.0)
        self.assertEqual(results[0].level, "Low")

    def test_finds_repeated_or_title_keyword_as_whole_word(self) -> None:
        studies = [
            Study(
                "Student Risk Prediction",
                "risk.docx",
                "Machine-learning supports prediction. Machine learning finds risk.",
            ),
            Study(
                "Laboratory Inventory",
                "inventory.docx",
                "Machine learning is only mentioned incidentally.",
            ),
            Study("Machine Learning Portal", "portal.docx", "Short description."),
            Study("Machine Learning Portal", "portal-copy.docx", "Duplicate copy."),
        ]

        matches = find_keyword_matches("machine learning", studies)

        self.assertEqual(
            [study.file for study in matches],
            ["risk.docx", "portal.docx"],
        )
        self.assertEqual(find_keyword_matches("learn", studies), [])
        self.assertEqual(
            keyword_occurrence_count("machine learning", studies[0].content),
            2,
        )
        context = keyword_context("machine learning", studies[0].content, window=2)
        self.assertIn("machine learning", context)
        self.assertNotIn("short description", context)

    def test_multiple_keywords_match_any_keyword(self) -> None:
        studies = [
            Study("Attendance Portal", "attendance.docx", "Short description."),
            Study(
                "Student Forecasting",
                "forecast.docx",
                "Machine learning predicts enrollment. Machine learning helps.",
            ),
            Study("Health Records", "health.docx", "Community healthcare system."),
        ]

        keywords = parse_keywords("attendance, machine learning, attendance")
        matches = find_keyword_matches(keywords, studies)

        self.assertEqual(keywords, ["attendance", "machine learning"])
        self.assertEqual(
            [study.file for study in matches],
            ["attendance.docx", "forecast.docx"],
        )

    def test_parses_quoted_keyword_groups(self) -> None:
        self.assertEqual(
            parse_keywords('"inventory" "attendance" "machine learning"'),
            ["inventory", "attendance", "machine learning"],
        )
        with self.assertRaisesRegex(ValueError, "invalid quoted keywords"):
            parse_keywords('"unfinished keyword')

    def test_console_results_use_wrapped_numbered_layout(self) -> None:
        result = SimilarityResult(
            title="A " + "VERY LONG RESEARCH TITLE " * 8,
            file="study.docx",
            similarity_score=50.0,
            fasttext_context_score=40.0,
            level="Moderate",
            keyword_occurrences=70,
            matched_keywords=("education", "study"),
            keyword_mentions=(("education", 50), ("study", 20)),
        )
        output = io.StringIO()

        with contextlib.redirect_stdout(output):
            _print_table("education", [result], 11, True, 1)

        lines = output.getvalue().splitlines()
        self.assertIn("[01]", output.getvalue())
        self.assertIn("Final TF-IDF + cosine", output.getvalue())
        self.assertIn("supporting only", output.getvalue())
        self.assertIn("Level: Moderate [40%-69%]", output.getvalue())
        self.assertIn("Similarity ranges", output.getvalue())
        self.assertIn("education (50) | study (20)", output.getvalue())
        self.assertIn("Total keyword mentions: 70", output.getvalue())
        self.assertTrue(all(len(line) <= 110 for line in lines))


if __name__ == "__main__":
    unittest.main()
