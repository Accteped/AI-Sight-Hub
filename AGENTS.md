# AGENTS.md

## What this repo is

AI Insight Hub (AgentForNotes): paste a URL or text, then crawl it, have an LLM summarize/tag/categorize it, store it in SQLite, and browse it in a local web UI.

## Universal Tooling

- Stack: Python 3.10+ (venv runs 3.14.7), FastAPI, SQLite, httpx, trafilatura, pydantic, python-dotenv
- Package manager: pip via `pyproject.toml` (editable install)
- Primary docs:
  - `AI-Insight-Hub-开发文档.md` — requirements, API contract, data model, staged plan (authoritative)
  - `CONTEXT.md` — current progress, module contracts, decisions, pitfall list, pending items

## Commands

- Install: `.\.venv\Scripts\python.exe -m pip install -e .`
- Run a module check from the repo root, e.g. `.\.venv\Scripts\python.exe -m app.llm.client` (use `-m` form so relative imports work)
- Run dev server: `.\.venv\Scripts\python.exe -m uvicorn app.web.server:app --reload --port 8000` — note `app/web/server.py` and the FastAPI wiring do not exist yet; `main.py` is a throwaway demo, not the app entry point.
- Tests: not set up. `pytest` is not installed and `tests/` does not exist yet. Known commands: see `AI-Insight-Hub-开发文档.md` sections 11 and 12.
- Lint/Format/Typecheck: none configured.

## Navigation

This is a single package, not a monorepo. No nested `AGENTS.md` files apply yet; re-evaluate if `app/` subdirectories gain their own manifests or distinct commands.

## Working rules

- Implement stages in the order given in `AI-Insight-Hub-开发文档.md` section 11; each stage must run before the next begins.
- `LLM_PROVIDER=mock` needs no API key and no network. Keep that path working — it is the default for development and tests.
- The API contract in doc section 7 is binding: a failed analysis returns HTTP 422 *with the item body*, and `get()`/`list()` return dicts (see `CONTEXT.md` section 5 for the columns actually in use).
- `CONTEXT.md` is the running memory: update it when a stage completes, a decision changes, or a new pitfall is found.

## Security & Configuration

- Real keys live only in `.env` (gitignored). `env.example` holds placeholders.
- Never expose a key through `/api/config` or error messages; return `has_key` as a boolean only.
- Parameterize SQL values; never interpolate user input.
- Confirm new generated files are ignored before committing — `.gitignore` covers `.env`, `.venv/`, caches, `data/`, `*.db`.

## Skills

- `agents-md-generator` (external) — updates this file.
- `find-skills` (external) — skill discovery.
