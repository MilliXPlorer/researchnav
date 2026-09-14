"""Title-only similarity worker package.

The worker receives records from Laravel over stdin.  It deliberately has no
database or repository-file access.  Its modular pipeline is: ``stopwords``
preprocessing, ``tfidf`` sparse vectors, ``cosine`` final ranking, and
``fasttext_similarity`` supporting context.  ``document_reader`` is available
for separately authorized local document workflows and is never used by CLI.
"""
