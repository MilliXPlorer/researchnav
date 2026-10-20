import json
import os
import subprocess
import sys
from io import BytesIO, StringIO
from pathlib import Path

from similarity import cli as cli_module
from similarity.engine import (
    InvalidWorkerInput,
    compare_query,
    compare_titles,
    decimal_score,
    matched_terms,
    title_tokens,
)
import similarity.engine as engine_module
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
        "matched_research_id",
        "title_similarity_score",
        "content_similarity_score",
        "fasttext_score",
        "matched_terms",
        "contextual_analysis",
    }
    assert result["title_similarity_score"] == "1.000000000000"
    assert result["content_similarity_score"] == "1.000000000000"
    assert float(result["fasttext_score"]) > 0
    assert "final_similarity_score" not in result


def test_unavailable_content_has_a_title_component_but_no_fake_zero_content_score() -> (
    None
):
    result = compare_titles(
        {"id": 1, "title": "Climate Water"},
        [{"id": 2, "title": "Climate Water", "content": "unavailable is omitted"}],
        FakeFastText(),
    )[0]

    assert result["title_similarity_score"] == "1.000000000000"
    assert result["content_similarity_score"] is None


def test_public_query_uses_ready_content_only_and_keeps_fasttext_supporting_only() -> (
    None
):
    results = compare_query(
        "education artificial intelligence",
        [
            {
                "id": 2,
                "title": "Unrelated",
                "content": "education artificial intelligence",
            },
            {"id": 3, "title": "Unrelated"},
        ],
        None,
    )

    assert results[0]["content_similarity_score"] == "1.000000000000"
    assert results[1]["content_similarity_score"] is None
    assert all(result["fasttext_support_score"] is None for result in results)


def test_matched_terms_exclude_numeric_ordinals_and_symbol_noise() -> None:
    assert matched_terms(
        [
            "00",
            "1080",
            "2024",
            "1st",
            "2nd",
            "3rd",
            "21st",
            "2.5",
            "50%",
            "3,000",
            "____",
            "----",
            "++++",
            "//",
            "...",
            "===",
            "***",
            "___---",
            "/////",
            "",
            " ",
            "academic",
            "performance",
            "students",
            "research",
            "learning",
            "covid-19",
            "5g",
            "c++",
            "e-learning",
            "k-12",
            "r&d",
        ],
        [
            "00",
            "1080",
            "2024",
            "1st",
            "2nd",
            "3rd",
            "21st",
            "2.5",
            "50%",
            "3,000",
            "____",
            "----",
            "++++",
            "//",
            "...",
            "===",
            "***",
            "___---",
            "/////",
            "",
            " ",
            "academic",
            "performance",
            "students",
            "research",
            "learning",
            "covid-19",
            "5g",
            "c++",
            "e-learning",
            "k-12",
            "r&d",
        ],
    ) == [
        "5g",
        "academic",
        "c++",
        "covid-19",
        "e-learning",
        "k-12",
        "learning",
        "performance",
        "r&d",
        "research",
        "students",
    ]


def test_shared_term_filter_does_not_change_uploaded_content_scores_or_ranking() -> (
    None
):
    results = compare_query(
        "CHAPTER 1\n2024 03 1st climate water",
        [
            {
                "id": 2,
                "title": "Unrelated",
                "content": "CHAPTER 1\n2024 03 1st astronomy geology",
            },
            {
                "id": 3,
                "title": "Unrelated",
                "content": "CHAPTER 1\n2024 03 climate water",
            },
        ],
        None,
        uploaded_content=True,
    )

    assert results[0]["matched_terms"] == ["climate", "water"]
    assert results[0]["content_similarity_score"] != "0.000000000000"
    assert results[1]["matched_terms"] == []
    # Ordinals participate in standalone scoring even though they are not
    # surfaced as matched-term display text.
    assert results[1]["content_similarity_score"] != "0.000000000000"
    assert [result["matched_research_id"] for result in results] == [3, 2]


def test_uploaded_content_preserves_ordinals_so_different_ordinals_are_not_false_hundreds() -> (
    None
):
    result = compare_query(
        "CHAPTER 1\nshared 1st finding",
        [{"id": 2, "title": "Candidate", "content": "CHAPTER 1\nshared 2nd finding"}],
        None,
        uploaded_content=True,
    )[0]

    assert 0 < float(result["content_similarity_score"]) < 1
    assert "1st" not in result["matched_terms"]


def test_content_display_terms_are_limited_by_utf8_bytes_without_changing_shared_terms() -> None:
    ascii_too_long = "a" * 101
    multibyte_valid = "界" * 33
    multibyte_too_long = "界" * 34

    assert matched_terms([ascii_too_long], [ascii_too_long]) == []
    assert matched_terms([multibyte_too_long], [multibyte_too_long]) == [multibyte_too_long]
    assert matched_terms([multibyte_valid], [multibyte_valid]) == [multibyte_valid]
    valid_terms = [f"word{index:02d}" for index in range(32)]
    assert (
        matched_terms([ascii_too_long, *valid_terms], [ascii_too_long, *valid_terms])
        == valid_terms
    )


def test_uploaded_content_ranks_exact_content_match_ahead_of_title_match() -> None:
    results = compare_query(
        "CHAPTER 1\nexact archived manuscript content",
        [
            {
                "id": 2,
                "title": "Exact Archived Manuscript Content",
                "content": "CHAPTER 1\ndifferent candidate body",
            },
            {
                "id": 3,
                "title": "Unrelated title",
                "content": "CHAPTER 1\nexact archived manuscript content",
            },
        ],
        None,
        uploaded_content=True,
    )

    assert [result["matched_research_id"] for result in results] == [3]
    assert results[0]["content_similarity_score"] == "1.000000000000"
    assert results[0]["title_similarity_score"] == "0.000000000000"


def test_shared_term_filter_keeps_title_and_content_scores_unchanged() -> None:
    query = "CHAPTER 1\nacademic performance students 2024"
    candidate = {
        "id": 2,
        "title": "Academic Performance",
        "content": "CHAPTER 1\nacademic performance students 2024",
    }
    result = compare_query(
        query,
        [candidate],
        None,
        uploaded_content=True,
    )[0]
    assert result["matched_terms"] == ["academic", "performance", "students"]
    assert result["title_similarity_score"] == "0.000000000000"
    assert result["content_similarity_score"] == "1.000000000000"


def test_uploaded_content_never_uses_fasttext_support() -> None:
    class RecordingFastText:
        def __init__(self) -> None:
            self.texts: list[str] = []

        def get_sentence_vector(self, text: str) -> list[float]:
            self.texts.append(text)
            return [float(len(text)), 1.0]

    model = RecordingFastText()
    result = compare_query(
        "CHAPTER 1\n2024 climate",
        [{"id": 2, "title": "Unrelated", "content": "CHAPTER 1\n2024 climate"}],
        model,
        uploaded_content=True,
    )[0]

    assert model.texts == []
    assert result["fasttext_support_score"] is None
    assert result["matched_terms"] == ["climate"]


def test_cli_does_not_load_fasttext_for_uploaded_content(monkeypatch) -> None:
    class Stdin:
        def __init__(self, payload: str) -> None:
            self.buffer = BytesIO(payload.encode("utf-8"))

    def unexpected_loader() -> None:
        raise AssertionError("FastText loader was called for uploaded content")

    output = StringIO()
    monkeypatch.setattr(cli_module, "_optional_fasttext_model", unexpected_loader)
    monkeypatch.setattr(
        cli_module,
        "sys",
        type(
            "System",
            (),
            {
                "stdin": Stdin(
                    json.dumps(
                        {
                            "uploaded_content": "CHAPTER 1\nshared body",
                            "candidates": [
                                {
                                    "id": 2,
                                    "title": "Candidate",
                                    "content": "CHAPTER 1\nshared body",
                                }
                            ],
                        }
                    )
                ),
                "stdout": output,
            },
        )(),
    )

    cli_module.main()

    assert json.loads(output.getvalue())["results"][0]["fasttext_support_score"] is None


def test_preprocessing_and_score_precision_are_preserved() -> None:
    assert title_tokens("The AI in Education") == ["ai", "education"]
    assert preprocess_title("The AI & WATER-based Study: an Overview") == [
        "ai",
        "water",
        "based",
        "study",
        "overview",
    ]
    assert decimal_score(0.1234567890127) == "0.123456789013"


def test_preprocessing_keeps_unicode_and_removes_only_versioned_stopwords() -> None:
    assert title_tokens("The Café and Éducation Study") == [
        "café",
        "éducation",
        "study",
    ]
    assert title_tokens("the and with") == []


def test_preprocessing_removes_filipino_function_words_but_keeps_subject_terms() -> (
    None
):
    assert title_tokens("Ang Wika at Panitikan ng mga Mag-aaral sa Paaralan") == [
        "wika",
        "panitikan",
        "mag",
        "aaral",
        "paaralan",
    ]
    assert title_tokens("ang at ay mga ng sa upang") == []


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
        input=json.dumps(
            {
                "source": {"id": 1, "title": "Source"},
                "candidates": [{"id": 2, "title": "Candidate"}],
            }
        ),
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
        {
            "query": "climate",
            "candidates": [{"id": 2, "title": "one"}, {"id": 2, "title": "two"}],
        },
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


def test_cli_keeps_typed_queries_bounded_and_accepts_uploaded_content() -> None:
    cli = Path(__file__).resolve().parents[1] / "cli.py"
    environment = os.environ | {"SIMILARITY_MAXIMUM_CONTENT_CHARACTERS": "100"}

    accepted = subprocess.run(
        [sys.executable, str(cli)],
        input=json.dumps(
            {
                "uploaded_content": "CHAPTER 1\nabcdefghij",
                "candidates": [
                    {"id": 2, "title": "Candidate", "content": "CHAPTER 1\nabcdefghij"}
                ],
            }
        ),
        capture_output=True,
        text=True,
        check=False,
        env=environment,
    )
    assert accepted.returncode == 0
    assert (
        json.loads(accepted.stdout)["results"][0]["content_similarity_score"]
        == "1.000000000000"
    )

    numeric_only = subprocess.run(
        [sys.executable, str(cli)],
        input=json.dumps(
            {
                "uploaded_content": "CHAPTER 1\n2024 03 climate",
                "candidates": [
                    {
                        "id": 2,
                        "title": "2024 climate",
                        "content": "CHAPTER 1\n2024 03 astronomy",
                    }
                ],
            }
        ),
        capture_output=True,
        text=True,
        check=False,
    )
    assert numeric_only.returncode == 0
    assert json.loads(numeric_only.stdout)["results"] == []

    for payload in (
        {"query": "x" * 201, "candidates": []},
        {"uploaded_content": "CHAPTER 1\n" + "x" * 101, "candidates": []},
        {"uploaded_content": "valid", "query": "also present", "candidates": []},
    ):
        rejected = subprocess.run(
            [sys.executable, str(cli)],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            check=False,
            env=environment,
        )
        assert rejected.returncode == 2
        assert json.loads(rejected.stdout) == {"error": {"code": "INVALID_INPUT"}}


def test_cli_preserves_uploaded_scope_and_capacity_error_codes() -> None:
    cli = Path(__file__).resolve().parents[1] / "cli.py"
    scope = subprocess.run(
        [sys.executable, str(cli)],
        input=json.dumps({"uploaded_content": "No chapter heading", "candidates": []}),
        capture_output=True,
        text=True,
        check=False,
    )
    assert scope.returncode == 2
    assert json.loads(scope.stdout) == {"error": {"code": "INVALID_UPLOAD_SCOPE"}}

    capacity = subprocess.run(
        [sys.executable, str(cli)],
        input=json.dumps(
            {
                "uploaded_content": "CHAPTER 1\nBody",
                "candidates": [
                    {"id": 2, "title": "One", "content": "CHAPTER 1\nOne"},
                    {"id": 3, "title": "Two", "content": "CHAPTER 1\nTwo"},
                ],
            }
        ),
        capture_output=True,
        text=True,
        check=False,
        env=os.environ | {"SIMILARITY_MAXIMUM_CANDIDATES": "1"},
    )
    assert capacity.returncode == 3
    assert json.loads(capacity.stdout) == {"error": {"code": "CAPACITY_EXCEEDED"}}

    invalid_scope = subprocess.run(
        [sys.executable, str(cli)],
        input=json.dumps(
            {
                "uploaded_content": "CHAPTER 1\nBody",
                "candidates": [
                    {"id": 2, "title": "Invalid", "content": "No chapter heading"},
                    {"id": 3, "title": "Valid", "content": "CHAPTER 1\nBody"},
                ],
            }
        ),
        capture_output=True,
        text=True,
        check=False,
        env=os.environ | {"SIMILARITY_MAXIMUM_CANDIDATES": "2"},
    )
    assert invalid_scope.returncode == 0
    assert [
        result["matched_research_id"]
        for result in json.loads(invalid_scope.stdout)["results"]
    ] == [3]


def test_cli_enforces_the_default_uploaded_content_character_boundary() -> None:
    cli = Path(__file__).resolve().parents[1] / "cli.py"

    for length, expected_code in ((1_000_000, 0), (1_000_001, 2)):
        content = ("ab " * ((length // 3) + 1))[: length - 10]
        completed = subprocess.run(
            [sys.executable, str(cli)],
            input=json.dumps(
                {
                    "uploaded_content": "CHAPTER 1\n" + content,
                    "candidates": [],
                }
            ),
            capture_output=True,
            text=True,
            check=False,
        )
        assert completed.returncode == expected_code
        if expected_code == 0:
            assert json.loads(completed.stdout) == {"results": []}
        else:
            assert json.loads(completed.stdout) == {"error": {"code": "INVALID_INPUT"}}


def test_uploaded_content_golden_parity_scopes_chapters_and_normalizes_exact_text() -> (
    None
):
    upload = "Cover\r\nCHAPTER I: Introduction\r\nAlpha findings.\r\nCHAPTER 2\r\nBeta evidence.\r\nREFERENCES\r\nUpload source"
    candidate = "Different front\nCHAPTER 1: INTRODUCTION\n alpha findings.\nCHAPTER II\n beta evidence.\nAPPENDIX\nCandidate source"

    result = compare_query(
        upload,
        [{"id": 2, "title": "Candidate", "content": candidate}],
        FakeFastText(),
        uploaded_content=True,
    )[0]

    assert result["content_similarity_score"] == "1.000000000000"
    assert result["fasttext_support_score"] is None
    assert result["matched_terms"] == [
        "alpha",
        "beta",
        "evidence",
        "findings",
        "introduction",
    ]


def test_uploaded_content_changed_body_is_not_a_false_hundred_percent_match() -> None:
    result = compare_query(
        "CHAPTER 1\nAlpha findings\nCHAPTER 2\nGamma evidence",
        [
            {
                "id": 2,
                "title": "Candidate",
                "content": "CHAPTER 1\nAlpha findings\nCHAPTER 2\nBeta evidence",
            }
        ],
        None,
        uploaded_content=True,
    )[0]

    assert 0 < float(result["content_similarity_score"]) < 1


def test_uploaded_content_preserves_calculated_cosine_for_reordered_terms() -> (
    None
):
    result = compare_query(
        "CHAPTER 1\nAlpha beta gamma",
        [
            {
                "id": 2,
                "title": "Candidate",
                "content": "CHAPTER 1\nGamma beta alpha",
            }
        ],
        None,
        uploaded_content=True,
    )[0]

    assert result["content_similarity_score"] == "1.000000000000"


def test_uploaded_content_excludes_chapter_six_and_numeric_junk_terms() -> None:
    result = compare_query(
        "CHAPTER 1\nResearch climate 2024\nCHAPTER 6\nExcluded unique sixterm",
        [
            {
                "id": 2,
                "title": "Candidate",
                "content": "CHAPTER 1\nResearch climate 1080\nCHAPTER 6\nDifferent sixterm",
            }
        ],
        None,
        uploaded_content=True,
    )[0]

    assert result["content_similarity_score"] == "1.000000000000"
    assert result["matched_terms"] == ["climate", "research"]


def test_flattened_scope_does_not_treat_lowercase_prose_as_back_matter() -> None:
    result = compare_query(
        "CHAPTER 1 INTRODUCTION this study references shared evidence and an appendix note",
        [
            {
                "id": 2,
                "title": "Candidate",
                "content": "CHAPTER 1 INTRODUCTION different text references shared evidence and an appendix note",
            }
        ],
        None,
        uploaded_content=True,
    )[0]

    assert "evidence" in result["matched_terms"]


def test_uploaded_content_mixed_case_normal_back_matter_scores_zero() -> None:
    result = compare_query(
        "ChApTeR 1\nUploadonly\nChApTeR 6\nSharedsix\nReFeReNcEs\nSharedreferences\nApPeNdIx\nSharedappendix",
        [
            {
                "id": 2,
                "title": "Candidate",
                "content": "cHaPtEr 1\nCandidateonly\nChApTeR 6\nSharedsix\nrEfErEnCeS\nSharedreferences\naPpEnDiCeS\nSharedappendix",
            }
        ],
        None,
        uploaded_content=True,
    )

    assert result == []


def test_uploaded_content_uses_flattened_candidate_scope_fallback() -> None:
    result = compare_query(
        "CHAPTER 1\nExact body\nCHAPTER 2\nResults",
        [
            {
                "id": 361,
                "title": "Folder",
                "content": "Cover 1 Chapter 1 INTRODUCTION Exact body 2 PRESENTATION, ANALYSIS, AND INTERPRETATION OF DATA Results",
            }
        ],
        None,
        uploaded_content=True,
    )[0]

    assert float(result["content_similarity_score"]) > 0


def test_uploaded_content_uses_flattened_upload_scope_fallback() -> None:
    result = compare_query(
        "Cover 1 Chapter 1 INTRODUCTION Exact body 2 PRESENTATION, ANALYSIS, AND INTERPRETATION OF DATA Results",
        [
            {
                "id": 361,
                "title": "Folder",
                "content": "CHAPTER 1\nExact body\nCHAPTER 2\nResults",
            }
        ],
        None,
        uploaded_content=True,
    )[0]

    assert float(result["content_similarity_score"]) > 0


def test_uploaded_content_rejects_a_missing_or_out_of_order_chapter_one_scope() -> None:
    for text in (
        "Abstract only",
        "CHAPTER 2\nMethods",
        "CHAPTER 1\nIntro\nCHAPTER 3\nResults\nCHAPTER 2\nMethods",
    ):
        try:
            compare_query(text, [], None, uploaded_content=True)
        except InvalidWorkerInput:
            continue
        raise AssertionError("invalid uploaded chapter scope was accepted")


def test_uploaded_content_returns_only_the_positive_top_ten_by_score_then_identifier() -> (
    None
):
    candidates = [
        {
            "id": identifier,
            "title": f"Candidate {identifier}",
            "content": "CHAPTER 1\nshared body",
        }
        for identifier in range(1_000, 0, -1)
    ]
    completed = subprocess.run(
        [sys.executable, str(Path(__file__).resolve().parents[1] / "cli.py")],
        input=json.dumps(
            {"uploaded_content": "CHAPTER 1\nshared body", "candidates": candidates}
        ),
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 0
    results = json.loads(completed.stdout)["results"]

    assert [result["matched_research_id"] for result in results] == list(range(1, 11))


def test_uploaded_content_omits_positive_scores_that_render_as_zero(monkeypatch) -> None:
    monkeypatch.setattr(engine_module, "_content_cosine", lambda *_args: 1e-13)

    assert compare_query(
        "CHAPTER 1\nshared body",
        [{"id": 2, "title": "Candidate", "content": "CHAPTER 1\nshared body"}],
        None,
        uploaded_content=True,
    ) == []


def test_uploaded_content_applies_the_reference_scoped_corpus_capacity_limit(monkeypatch) -> None:
    monkeypatch.setattr(engine_module, "_MAX_CONTENT_CORPUS_CHARACTERS", 50_000)
    result = compare_query(
        "CHAPTER 1\n" + ("large upload text " * 1_000),
        [
            {
                "id": 2,
                "title": "Candidate",
                "content": "Large cover " * 1_000
                + "\nCHAPTER 1\nLarge candidate body\nREFERENCES\nIgnored source",
            },
            {
                "id": 3,
                "title": "Invalid scope",
                "content": "Unscoped text " * 100,
            },
        ],
        None,
        uploaded_content=True,
    )

    assert [item["matched_research_id"] for item in result] == [2]

    monkeypatch.setattr(engine_module, "_MAX_CONTENT_CORPUS_CHARACTERS", 20)
    try:
        compare_query(
            "CHAPTER 1\nShared body",
            [{"id": 2, "title": "Candidate", "content": "CHAPTER 1\nShared candidate body"}],
            None,
            uploaded_content=True,
        )
    except engine_module.SimilarityCapacityExceeded:
        return
    raise AssertionError("oversized scoped corpus was accepted")


def test_uploaded_content_skips_invalid_candidates() -> None:
    result = compare_query(
        "CHAPTER 1\nShared body",
        [
            {"id": 2, "title": "Invalid", "content": "No chapter heading"},
            {"id": 3, "title": "Comparable", "content": "CHAPTER 1\nShared body"},
        ],
        None,
        uploaded_content=True,
    )

    assert [item["matched_research_id"] for item in result] == [3]


def test_uploaded_content_rejects_token_and_vocabulary_capacity_before_scoring(
    monkeypatch,
) -> None:
    monkeypatch.setattr(engine_module, "_MAX_CONTENT_VOCABULARY", 1)
    try:
        compare_query(
            "CHAPTER 1\nalpha beta",
            [{"id": 2, "title": "Candidate", "content": "CHAPTER 1\nalpha beta"}],
            None,
            uploaded_content=True,
        )
    except engine_module.SimilarityCapacityExceeded:
        return
    raise AssertionError("oversized vocabulary was accepted")
