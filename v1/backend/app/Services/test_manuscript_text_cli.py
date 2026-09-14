import io
import json
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

import manuscript_text_cli


class ManuscriptTextCliTest(unittest.TestCase):
    def test_invalid_arguments_return_only_generic_json(self):
        output = io.StringIO()
        with redirect_stdout(output):
            code = manuscript_text_cli.main(["worker"])

        self.assertEqual(1, code)
        self.assertEqual(
            {"status": "failed", "parts": []}, json.loads(output.getvalue())
        )

    def test_success_normalizes_extracted_text(self):
        output = io.StringIO()
        with patch("manuscript_text_cli.extract_parts", return_value=["body ", "text"]):
            with redirect_stdout(output):
                code = manuscript_text_cli.main(["worker", "/owned/path"])

        self.assertEqual(0, code)
        self.assertEqual(
            {"status": "ready", "parts": ["body ", "text"]}, json.loads(output.getvalue())
        )
