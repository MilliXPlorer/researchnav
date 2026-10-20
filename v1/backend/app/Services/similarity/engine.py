"""Compatibility facade for the modular textual-similarity pipeline."""

from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Callable, Iterable

_TWELVE_PLACES = Decimal("0.000000000001")
_ORDINAL_NUMBER_RE = re.compile(r"\A\d+(?:st|nd|rd|th)\Z", re.IGNORECASE)
_CONTENT_TOKEN_RE = re.compile(r"(?u)\b[\w\d]{2,}\b")
_CHAPTER_HEADING = re.compile(
    r"(?im)^[ \t]*(?:chapter|kabanata)[ \t]+"
    r"(?P<number>10|[1-9]|one|two|three|four|five|six|seven|eight|nine|ten|"
    r"viii|vii|vi|iv|iii|ii|ix|x|v|i)"
    r"(?!\w)[ \t]*(?:[:.\-–—][ \t]*)?[^\r\n]*\r?$"
)
_BACK_MATTER_HEADING = re.compile(
    r"(?im)^[ \t]*(?:references(?:[ \t]+and[ \t]+bibliography)?|bibliography|"
    r"appendix|appendices|annex(?:es)?)(?:[ \t]+[A-Z0-9]+)?"
    r"(?:[ \t]*[:.\-–—][^\r\n]*)?[ \t]*\r?$"
)
_INLINE_CHAPTER_HEADING = re.compile(
    r"\b(?:chapter|kabanata)[ \t]+(?:10|[1-9]|one|two|three|four|five|six|"
    r"seven|eight|nine|ten|viii|vii|vi|iv|iii|ii|ix|x|v|i)(?!\w)",
    re.IGNORECASE,
)
_FLAT_CHAPTER_HEADING = re.compile(
    r"(?<!\w)(?:CHAPTER|Chapter|KABANATA|Kabanata)[ \t]+"
    r"(?P<number>10|[1-9]|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|"
    r"VIII|VII|VI|IV|III|II|IX|X|V|I)"
    r"(?!\w)(?=[ \t]*(?:[:.\-–—]|[A-Z]))",
)
_FLAT_BACK_MATTER_HEADING = re.compile(
    r"(?<!\w)(?:REFERENCES|BIBLIOGRAPHY|APPENDICES|APPENDIX|ANNEXES)(?!\w)"
)
_FLAT_NUMBERED_CHAPTER_HEADING = re.compile(
    r"(?<!\w)(?P<number>[2-5])[ \t]+"
    r"(?=(?:THE[ \t]+REVIEW[ \t]+OF[ \t]+RELATED[ \t]+LITERATURE|"
    r"REVIEW[ \t]+OF[ \t]+RELATED[ \t]+LITERATURE|"
    r"RESEARCH[ \t]+METHODOLOGY|METHODOLOGY|"
    r"PRESENTATION(?:,[ \t]+|[ \t]+)(?:ANALYSIS|INTERPRETATION)|"
    r"RESULTS[ \t]+AND[ \t]+DISCUSSION|"
    r"SUMMARY[ \t]+OF[ \t]+FINDINGS|SUMMARY(?:,[ \t]+|[ \t]+)"
    r"(?:CONCLUSIONS?|FINDINGS))\b)",
    re.IGNORECASE,
)
_NUMBER_WORDS = {
    word: number
    for number, word in enumerate(
        (
            "",
            "ONE",
            "TWO",
            "THREE",
            "FOUR",
            "FIVE",
            "SIX",
            "SEVEN",
            "EIGHT",
            "NINE",
            "TEN",
        )
    )
    if word
}
_ROMAN_NUMERALS = {
    "I": 1,
    "II": 2,
    "III": 3,
    "IV": 4,
    "V": 5,
    "VI": 6,
    "VII": 7,
    "VIII": 8,
    "IX": 9,
    "X": 10,
}
_CONTENT_STOPWORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "by",
        "for",
        "from",
        "in",
        "is",
        "of",
        "on",
        "or",
        "that",
        "the",
        "to",
        "with",
        "ako",
        "ang",
        "ay",
        "bilang",
        "dahil",
        "din",
        "dito",
        "doon",
        "habang",
        "ito",
        "iyon",
        "kanilang",
        "kanyang",
        "kapag",
        "kasi",
        "kay",
        "kaya",
        "kung",
        "lang",
        "mga",
        "mula",
        "na",
        "namin",
        "nang",
        "ng",
        "ngunit",
        "ni",
        "nila",
        "nito",
        "o",
        "para",
        "pero",
        "rin",
        "sa",
        "sila",
        "siya",
        "tayo",
        "upang",
    }
)
_MAX_TOKEN_UTF8_BYTES = 100
_MAX_CONTENT_TOKENS = 500_000
_MAX_CONTENT_VOCABULARY = 50_000
_MAX_CONTENT_CORPUS_CHARACTERS = 100_000_000


@dataclass(frozen=True)
class _ChapterScope:
    text: str
    last_chapter: int


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


class InvalidUploadedContentScope(InvalidWorkerInput):
    """Raised when an uploaded manuscript cannot be chapter-scoped."""


class SimilarityCapacityExceeded(RuntimeError):
    """Raised before a bounded similarity workload becomes expensive."""


def title_tokens(title: str) -> list[str]:
    """Backward-compatible name for deterministic title preprocessing."""
    return preprocess_title(title)


def matched_terms(left: Iterable[str], right: Iterable[str]) -> list[str]:
    """Return bounded lexical overlap without changing scoring tokens."""
    shared = sorted(set(left).intersection(right))
    return [
        term
        for term in shared
        if len(term) <= 100
        and any(character.isalpha() for character in term)
        and _ORDINAL_NUMBER_RE.fullmatch(term) is None
    ][:32]


def _bounded_terms(
    shared: Iterable[str], predicate: Callable[[str], bool] = lambda term: True
) -> list[str]:
    """Bound response terms by encoded size before taking the result limit."""
    return [
        term
        for term in sorted(shared)
        if len(term.encode("utf-8")) <= _MAX_TOKEN_UTF8_BYTES and predicate(term)
    ][:32]


def decimal_score(value: float) -> str:
    """Render a finite normalized component score at policy precision."""
    if not math.isfinite(value):
        raise ValueError("Score must be finite.")
    normalized = min(1.0, max(0.0, value))
    return format(
        Decimal(str(normalized)).quantize(_TWELVE_PLACES, rounding=ROUND_HALF_UP), "f"
    )


def percentage_score(score: str) -> str:
    """Compatibility utility; policy percentages are authoritative in PHP."""
    return format(
        (Decimal(score) * Decimal("100")).quantize(
            _TWELVE_PLACES, rounding=ROUND_HALF_UP
        ),
        "f",
    )


def record_text(record: dict[str, Any]) -> str:
    """Combine a record title with extracted content when content is available."""
    content = record.get("content")
    return (
        f"{record['title']}\n{content}"
        if isinstance(content, str) and content
        else record["title"]
    )


def _chapter_number(value: str) -> int:
    normalized = value.upper()
    if normalized.isdigit():
        return int(normalized)
    if normalized in _NUMBER_WORDS:
        return _NUMBER_WORDS[normalized]
    return _ROMAN_NUMERALS[normalized]


def _scope_from_matches(
    text: str, matches: list[re.Match[str]], back_matter: re.Pattern[str] | None
) -> _ChapterScope:
    headings = sorted(
        ((match, _chapter_number(match.group("number"))) for match in matches),
        key=lambda item: item[0].start(),
    )
    starts = [(match, number) for match, number in headings if number == 1]
    if not starts:
        raise InvalidWorkerInput("Chapter 1 was not detected.")

    start, _ = starts[-1]
    included = [(start, 1)]
    previous = 1
    end = len(text)
    for match, number in headings:
        if match.start() <= start.start():
            continue
        if number > 5:
            end = match.start()
            break
        if number <= previous:
            raise InvalidWorkerInput("Chapter headings are duplicated or out of order.")
        included.append((match, number))
        previous = number

    if back_matter is not None:
        boundary = back_matter.search(text, included[-1][0].end(), end)
        if boundary:
            end = boundary.start()

    parts: list[str] = []
    position = start.start()
    for match, number in included:
        parts.append(text[position : match.start()])
        heading = match.group(0).strip()
        title_start = match.start("number") - match.start() + len(match.group("number"))
        title = heading[title_start:].lstrip(" \t:.-–—")
        parts.append(f"CHAPTER {number}" + (f" {title}" if title else ""))
        if (
            not title
            and match.end() < len(text)
            and not text[match.end()].isspace()
            and text[match.end()] not in ":.-–—"
        ):
            parts.append(" ")
        position = match.end()
    parts.append(text[position:end])
    scoped = "".join(parts).strip()
    if not scoped:
        raise InvalidWorkerInput("No chapter content was detected.")
    return _ChapterScope(scoped, included[-1][1])


def _chapter_scope(text: str) -> _ChapterScope:
    matches = list(_CHAPTER_HEADING.finditer(text))
    return _scope_from_matches(text, matches, _BACK_MATTER_HEADING)


def _flattened_chapter_scope(text: str) -> _ChapterScope:
    headings = list(_FLAT_CHAPTER_HEADING.finditer(text))
    starts = [
        match for match in headings if _chapter_number(match.group("number")) == 1
    ]
    if not starts:
        return _scope_from_matches(text, headings, _FLAT_BACK_MATTER_HEADING)

    start = starts[-1]
    boundary_match = _FLAT_BACK_MATTER_HEADING.search(text, start.end())
    boundary = boundary_match.start() if boundary_match else len(text)
    combined = [
        match for match in headings if start.start() <= match.start() < boundary
    ]
    combined.extend(
        match
        for match in _FLAT_NUMBERED_CHAPTER_HEADING.finditer(text)
        if start.start() < match.start() < boundary
        and not any(
            heading.start() <= match.start() < heading.end() for heading in headings
        )
        and not re.search(
            r"(?:TABLE|FIGURE)[ \t]+$",
            text[max(start.start(), match.start() - 32) : match.start()],
            re.IGNORECASE,
        )
    )
    combined.sort(key=lambda match: match.start())
    selected = [start]
    expected = 2
    for match in combined:
        if match.start() <= start.start():
            continue
        number = _chapter_number(match.group("number"))
        explicit = match.re is _FLAT_CHAPTER_HEADING
        if number == expected:
            selected.append(match)
            expected += 1
        elif explicit and number > expected:
            selected.append(match)
            expected = number + 1
        elif number > expected:
            continue
        elif explicit and number >= 2:
            continue
    return _scope_from_matches(text, selected, _FLAT_BACK_MATTER_HEADING)


def _uploaded_content_scope(text: str) -> _ChapterScope:
    """Use the normal heading parser first, then the flattened fallback."""
    try:
        return _chapter_scope(text)
    except InvalidWorkerInput as exception:
        try:
            return _flattened_chapter_scope(text)
        except InvalidWorkerInput:
            raise InvalidUploadedContentScope(
                "The uploaded manuscript has no valid chapter scope."
            ) from exception


def _normalize_content(text: str) -> str:
    return " ".join(
        unicodedata.normalize("NFC", text.lower())
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .split()
    )


def _content_terms(text: str) -> Counter[str]:
    return _content_terms_with_vocabulary(text, None)


def _content_terms_with_vocabulary(
    text: str, vocabulary: set[str] | None
) -> Counter[str]:
    terms: Counter[str] = Counter()
    token_count = 0
    for match in _CONTENT_TOKEN_RE.finditer(text):
        term = match.group(0).casefold()
        token_count += 1
        if token_count > _MAX_CONTENT_TOKENS:
            raise SimilarityCapacityExceeded("The content token limit was exceeded.")
        if term in _CONTENT_STOPWORDS or term == "chapter" or term.isdigit():
            continue
        if term not in terms and len(terms) >= _MAX_CONTENT_VOCABULARY:
            raise SimilarityCapacityExceeded(
                "The content vocabulary limit was exceeded."
            )
        if vocabulary is not None and term not in vocabulary:
            if len(vocabulary) >= _MAX_CONTENT_VOCABULARY:
                raise SimilarityCapacityExceeded(
                    "The content vocabulary limit was exceeded."
                )
            vocabulary.add(term)
        terms[term] += 1
    return terms


def _content_cosine(
    left: Counter[str], right: Counter[str], inverse_frequency: dict[str, float]
) -> float:
    if not left or not right:
        return 0.0
    left_vector = {
        term: count * inverse_frequency[term] for term, count in left.items()
    }
    right_vector = {
        term: count * inverse_frequency[term] for term, count in right.items()
    }
    numerator = sum(
        left_vector[term] * right_vector[term]
        for term in left_vector.keys() & right_vector.keys()
    )
    left_norm = math.sqrt(sum(value * value for value in left_vector.values()))
    right_norm = math.sqrt(sum(value * value for value in right_vector.values()))
    if not left_norm or not right_norm:
        return 0.0
    return min(1.0, max(0.0, numerator / (left_norm * right_norm)))


def _compare_uploaded_content(
    uploaded_content: str, candidates: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Port the standalone chapter-scoped content checker without FastText."""
    upload = _uploaded_content_scope(uploaded_content)
    upload_normalized = _normalize_content(upload.text)
    if not upload_normalized:
        raise InvalidWorkerInput("The manuscript contains no extractable text.")
    vocabulary: set[str] = set()
    upload_terms = _content_terms_with_vocabulary(upload_normalized, vocabulary)
    frequencies = Counter(upload_terms.keys())

    comparable: list[tuple[dict[str, Any], bool, Counter[str]]] = []
    corpus_characters = 0
    for candidate in candidates:
        content = candidate.get("content")
        if not isinstance(content, str) or not content:
            continue
        try:
            scope = _uploaded_content_scope(content)
        except InvalidWorkerInput:
            continue
        normalized = _normalize_content(scope.text)
        if not normalized:
            continue
        corpus_characters += len(normalized)
        if corpus_characters > _MAX_CONTENT_CORPUS_CHARACTERS:
            raise SimilarityCapacityExceeded("The content corpus limit was exceeded.")
        terms = _content_terms_with_vocabulary(normalized, vocabulary)
        frequencies.update(terms.keys())
        comparable.append((candidate, normalized == upload_normalized, terms))

    document_count = len(comparable) + 1
    inverse_frequency = {
        term: math.log((1 + document_count) / (1 + frequency)) + 1
        for term, frequency in frequencies.items()
    }
    ranked: list[tuple[float, int, list[str]]] = []
    for candidate, exact, terms in comparable:
        score = _content_cosine(upload_terms, terms, inverse_frequency)
        ranked.append((
            score,
            candidate["id"],
            _bounded_terms(
                upload_terms.keys() & terms.keys(),
                lambda term: _ORDINAL_NUMBER_RE.fullmatch(term) is None,
            ),
        ))

    results: list[dict[str, Any]] = []
    for score, candidate_id, shared in sorted(ranked, key=lambda item: (-item[0], item[1]))[:10]:
        rendered_score = decimal_score(score)
        if rendered_score == "0.000000000000":
            continue
        results.append(
            {
                "matched_research_id": candidate_id,
                "title_similarity_score": "0.000000000000",
                "content_similarity_score": rendered_score,
                "matched_terms": shared,
                "fasttext_support_score": None,
            }
        )
    return results


def _content_scores(
    source: dict[str, Any], candidates: list[dict[str, Any]]
) -> dict[int, float | None]:
    """Score only pairs with two extracted full-text projections."""
    if not isinstance(source.get("content"), str) or not source["content"]:
        return {candidate["id"]: None for candidate in candidates}
    available = [
        candidate
        for candidate in candidates
        if isinstance(candidate.get("content"), str) and candidate["content"]
    ]
    matrix = title_tfidf_matrix(
        [source["content"], *(candidate["content"] for candidate in available)]
    )
    values = source_cosine_scores(matrix)
    by_id = {
        candidate["id"]: value
        for candidate, value in zip(available, values, strict=True)
    }
    return {candidate["id"]: by_id.get(candidate["id"]) for candidate in candidates}


def compare_titles(
    source: dict[str, Any],
    candidates: Iterable[dict[str, Any]],
    fasttext_model: Any | None,
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
                support = contextual_support(
                    fasttext_model, comparison_texts[0], candidate_text
                )
            except (TypeError, ValueError, ArithmeticError, RuntimeError):
                # Model errors can include runtime/model details, so this is
                # deliberately converted to generic supporting-only context.
                support = None
        result = {
            "matched_research_id": candidate["id"],
            "title_similarity_score": decimal_score(title_value),
            "content_similarity_score": decimal_score(content_value)
            if content_value is not None
            else None,
            "fasttext_score": decimal_score(support.score)
            if support is not None
            else None,
            "matched_terms": matched_terms(source_tokens, tokens),
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
    query: str,
    candidates: Iterable[dict[str, Any]],
    fasttext_model: Any | None,
    uploaded_content: bool = False,
) -> list[dict[str, Any]]:
    """Emit independent components for a typed query or uploaded manuscript."""
    candidate_list = list(candidates)
    if uploaded_content:
        return _compare_uploaded_content(query, candidate_list)
    comparison_texts = [
        query,
        *(
            candidate.get("content", "") if uploaded_content else record_text(candidate)
            for candidate in candidate_list
        ),
    ]

    token_lists = [preprocess_title(text) for text in comparison_texts]
    title_scores = source_cosine_scores(
        title_tfidf_matrix(
            [query, *(candidate["title"] for candidate in candidate_list)]
        )
    )
    available = [
        candidate
        for candidate in candidate_list
        if isinstance(candidate.get("content"), str) and candidate["content"]
    ]
    content_texts = [query, *(candidate["content"] for candidate in available)]
    content_values = source_cosine_scores(title_tfidf_matrix(content_texts))
    content_scores = {
        candidate["id"]: value
        for candidate, value in zip(available, content_values, strict=True)
    }
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
                semantic_text = candidate.get("content") or candidate["title"]
                support = contextual_support(fasttext_model, query, semantic_text)
            except (TypeError, ValueError, ArithmeticError, RuntimeError):
                # Public FastText is supporting-only: a model/vector fault must
                # not prevent deterministic TF-IDF/cosine scoring.
                support = None
        result = {
            "matched_research_id": candidate["id"],
            "title_similarity_score": title_score,
            "content_similarity_score": decimal_score(content_value)
            if content_value is not None
            else None,
            "matched_terms": matched_terms(query_tokens, tokens),
            "fasttext_support_score": (
                decimal_score(support.score) if support is not None else None
            ),
        }
        ranked_results.append((title_value, candidate["id"], result))

    return [
        result
        for _, _, result in sorted(ranked_results, key=lambda item: (-item[0], item[1]))
    ]
