"""Scikit-learn sparse TF-IDF vectors for normalized research titles."""

from __future__ import annotations

from collections.abc import Sequence

from scipy.sparse import csr_matrix  # type: ignore[import-untyped]
from sklearn.feature_extraction.text import TfidfVectorizer  # type: ignore[import-untyped]

try:
    from .stopwords import preprocess_title
except ImportError:  # Direct execution through the fixed Laravel worker command.
    from stopwords import preprocess_title  # type: ignore[import-not-found,no-redef]


def title_tfidf_matrix(titles: Sequence[str]) -> csr_matrix:
    """Create an unnormalized sparse TF-IDF matrix for the supplied titles.

    Cosine normalization is deliberately performed by :mod:`cosine`, making the
    title endpoint's final-score pipeline explicit.  The empty-vocabulary case
    is represented by a valid zero-column sparse matrix rather than an error.
    """
    if not titles:
        return csr_matrix((0, 0), dtype=float)
    if not any(preprocess_title(title) for title in titles):
        return csr_matrix((len(titles), 0), dtype=float)

    vectorizer = TfidfVectorizer(
        analyzer=preprocess_title,
        lowercase=False,
        norm=None,
        smooth_idf=True,
        sublinear_tf=False,
    )
    return vectorizer.fit_transform(titles).tocsr()
