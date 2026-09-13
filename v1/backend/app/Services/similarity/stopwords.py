"""Deterministic title preprocessing with no runtime corpus dependency."""

from __future__ import annotations

import re


# Keep these local and versioned rather than relying on downloadable corpora.
ENGLISH_STOPWORDS = {
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
FILIPINO_STOPWORDS = {
    "ako",
    "ang",
    "at",
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
STOPWORDS = frozenset(ENGLISH_STOPWORDS | FILIPINO_STOPWORDS)
_TOKEN_RE = re.compile(r"(?u)\b[\w\d]{2,}\b")


def preprocess_title(title: str) -> list[str]:
    """Return normalized title tokens using only the versioned rules above."""
    if not isinstance(title, str):
        raise TypeError("Title must be a string.")

    return [
        token for token in _TOKEN_RE.findall(title.casefold()) if token not in STOPWORDS
    ]
