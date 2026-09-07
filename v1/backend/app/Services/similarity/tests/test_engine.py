import json
import subprocess
import sys
from pathlib import Path

from similarity.engine import compare_query, compare_titles, decimal_score, title_tokens
from similarity.stopwords import preprocess_title


class FakeFastText:
    def get_sentence_vector(self, text: str) -> list[float]:
        return [float(len(text)), 1.0]


def test_worker_emits_independent_twelve_decimal_components_not_a_final_score() -> None:
    result = compare_titles(
        {"id": 1, "title": "Climate Change and Water", "content": "water climate"},
        [{"id": 2, "title": "Water Climate Change", "content": "water climate"}],
        FakeFastText(),
    )[0]

    assert set(result) == {
        "matched_research_id", "title_similarity_score", "content_similarity_score",
        "fasttext_score", "matched_terms", "contextual_analysis",
    }
    assert result["title_similarity_score"] == "1.000000000000"
    assert result["content_similarity_score"] == "1.000000000000"
    assert float(result["fasttext_score"]) > 0
    assert "final_similarity_score" not in result


def test_unavailable_content_has_a_title_component_but_no_fake_zero_content_score() -> None:
    result = compare_titles(
        {"id": 1, "title": "Climate Water"},
        [{"id": 2, "title": "Climate Water", "content": "unavailable is omitted"}],
        FakeFastText(),
    )[0]

    assert result["title_similarity_score"] == "1.000000000000"
    assert result["content_similarity_score"] is None


def test_public_query_uses_ready_content_only_and_keeps_fasttext_supporting_only() -> None:
    results = compare_query(
        "education artificial intelligence",
        [
            {"id": 2, "title": "Unrelated", "content": "education artificial intelligence"},
            {"id": 3, "title": "Unrelated"},
        ],
        None,
    )

    assert results[0]["content_similarity_score"] == "1.000000000000"
    assert results[1]["content_similarity_score"] is None
    assert all(result["fasttext_support_score"] is None for result in results)


def test_preprocessing_and_score_precision_are_preserved() -> None:
    assert title_tokens("The AI in Education") == ["ai", "education"]
    assert preprocess_title("The AI & WATER-based Study: an Overview") == ["ai", "water", "based", "study", "overview"]
    assert decimal_score(0.1234567890127) == "0.123456789013"


def test_preprocessing_keeps_unicode_and_removes_only_versioned_stopwords() -> None:
    assert title_tokens("The Café and Éducation Study") == ["café", "éducation", "study"]
    assert title_tokens("the and with") == []


def test_ranking_uses_title_then_candidate_identifier_when_components_tie() -> None:
    results = compare_query(
        "climate water",
        [
            {"id": 9, "title": "Water Climate"},
            {"id": 2, "title": "Climate Water"},
        ],
        None,
    )

    assert [result["matched_research_id"] for result in results] == [2, 9]
    assert all(result["content_similarity_score"] is None for result in results)


def test_empty_candidates_and_stopword_only_text_do_not_create_fake_scores() -> None:
    assert compare_query("the and", [], None) == []
    result = compare_query("the and", [{"id": 2, "title": "the and"}], None)[0]
    assert result["title_similarity_score"] == "0.000000000000"
    assert result["content_similarity_score"] is None


def test_fasttext_support_is_not_used_for_official_tfidf_component_ranking() -> None:
    results = compare_query(
        "climate water",
        [
            {"id": 2, "title": "climate water"},
            {"id": 3, "title": "unrelated"},
        ],
        FakeFastText(),
    )

    assert [result["matched_research_id"] for result in results] == [2, 3]
    assert results[0]["fasttext_support_score"] is not None
    assert "overall_similarity_score" not in results[0]


def test_cli_accepts_missing_content_for_a_title_only_safeguard() -> None:
    cli = Path(__file__).resolve().parents[1] / "cli.py"
    completed = subprocess.run(
        [sys.executable, str(cli)],
        input=json.dumps({"source": {"id": 1, "title": "Source"}, "candidates": [{"id": 2, "title": "Candidate"}]}),
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode == 0
    result = json.loads(completed.stdout)["results"][0]
    assert result["fasttext_score"] is None
    assert result["contextual_analysis"] == "FastText supporting context unavailable."


def test_cli_rejects_duplicate_identifiers_and_unexpected_protocol_keys() -> None:
    cli = Path(__file__).resolve().parents[1] / "cli.py"
    for payload in (
        {"query": "climate", "candidates": [{"id": 2, "title": "one"}, {"id": 2, "title": "two"}]},
        {"query": "climate", "candidates": [], "unexpected": True},
    ):
        completed = subprocess.run(
            [sys.executable, str(cli)],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            check=False,
        )

        assert completed.returncode == 2
        assert json.loads(completed.stdout) == {"error": {"code": "INVALID_INPUT"}}
