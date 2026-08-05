# Research Title Similarity Checker

This checker searches all manuscripts for a keyword or compares a proposed
title with the studies in `Research Studies`. It dynamically reads `.docx`,
and `.pdf` files and reports two analysis values:

- **Final TF-IDF + cosine:** the final similarity score and the value used for
  Low, Moderate, or High classification.
- **FastText context:** supporting contextual analysis only. It does not alter
  the final score or classification.

The final score applies cosine similarity to TF-IDF vectors. Results use the
ResearchNAV thresholds: Low is below 40%, Moderate is 40-69.99%, and High is
70% or above. FastText remains separate from these thresholds.

TF-IDF vectorization and cosine similarity use scikit-learn for stable,
well-tested numerical behavior. FastText subword training uses NumPy-backed
vector calculations. `pypdf` extracts text from PDF documents.

The console displays the manuscript ranges as `Low [0%-39%]`,
`Moderate [40%-69%]`, and `High [70%-100%]`.

## Setup

From the `algorithm` folder:

```powershell
python -m pip install -r requirements.txt
```

## Interactive keyword search

Run the script without a title. It will ask for keywords or phrases, inspect
the full text of every manuscript, and score the titles of strongly matching
studies. A match must contain the keyword in its title or at least twice in its
manuscript, preventing incidental one-off mentions from filling the results.
Duplicate files with the same title are collapsed, and the five strongest
matches are shown by default:

PDF files must contain selectable text. Image-only scanned PDFs require OCR
and are skipped with a warning when no readable text can be extracted.

Enter multiple keywords as quoted groups. Keyword search uses ANY matching, so
a study is eligible when at least one keyword is a strong match. Quotes keep
multi-word phrases grouped:

```text
"education" "machine learning" "attendance monitoring"
```

Comma-separated input remains supported.

In keyword mode, TF-IDF and FastText analyze focused passages surrounding the
keyword. In proposed-title mode, they analyze the research titles. In both
modes, only cosine similarity over TF-IDF vectors determines the final score.
Each result lists per-keyword and total occurrences, for example
`Keyword mentions: education (50) | study (20)`.

```powershell
python research_similarity.py
Enter quoted keywords, e.g. "inventory" "machine learning": "attendance" "QR code"
```

The same search can be run non-interactively:

```powershell
python research_similarity.py --keyword "machine learning, attendance" --top 10
```

## Check a proposed title

```powershell
python research_similarity.py --title "A Smart Attendance Monitoring System Using QR Code"
```

Show more matches or emit JSON for an API:

```powershell
python research_similarity.py --title "Inventory and procurement system" --top 10
python research_similarity.py --title "Inventory and procurement system" --json
```

Check the title contained in another manuscript:

```powershell
python research_similarity.py --document "new-proposal.docx"
```

Use a different study folder:

```powershell
python research_similarity.py --title "Proposed title" --studies "Research Studies"
```

The FastText model is trained from the local comparison collection on each
run. A larger, curated repository will produce more useful contextual results
than a small collection. Similarity is a review aid, not proof of plagiarism
or research duplication.

## Tests

```powershell
python -m unittest -v
```
