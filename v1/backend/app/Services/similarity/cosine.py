"""Cosine scoring for scikit-learn sparse title vectors."""

from __future__ import annotations

from scipy.sparse import spmatrix  # type: ignore[import-untyped]
from sklearn.metrics.pairwise import cosine_similarity  # type: ignore[import-untyped]


def source_cosine_scores(vectors: spmatrix) -> list[float]:
    """Return cosine scores from row zero to every remaining sparse row."""
    if vectors.shape[0] < 2 or vectors.shape[1] == 0:
        return [0.0] * max(vectors.shape[0] - 1, 0)

    scores = cosine_similarity(vectors[0], vectors[1:], dense_output=True)[0]
    # Numerical noise from a library calculation must not escape score bounds.
    return [min(1.0, max(0.0, float(score))) for score in scores]
