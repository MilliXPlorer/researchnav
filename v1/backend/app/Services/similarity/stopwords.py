"""Deterministic title preprocessing with no runtime corpus dependency."""

from __future__ import annotations

import re


# Keep this local, versioned list rather than relying on NLTK's downloadable data.
STOPWORDS = frozenset(
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
    }
)
_TOKEN_RE = re.compile(r"(?u)\b[\w\d]{2,}\b")


def preprocess_title(title: str) -> list[str]:
    """Return normalized title tokens using only the versioned rules above."""
    if not isinstance(title, str):
        raise TypeError("Title must be a string.")

    return [
        token for token in _TOKEN_RE.findall(title.casefold()) if token not in STOPWORDS
    ]
