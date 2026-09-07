"""Compatibility facade for the modular textual-similarity pipeline."""

from __future__ import annotations

import math
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Iterable

_TWELVE_PLACES = Decimal("0.000000000001")

try:
    from .cosine import source_cosine_scores
    from .fasttext_similarity import contextual_support
    from .stopwords import preprocess_title
    from .tfidf import title_tfidf_matrix
except ImportError:  # Direct script execution from Laravel's fixed command.
    from cosine import source_cosine_scores  # type: ignore[import-not-found,no-redef]
    from fasttext_similarity import contextual_support  # type: ignore[import-not-found,no-redef]
    from stopwords import preprocess_title  # type: ignore[import-not-found,no-redef]
    from tfidf import title_tfidf_matrix  # type: ignore[import-not-found,no-redef]


class InvalidWorkerInput(ValueError):
    """Raised when the worker protocol is malformed."""


def title_tokens(title: str) -> list[str]:
    """Backward-compatible name for deterministic title preprocessing."""
    return preprocess_title(title)


def decimal_score(value: float) -> str:
    """Render a finite normalized component score at policy precision."""
    if not math.isfinite(value):
        raise ValueError("Score must be finite.")
    normalized = min(1.0, max(0.0, value))
    return format(Decimal(str(normalized)).quantize(_TWELVE_PLACES, rounding=ROUND_HALF_UP), "f")


def percentage_score(score: str) -> str:
    """Compatibility utility; policy percentages are authoritative in PHP."""
    return format((Decimal(score) * Decimal("100")).quantize(_TWELVE_PLACES, rounding=ROUND_HALF_UP), "f")


def record_text(record: dict[str, Any]) -> str:
    """Combine a record title with extracted content when content is available."""
    content = record.get("content")
    return (
        f'{record["title"]}\n{content}'
        if isinstance(content, str) and content
        else record["title"]
    )


def _content_scores(
    source: dict[str, Any], candidates: list[dict[str, Any]]
) -> dict[int, float | None]:
    """Score only pairs with two extracted full-text projections."""
    if not isinstance(source.get("content"), str) or not source["content"]:
        return {candidate["id"]: None for candidate in candidates}
    available = [candidate for candidate in candidates if isinstance(candidate.get("content"), str) and candidate["content"]]
    matrix = title_tfidf_matrix([source["content"], *(candidate["content"] for candidate in available)])
    values = source_cosine_scores(matrix)
    by_id = {candidate["id"]: value for candidate, value in zip(available, values, strict=True)}
    return {candidate["id"]: by_id.get(candidate["id"]) for candidate in candidates}


def compare_titles(
    source: dict[str, Any], candidates: Iterable[dict[str, Any]], fasttext_model: Any | None
) -> list[dict[str, Any]]:
    """Emit independent title/content TF-IDF cosine components only."""
    candidate_list = list(candidates)
    all_records = [source, *candidate_list]
    comparison_texts = [record_text(record) for record in all_records]
    token_lists = [preprocess_title(record["title"]) for record in all_records]
    title_scores = source_cosine_scores(
        title_tfidf_matrix([record["title"] for record in all_records])
    )
    content_scores = _content_scores(source, candidate_list)
    source_tokens = set(token_lists[0])
    ranked_results: list[tuple[float, int, dict[str, Any]]] = []

    for candidate, candidate_text, tokens, title_value in zip(
        candidate_list,
        comparison_texts[1:],
        token_lists[1:],
        title_scores,
        strict=True,
    ):
        content_value = content_scores[candidate["id"]]
        support = None
        if fasttext_model is not None:
            try:
                support = contextual_support(fasttext_model, comparison_texts[0], candidate_text)
            except (TypeError, ValueError, ArithmeticError, RuntimeError):
                # Model errors can include runtime/model details, so this is
                # deliberately converted to generic supporting-only context.
                support = None
        result = {
            "matched_research_id": candidate["id"],
            "title_similarity_score": decimal_score(title_value),
            "content_similarity_score": decimal_score(content_value) if content_value is not None else None,
            "fasttext_score": decimal_score(support.score) if support is not None else None,
            "matched_terms": [
                term
                for term in sorted(source_tokens.intersection(tokens))
                if len(term) <= 100
            ][:32],
            "contextual_analysis": (
                support.analysis
                if support is not None
                else "FastText supporting context unavailable."
            ),
        }
        # PHP performs all weighted final-score calculation and classification.
        ranked_results.append((title_value, candidate["id"], result))

    # Deterministic ranking makes equal title scores stable across deployments.
    return [
        result
        for _, _, result in sorted(ranked_results, key=lambda item: (-item[0], item[1]))
    ]


def compare_query(
    query: str, candidates: Iterable[dict[str, Any]], fasttext_model: Any | None
) -> list[dict[str, Any]]:
    """Emit independent components for a typed query; PHP applies policy."""
    candidate_list = list(candidates)
    comparison_texts = [query, *(record_text(candidate) for candidate in candidate_list)]
    token_lists = [preprocess_title(text) for text in comparison_texts]
    title_scores = source_cosine_scores(
        title_tfidf_matrix([query, *(candidate["title"] for candidate in candidate_list)])
    )
    available = [candidate for candidate in candidate_list if isinstance(candidate.get("content"), str) and candidate["content"]]
    content_values = source_cosine_scores(title_tfidf_matrix([query, *(candidate["content"] for candidate in available)]))
    content_scores = {candidate["id"]: value for candidate, value in zip(available, content_values, strict=True)}
    query_tokens = set(token_lists[0])
    ranked_results: list[tuple[float, int, dict[str, Any]]] = []

    for candidate, candidate_text, tokens, title_value in zip(
        candidate_list,
        comparison_texts[1:],
        token_lists[1:],
        title_scores,
        strict=True,
    ):
        content_value = content_scores.get(candidate["id"])
        title_score = decimal_score(title_value)
        support = None
        if fasttext_model is not None:
            try:
                support = contextual_support(fasttext_model, query, candidate_text)
            except (TypeError, ValueError, ArithmeticError, RuntimeError):
                # Public FastText is supporting-only: a model/vector fault must
                # not prevent deterministic TF-IDF/cosine scoring.
                support = None
        result = {
            "matched_research_id": candidate["id"],
            "title_similarity_score": title_score,
            "content_similarity_score": decimal_score(content_value) if content_value is not None else None,
            "matched_terms": [
                term
                for term in sorted(query_tokens.intersection(tokens))
                if len(term) <= 100
            ][:32],
            "fasttext_support_score": (
                decimal_score(support.score) if support is not None else None
            ),
        }
        ranked_results.append((title_value, candidate["id"], result))

    return [
        result
        for _, _, result in sorted(ranked_results, key=lambda item: (-item[0], item[1]))
    ]
