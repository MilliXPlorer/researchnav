from __future__ import annotations

import argparse
import json
import math
import re
import shlex
import shutil
import sys
import textwrap
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from zipfile import BadZipFile, ZipFile

import numpy as np
from pypdf import PdfReader
from pypdf.errors import PdfReadError
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


SUPPORTED_EXTENSIONS = {".docx", ".pdf"}
WORD_PATTERN = re.compile(r"[a-z0-9]+(?:[-'][a-z0-9]+)?")
SEARCH_WORD_PATTERN = re.compile(r"[a-z0-9]+")
TITLE_END_PATTERN = re.compile(
    r"^(?:a\s+)?research\s+(?:proposal|paper|study|manuscript)\s+presented\b",
    re.IGNORECASE,
)
WORD_NAMESPACE = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
SIMILARITY_RANGES = {
    "Low": "0%-39%",
    "Moderate": "40%-69%",
    "High": "70%-100%",
}


@dataclass(frozen=True)
class Study:
    title: str
    file: str
    content: str = ""


@dataclass(frozen=True)
class SimilarityResult:
    title: str
    file: str
    similarity_score: float
    fasttext_context_score: float
    level: str
    keyword_occurrences: int | None = None
    matched_keywords: tuple[str, ...] = ()
    keyword_mentions: tuple[tuple[str, int], ...] = ()


def tokenize(text: str) -> list[str]:
    """Normalize title words and remove common English filler words."""
    return [
        token
        for token in WORD_PATTERN.findall(text.lower())
        if token not in ENGLISH_STOP_WORDS
    ]


def _docx_paragraphs(path: Path) -> list[str]:
    # Read only document.xml so a broken embedded image does not block title extraction.
    try:
        with ZipFile(path) as archive:
            xml = archive.read("word/document.xml")
    except (BadZipFile, KeyError, OSError) as error:
        raise ValueError(f"cannot read Word document: {error}") from error

    try:
        root = ET.fromstring(xml)
    except ET.ParseError as error:
        raise ValueError(f"invalid Word document XML: {error}") from error

    paragraphs: list[str] = []
    for paragraph in root.iter(f"{WORD_NAMESPACE}p"):
        parts = [
            node.text or ""
            for node in paragraph.iter(f"{WORD_NAMESPACE}t")
        ]
        text = " ".join("".join(parts).split())
        if text:
            paragraphs.append(text)
    return paragraphs


def _pdf_paragraphs(path: Path) -> list[str]:
    try:
        reader = PdfReader(path)
        paragraphs: list[str] = []
        for page in reader.pages:
            text = page.extract_text() or ""
            paragraphs.extend(
                normalized
                for line in text.splitlines()
                if (normalized := " ".join(line.split()))
            )
        return paragraphs
    except (PdfReadError, OSError, ValueError) as error:
        raise ValueError(f"cannot read PDF document: {error}") from error


def _document_paragraphs(path: Path) -> list[str]:
    if path.suffix.lower() == ".docx":
        return _docx_paragraphs(path)
    if path.suffix.lower() == ".pdf":
        return _pdf_paragraphs(path)
    raise ValueError(f"unsupported file type: {path.suffix or '(none)'}")


def _title_from_paragraphs(paragraphs: list[str]) -> str:
    """Extract the title from the first one to three document paragraphs."""

    if not paragraphs:
        raise ValueError("document has no readable text")

    title_parts = [paragraphs[0]]
    for paragraph in paragraphs[1:3]:
        if TITLE_END_PATTERN.match(paragraph):
            break
        letters = [character for character in paragraph if character.isalpha()]
        is_uppercase = bool(letters) and all(
            not character.islower() for character in letters
        )
        if not is_uppercase:
            break
        title_parts.append(paragraph)

    return " ".join(title_parts)


def _research_content(paragraphs: list[str]) -> str:
    reference_indexes = [
        index
        for index, paragraph in enumerate(paragraphs)
        if paragraph.strip().lower() in {"references", "bibliography"}
        or paragraph.strip().lower().startswith("references ")
    ]
    end = reference_indexes[-1] if reference_indexes else len(paragraphs)
    return "\n".join(paragraphs[:end])


def extract_title(path: Path) -> str:
    return _title_from_paragraphs(_document_paragraphs(path))


def load_studies(folder: Path) -> tuple[list[Study], list[str]]:
    if not folder.is_dir():
        raise ValueError(f"study folder does not exist: {folder}")

    studies: list[Study] = []
    warnings: list[str] = []
    files = sorted(
        (
            path
            for path in folder.iterdir()
            if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
        ),
        key=lambda path: path.name.lower(),
    )
    for path in files:
        try:
            paragraphs = _document_paragraphs(path)
            studies.append(
                Study(
                    title=_title_from_paragraphs(paragraphs),
                    file=str(path),
                    content=_research_content(paragraphs),
                )
            )
        except ValueError as error:
            warnings.append(f"Skipped {path.name}: {error}")

    if not studies:
        raise ValueError(
            f"no readable {', '.join(sorted(SUPPORTED_EXTENSIONS))} studies in {folder}"
        )
    return studies, warnings


def keyword_occurrence_count(keyword: str, text: str) -> int:
    """Count whole-word phrase occurrences in normalized manuscript text."""
    keyword_tokens = SEARCH_WORD_PATTERN.findall(keyword.lower())
    if not keyword_tokens:
        raise ValueError("keyword cannot be empty")
    needle = " ".join(keyword_tokens)
    haystack = " ".join(SEARCH_WORD_PATTERN.findall(text.lower()))
    return f" {haystack} ".count(f" {needle} ")


def parse_keywords(value: str) -> list[str]:
    """Parse quoted keyword groups, with commas supported as a fallback."""
    if '"' in value or "'" in value:
        try:
            items = [item.strip(",") for item in shlex.split(value)]
        except ValueError as error:
            raise ValueError(f"invalid quoted keywords: {error}") from error
    elif "," in value:
        items = value.split(",")
    else:
        items = [value]

    keywords: list[str] = []
    seen: set[str] = set()
    for item in items:
        keyword = " ".join(item.split())
        normalized = keyword.lower()
        if keyword and normalized not in seen:
            keywords.append(keyword)
            seen.add(normalized)
    if not keywords:
        raise ValueError("at least one keyword is required")
    return keywords


def find_keyword_matches(keywords: str | list[str], studies: list[Study]) -> list[Study]:
    """Return strong keyword matches and collapse duplicate manuscript titles."""
    if isinstance(keywords, str):
        keywords = parse_keywords(keywords)
    matches: list[Study] = []
    seen_titles: set[str] = set()
    for study in studies:
        searchable_text = study.content or study.title
        strong_match = any(
            keyword_occurrence_count(keyword, study.title) > 0
            or keyword_occurrence_count(keyword, searchable_text) >= 2
            for keyword in keywords
        )
        normalized_title = " ".join(study.title.lower().split())
        if strong_match and normalized_title not in seen_titles:
            matches.append(study)
            seen_titles.add(normalized_title)
    return matches


def keyword_context(
    keyword: str,
    text: str,
    window: int = 12,
    max_occurrences: int = 20,
) -> str:
    """Collect bounded text windows around keyword occurrences for scoring."""
    keyword_tokens = SEARCH_WORD_PATTERN.findall(keyword.lower())
    text_tokens = SEARCH_WORD_PATTERN.findall(text.lower())
    if not keyword_tokens:
        raise ValueError("keyword cannot be empty")

    context_tokens: list[str] = []
    phrase_length = len(keyword_tokens)
    occurrences = 0
    for index in range(len(text_tokens) - phrase_length + 1):
        if text_tokens[index : index + phrase_length] != keyword_tokens:
            continue
        start = max(0, index - window)
        end = min(len(text_tokens), index + phrase_length + window)
        context_tokens.extend(text_tokens[start:end])
        occurrences += 1
        if occurrences >= max_occurrences:
            break
    return " ".join(context_tokens)


class FastTextModel:
    """Small NumPy-backed skip-gram FastText model with subword vectors."""

    def __init__(
        self,
        vector_size: int = 64,
        window: int = 3,
        epochs: int = 5,
        negative_samples: int = 5,
        min_n: int = 3,
        max_n: int = 6,
        seed: int = 42,
    ) -> None:
        self.vector_size = vector_size
        self.window = window
        self.epochs = epochs
        self.negative_samples = negative_samples
        self.min_n = min_n
        self.max_n = max_n
        self.seed = seed
        self.word_to_index: dict[str, int] = {}
        self.ngram_to_index: dict[str, int] = {}
        self.input_vectors = np.empty((0, vector_size), dtype=np.float64)
        self.output_vectors = np.empty((0, vector_size), dtype=np.float64)

    def _ngrams(self, word: str) -> set[str]:
        bounded = f"<{word}>"
        return {
            bounded[start : start + size]
            for size in range(self.min_n, self.max_n + 1)
            for start in range(len(bounded) - size + 1)
        }

    def _input_indices(self, word: str) -> list[int]:
        indices: list[int] = []
        word_index = self.word_to_index.get(word)
        if word_index is not None:
            indices.append(word_index)
        offset = len(self.word_to_index)
        indices.extend(
            offset + self.ngram_to_index[ngram]
            for ngram in self._ngrams(word)
            if ngram in self.ngram_to_index
        )
        return indices

    @staticmethod
    def _sigmoid(value: float) -> float:
        return 1.0 / (1.0 + math.exp(-max(-15.0, min(15.0, value))))

    def fit(self, sentences: list[list[str]]) -> FastTextModel:
        counts: dict[str, int] = {}
        for sentence in sentences:
            for word in sentence:
                counts[word] = counts.get(word, 0) + 1
        if not counts:
            raise ValueError("FastText needs at least one title word")

        words = sorted(counts)
        self.word_to_index = {word: index for index, word in enumerate(words)}
        ngrams = sorted({ngram for word in words for ngram in self._ngrams(word)})
        self.ngram_to_index = {
            ngram: index for index, ngram in enumerate(ngrams)
        }

        generator = np.random.default_rng(self.seed)
        component_count = len(words) + len(ngrams)
        scale = 0.5 / self.vector_size
        self.input_vectors = generator.uniform(
            -scale, scale, (component_count, self.vector_size)
        )
        self.output_vectors = np.zeros((len(words), self.vector_size))

        frequencies = np.array([counts[word] ** 0.75 for word in words])
        probabilities = frequencies / frequencies.sum()
        indexed_sentences = [
            [self.word_to_index[word] for word in sentence] for sentence in sentences
        ]
        training_steps = max(
            1,
            self.epochs
            * sum(
                min(len(sentence) - 1, self.window * 2) * len(sentence)
                for sentence in indexed_sentences
            ),
        )
        step = 0

        for _ in range(self.epochs):
            for sentence, indexed_sentence in zip(sentences, indexed_sentences):
                for center_position, center_word in enumerate(sentence):
                    start = max(0, center_position - self.window)
                    end = min(len(sentence), center_position + self.window + 1)
                    input_indices = self._input_indices(center_word)
                    if not input_indices:
                        continue
                    for context_position in range(start, end):
                        if context_position == center_position:
                            continue
                        context_index = indexed_sentence[context_position]
                        negatives = generator.choice(
                            len(words),
                            size=self.negative_samples,
                            replace=True,
                            p=probabilities,
                        )
                        samples = [
                            (context_index, 1.0),
                            *((int(index), 0.0) for index in negatives),
                        ]
                        learning_rate = 0.05 * max(0.1, 1.0 - step / training_steps)
                        step += 1
                        for output_index, label in samples:
                            hidden = self.input_vectors[input_indices].mean(axis=0)
                            output = self.output_vectors[output_index].copy()
                            prediction = self._sigmoid(float(hidden @ output))
                            gradient = learning_rate * (label - prediction)
                            self.output_vectors[output_index] += gradient * hidden
                            self.input_vectors[input_indices] += (
                                gradient * output / len(input_indices)
                            )
        return self

    def word_vector(self, word: str) -> np.ndarray:
        indices = self._input_indices(word)
        if not indices:
            return np.zeros(self.vector_size)
        return self.input_vectors[indices].mean(axis=0)

    def sentence_vector(self, words: list[str]) -> np.ndarray:
        vectors = [self.word_vector(word) for word in words]
        vectors = [vector for vector in vectors if np.any(vector)]
        if not vectors:
            return np.zeros(self.vector_size)
        return np.mean(vectors, axis=0)


def classify(score: float) -> str:
    if score >= 70.0:
        return "High"
    if score >= 40.0:
        return "Moderate"
    return "Low"


def level_range(level: str) -> str:
    return SIMILARITY_RANGES[level]


def check_similarity(
    query_title: str,
    studies: list[Study],
    comparison_texts: list[str] | None = None,
) -> list[SimilarityResult]:
    query_title = " ".join(query_title.split())
    if not query_title:
        raise ValueError("title cannot be empty")
    if not studies:
        return []
    texts = comparison_texts or [study.title for study in studies]
    if len(texts) != len(studies):
        raise ValueError("comparison text count must match study count")
    vectorizer = TfidfVectorizer(
        lowercase=True,
        stop_words="english",
        ngram_range=(1, 2),
        sublinear_tf=True,
    )
    try:
        study_tfidf = vectorizer.fit_transform(texts)
    except ValueError as error:
        raise ValueError(f"cannot build TF-IDF vocabulary: {error}") from error
    query_tfidf = vectorizer.transform([query_title])
    tfidf_scores = cosine_similarity(query_tfidf, study_tfidf)[0]

    tokenized_texts = [tokenize(text) for text in texts]
    fasttext = FastTextModel().fit(tokenized_texts)
    query_vector = fasttext.sentence_vector(tokenize(query_title))
    study_vectors = np.vstack(
        [fasttext.sentence_vector(words) for words in tokenized_texts]
    )
    if np.any(query_vector):
        fasttext_scores = cosine_similarity([query_vector], study_vectors)[0]
    else:
        fasttext_scores = np.zeros(len(studies))

    results: list[SimilarityResult] = []
    for study, tfidf_score, fasttext_score in zip(
        studies, tfidf_scores, fasttext_scores
    ):
        lexical = max(0.0, min(1.0, tfidf_score))
        semantic = max(0.0, min(1.0, fasttext_score))
        final_score = lexical * 100.0
        results.append(
            SimilarityResult(
                title=study.title,
                file=study.file,
                similarity_score=round(final_score, 2),
                fasttext_context_score=round(semantic * 100.0, 2),
                level=classify(final_score),
            )
        )
    return sorted(results, key=lambda result: result.similarity_score, reverse=True)


def _print_table(
    query: str,
    results: list[SimilarityResult],
    study_count: int,
    keyword_search: bool,
    matched_count: int | None,
    keyword_count: int | None = None,
) -> None:
    width = min(max(shutil.get_terminal_size(fallback=(88, 24)).columns, 72), 110)
    divider = "=" * width
    separator = "-" * width

    print(divider)
    print("RESEARCHNAV SIMILARITY CHECK")
    print(divider)
    query_label = "Keywords" if keyword_search and (keyword_count or 0) > 1 else (
        "Keyword" if keyword_search else "Proposed title"
    )
    query_display = " | ".join(parse_keywords(query)) if keyword_search else query
    print(f"{query_label:<18}: {query_display}")
    print(f"Studies scanned   : {study_count}")
    if keyword_search:
        print(f"Strong matches    : {matched_count}")
        if matched_count is not None and matched_count > len(results):
            print(f"Showing top       : {len(results)}")
    print(
        "Similarity ranges : Low 0%-39% | Moderate 40%-69% | High 70%-100%"
    )
    print()
    if not results:
        print("No strongly related studies containing that keyword were found.")
        return

    print(
        "STRONGEST KEYWORD MATCHES"
        if keyword_search
        else "RESULTS - HIGHEST SIMILARITY FIRST"
    )
    print(separator)
    for index, result in enumerate(results, start=1):
        title_lines = textwrap.wrap(
            result.title,
            width=max(30, width - 6),
            break_long_words=False,
            break_on_hyphens=False,
        ) or [result.title]
        print(f"[{index:02d}] {title_lines[0]}")
        for line in title_lines[1:]:
            print(f"     {line}")
        print(
            f"     Final TF-IDF + cosine: {result.similarity_score:6.2f}%  "
            f"Level: {result.level} [{level_range(result.level)}]"
        )
        print(
            f"     FastText context: {result.fasttext_context_score:6.2f}%  "
            "(supporting only)"
        )
        if result.keyword_occurrences is not None:
            mentions = " | ".join(
                f"{keyword} ({count})"
                for keyword, count in result.keyword_mentions
            )
            print(
                textwrap.fill(
                    f"Keyword mentions: {mentions}",
                    width=width,
                    initial_indent="     ",
                    subsequent_indent="     ",
                    break_long_words=False,
                    break_on_hyphens=False,
                )
            )
            print(f"     Total keyword mentions: {result.keyword_occurrences}")
        if index < len(results):
            print()
    print(separator)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Compare a proposed research title with local studies."
    )
    source = parser.add_mutually_exclusive_group()
    source.add_argument(
        "--keyword",
        help='find any quoted keyword group, e.g. "inventory" "machine learning"',
    )
    source.add_argument("--title", help="proposed research title")
    source.add_argument(
        "--document",
        type=Path,
        help="DOCX or PDF proposal whose title should be checked",
    )
    parser.add_argument(
        "--studies",
        type=Path,
        default=Path("Research Studies"),
        help="folder containing existing DOCX or PDF studies",
    )
    parser.add_argument(
        "--top",
        type=int,
        help="limit the results (default: 5)",
    )
    parser.add_argument("--json", action="store_true", help="print machine-readable JSON")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.top is not None and args.top < 1:
        parser.error("--top must be at least 1")

    try:
        interactive_keyword = not (args.keyword or args.title or args.document)
        if interactive_keyword:
            try:
                query = input(
                    'Enter quoted keywords, e.g. "inventory" "machine learning": '
                ).strip()
            except EOFError as error:
                raise ValueError("no keyword was entered") from error
        else:
            query = args.keyword or args.title or extract_title(args.document)

        studies, warnings = load_studies(args.studies)
        keyword_search = interactive_keyword or args.keyword is not None
        matched_count: int | None = None
        keywords: list[str] = []
        if keyword_search:
            keywords = parse_keywords(query)
            matching_studies = find_keyword_matches(keywords, studies)
            contexts = [
                " ".join(
                    keyword_context(keyword, study.content or study.title)
                    for keyword in keywords
                )
                for study in matching_studies
            ]
            results = check_similarity(
                " ".join(keywords),
                matching_studies,
                comparison_texts=contexts,
            )
            keyword_counts = {
                study.file: {
                    keyword: keyword_occurrence_count(
                        keyword, study.content or study.title
                    )
                    for keyword in keywords
                }
                for study in matching_studies
            }
            results = [
                replace(
                    result,
                    keyword_occurrences=sum(keyword_counts[result.file].values()),
                    matched_keywords=tuple(
                        keyword
                        for keyword, count in keyword_counts[result.file].items()
                        if count > 0
                    ),
                    keyword_mentions=tuple(
                        (keyword, count)
                        for keyword, count in keyword_counts[result.file].items()
                        if count > 0
                    ),
                )
                for result in results
                if result.file in keyword_counts
            ]
            results.sort(
                key=lambda result: (
                    result.keyword_occurrences or 0,
                    result.similarity_score,
                ),
                reverse=True,
            )
            matched_count = len(results)
        else:
            results = check_similarity(query, studies)
        result_limit = args.top if args.top is not None else 5
        results = results[:result_limit]
    except ValueError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    for warning in warnings:
        print(f"Warning: {warning}", file=sys.stderr)

    if args.json:
        print(
            json.dumps(
                {
                    "query": query,
                    "keywords": keywords if keyword_search else None,
                    "search_type": "keyword" if keyword_search else "title_similarity",
                    "studies_checked": len(studies),
                    "studies_matched": matched_count,
                    "results": [asdict(result) for result in results],
                },
                indent=2,
            )
        )
    else:
        _print_table(
            query,
            results,
            len(studies),
            keyword_search,
            matched_count,
            len(keywords) if keyword_search else None,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
