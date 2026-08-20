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

## Similarity worker setup

The title-only similarity worker uses scikit-learn sparse TF-IDF and cosine for
its final score. FastText provides supporting context only. It never reads
manuscripts during a title comparison.

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

Public catalog search is unaffected. `POST /api/repository/similarity` passes no
model to the worker by design, stays pure TF-IDF/cosine, and returns
`fasttext_support_score: null`.

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
