"""FastText contextual support, kept separate from title ranking."""

from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Any

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity  # type: ignore[import-untyped]


@dataclass(frozen=True)
class ContextualSupport:
    """Supporting FastText data that is never used as a final title score."""

    score: float
    analysis: str


def contextual_support(
    model: Any, source_text: str, candidate_text: str
) -> ContextualSupport:
    """Calculate contextual support across the supplied title/manuscript text."""
    left = np.asarray(
        model.get_sentence_vector(" ".join(source_text.split())), dtype=float
    )
    right = np.asarray(
        model.get_sentence_vector(" ".join(candidate_text.split())), dtype=float
    )
    if left.ndim != 1 or right.ndim != 1 or left.size == 0 or left.shape != right.shape:
        raise ValueError("FastText returned unusable sentence vectors.")
    if not np.isfinite(left).all() or not np.isfinite(right).all():
        raise ValueError("FastText returned unusable sentence vectors.")

    semantic_cosine = float(
        cosine_similarity(left.reshape(1, -1), right.reshape(1, -1))[0][0]
    )
    if not math.isfinite(semantic_cosine):
        raise ValueError("FastText returned unusable sentence vectors.")

    # A FastText cosine ranges from -1 to 1.  Store its supporting value in the
    # database's required 0..1 range; this does not contribute to ranking.
    score = min(1.0, max(0.0, (semantic_cosine + 1.0) / 2.0))
    return ContextualSupport(
        score=score,
        analysis=(
            f"FastText title and manuscript context score is {score:.6f}; supporting evidence only; "
            "combined title and manuscript TF-IDF cosine determines the final score."
        ),
    )
