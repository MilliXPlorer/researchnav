<p align="center"><a href="https://laravel.com" target="_blank"><img src="https://raw.githubusercontent.com/laravel/art/master/logo-lockup/5%20SVG/2%20CMYK/1%20Full%20Color/laravel-logolockup-cmyk-red.svg" width="400" alt="Laravel Logo"></a></p>

<p align="center">
<a href="https://github.com/laravel/framework/actions"><img src="https://github.com/laravel/framework/workflows/tests/badge.svg" alt="Build Status"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/dt/laravel/framework" alt="Total Downloads"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/v/laravel/framework" alt="Latest Stable Version"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/l/laravel/framework" alt="License"></a>
</p>

## About Laravel

Laravel is a web application framework with expressive, elegant syntax. We believe development must be an enjoyable and creative experience to be truly fulfilling. Laravel takes the pain out of development by easing common tasks used in many web projects, such as:

- [Simple, fast routing engine](https://laravel.com/docs/routing).
- [Powerful dependency injection container](https://laravel.com/docs/container).
- Multiple back-ends for [session](https://laravel.com/docs/session) and [cache](https://laravel.com/docs/cache) storage.
- Expressive, intuitive [database ORM](https://laravel.com/docs/eloquent).
- Database agnostic [schema migrations](https://laravel.com/docs/migrations).
- [Robust background job processing](https://laravel.com/docs/queues).
- [Real-time event broadcasting](https://laravel.com/docs/broadcasting).

Laravel is accessible, powerful, and provides tools required for large, robust applications.

## Scope: Google-only authentication and no AI workflow

The active API accepts Google ID tokens only; it has no local-password or
alternative identity-provider login. AI-generated content, recommendations, and
AI-driven workflow decisions are excluded. Similarity output is supporting
evidence only and every validation, feedback, revision, and approval action is
recorded by a human account.

## Similarity worker setup

The similarity worker computes independent title and extracted-manuscript
TF-IDF cosine scores. Laravel applies the authoritative 30% title / 70% content
weighted policy documented in `../docs/SIMILARITY_SCORING.md`. FastText provides
supporting context only and never changes the official score or review status.

Create the Python environment from `backend`:

**Windows PowerShell**

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip setuptools wheel

# fastText 0.9.3 ships only a source distribution and was written against
# pybind11 2.x. Installing it on Windows needs all three of the following:
#   * pybind11 pinned below 3.0, because 3.x removed the py::init overloads
#     and the global ssize_t typedef that fastText's pybind layer relies on
#   * --no-build-isolation, so the build uses that pinned pybind11 instead of
#     resolving pybind11 3.x into an isolated overlay
#   * ssize_t defined and C++17 enabled, because ssize_t is POSIX-only and
#     src/dictionary.h uses std::string_view
python -m pip install "pybind11>=2.12,<3"
$env:CL = "/Dssize_t=ptrdiff_t /std:c++17"
python -m pip install --no-build-isolation "fasttext>=0.9.2,<0.10"
Remove-Item Env:\CL

python -m pip install -r requirements-test.txt
$env:SIMILARITY_PYTHON_BINARY = (Resolve-Path .\.venv\Scripts\python.exe)
$env:SIMILARITY_FASTTEXT_MODEL_PATH = 'C:\secure-models\cc.en.300.bin'
```

Building fastText on Windows also requires the Visual Studio C++ build tools.
In `.env`, write both paths with forward slashes; Laravel's dotenv parser treats
a backslash inside a double-quoted value as an escape sequence and rejects the
file.

**Linux/macOS shell**

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-test.txt
export SIMILARITY_PYTHON_BINARY="$(pwd)/.venv/bin/python"
export SIMILARITY_FASTTEXT_MODEL_PATH=/srv/secure-models/cc.en.300.bin
```

Download the English model only from the [official fastText English-vector
source](https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.en.300.bin.gz)
and see the [fastText crawl-vector documentation](https://fasttext.cc/docs/en/crawl-vectors.html).
Decompress it in a protected location outside this repository, configure the
path above, and record/verify its SHA-256 checksum from a trusted deployment
manifest before use (for example, `Get-FileHash -Algorithm SHA256` on Windows
or `sha256sum` on Linux). The model is intentionally not downloaded by setup,
is not committed, and `/models/` is ignored if a local development copy is used.

### Model size and the request timeout

`cc.en.300.bin` is a 4.19 GB download that decompresses to 6.74 GB, so allow
about 11 GB of free space while both files exist. Loading it needs roughly 7 GB
of resident memory.

The worker is a short-lived process: `cli.py` is spawned per request and calls
`fasttext.load_model()` every time, so the model load is paid on each
authenticated title check rather than once at boot. A measured cold load on a
16 GB Windows host was 17.7 s, and a full `POST /api/research/{id}/similarity/check`
took 15-16 s end to end. The 20 s default in `SIMILARITY_TIMEOUT_SECONDS`
therefore leaves no usable margin; set it to at least 60 s when FastText is
configured, or expect intermittent `502 SIMILARITY_PROCESS_FAILED` on a cold
page cache.

Public catalog search always uses TF-IDF/cosine for official ranking. When the
FastText package and configured model are available, the same request also
returns a semantic `fasttext_support_score`; otherwise that field is `null` and
search continues with TF-IDF/cosine. Because the short-lived worker loads the
model per request, the same timeout and memory guidance applies to search.

## Manuscript search projection

Manuscript-content search is retrieval, not plagiarism detection or similarity
scoring. `GET /api/repository?q=` searches metadata (title, abstract, keywords,
and authors) and `ready` extracted bodies, but returns metadata only: no body,
snippet, or score. Eligible records are non-deleted records with
`archive_status = archived`, `visibility = public`, and `submission_status` of
`approved` or `archived`.

On MariaDB, the body projection is searched with FULLTEXT natural-language
ranking (a BM25-family relevance ranking). The source resolver selects the
latest current `final_manuscript`. Only when that source is absent does it use
the canonical import fallback, and only after its checksum, path, metadata, and
file identity have been verified. PDF and DOCX extraction is supported; DOC is
unsupported and scanned/OCR-dependent PDFs produce `NO_TEXT`.

The migration creates one private `LONGTEXT` projection row per research
document. A successful extraction is `ready`; other states are `pending`,
`no_source`, `unsupported`, or `failed`. Failed extraction clears stale body
text, so metadata search remains available. `NO_SOURCE`, `UNSUPPORTED_SOURCE`,
`NO_TEXT`, and `EXTRACTION_FAILED` are recorded as internal projection
outcomes; they are not exposed as manuscript content by the public API.

After deploying the migration, perform the initial backfill once:

```powershell
php artisan repository:reindex-manuscripts
```

The scheduled maintenance command retries failed projections every ten minutes
with `--retry-failed` and does not overlap. Production must run Laravel's
scheduler, for example `php artisan schedule:run` every minute; a worker that
never invokes `schedule:run` will not maintain the projection.

The supported configuration is in `backend/.env.example`:
`MANUSCRIPT_SEARCH_PYTHON_BINARY`, `MANUSCRIPT_SEARCH_CLI_PATH`,
`MANUSCRIPT_SEARCH_TIMEOUT_SECONDS`, `MANUSCRIPT_SEARCH_MAXIMUM_INPUT_BYTES`,
`MANUSCRIPT_SEARCH_MAXIMUM_OUTPUT_BYTES`,
`MANUSCRIPT_SEARCH_MAXIMUM_TEXT_CHARACTERS`, and
`MANUSCRIPT_SEARCH_EXTRACTOR_VERSION`. Use a fixed, controlled Python
executable rather than an ambiguous PATH lookup. The worker receives only a
PHP-verified private path and bounded JSON; parser isolation at the OS or
container level is recommended.

Term probing is possible: a caller can submit terms and infer whether indexed
content contains them from result presence. Treat public search as a privacy
disclosure surface and do not index material that is not intended for public
repository retrieval.

## Private file deletion recovery

Deleting a document commits its database version promotion and an internal
pending-deletion record in the same transaction. Storage deletion is attempted
immediately; a false result or storage exception leaves that record for retry,
so a successful API deletion never claims that private storage was synchronously
removed. The record contains a private storage reference and is not exposed by
any API or log.

The scheduler retries up to 100 records every ten minutes. Ensure production
runs `php artisan schedule:run` every minute. Operators can run a bounded retry
manually with `php artisan repository:retry-private-file-deletions --limit=100`.

## Learning Laravel

Laravel has the most extensive and thorough [documentation](https://laravel.com/docs) and video tutorial library of all modern web application frameworks, making it a breeze to get started with the framework.

In addition, [Laracasts](https://laracasts.com) contains thousands of video tutorials on a range of topics including Laravel, modern PHP, unit testing, and JavaScript. Boost your skills by digging into our comprehensive video library.

You can also watch bite-sized lessons with real-world projects on [Laravel Learn](https://laravel.com/learn), where you will be guided through building a Laravel application from scratch while learning PHP fundamentals.

## Agentic Development

Laravel's predictable structure and conventions make it ideal for AI coding agents like Claude Code, Cursor, and GitHub Copilot. Install [Laravel Boost](https://laravel.com/docs/ai) to supercharge your AI workflow:

```bash
composer require laravel/boost --dev

php artisan boost:install
```

Boost provides your agent 15+ tools and skills that help agents build Laravel applications while following best practices.

## Contributing

Thank you for considering contributing to the Laravel framework! The contribution guide can be found in the [Laravel documentation](https://laravel.com/docs/contributions).

## Code of Conduct

In order to ensure that the Laravel community is welcoming to all, please review and abide by the [Code of Conduct](https://laravel.com/docs/contributions#code-of-conduct).

## Security Vulnerabilities

If you discover a security vulnerability within Laravel, please send an e-mail to Taylor Otwell via [taylor@laravel.com](mailto:taylor@laravel.com). All security vulnerabilities will be promptly addressed.

## License

The Laravel framework is open-sourced software licensed under the [MIT license](https://opensource.org/licenses/MIT).
