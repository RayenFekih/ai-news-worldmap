# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Two independent parts that share data through a static file, not a live connection:

- **Root (Python)** — a scheduled/on-demand pipeline that fetches AI-related news articles from the [GDELT DOC 2.0 API](https://api.gdeltproject.org/api/v2/doc/doc), enriches each one via a local Ollama LLM call (AI-relevance filter, topic/entity classification, Arabic translation, MENA/iHorizons relevance scoring), and exports the enriched result to a JSONL file. All pipeline state (fetched/enriched/exported, retry counts) lives in a SQLite database, not flat files.
- **`web/` (React + TypeScript + Vite)** — reads a static snapshot of that enriched JSONL from `web/public/data/enriched_data.jsonl` and animates it as a rotating 3D globe / 2D map with a bilingual (EN/AR) news ticker, revealing articles in real ingestion-timestamp order every ~9-14s client-side, looping through today's articles until a background poll picks up newly-exported ones.

The hand-off between the two is now automated but still file-based, not a live connection: the pipeline's export stage writes directly to `web/public/data/enriched_data.jsonl` (atomically, via a temp file + rename), and the running frontend periodically re-fetches that same static file to notice new articles.

## Commands

### Python (root) — uses `uv`, Python >=3.12

```
uv sync --group dev --group test              # install deps + dev/test groups
uv run python -m src.cli run --once           # run one fetch -> enrich -> export cycle and exit
uv run python -m src.cli run --loop           # run continuously, one cycle every PIPELINE_INTERVAL_MINUTES (default 15)
uv run python -m src.cli run --loop --interval-minutes 5   # override the loop interval for this run
uv run python -m src.data_enrichment          # enrich a sample article from data/news_data.jsonl via Ollama, print result
uv run jupyter notebook notebook.ipynb        # historical exploratory scratchpad, not part of the pipeline
uv run pytest                                 # run the full test suite
uv run pytest tests/test_pipeline.py          # single test file
```

Both `uv.lock` and `poetry.lock` are present, but `pyproject.toml` has `[tool.uv] package = false` — treat `uv` as the authoritative tool for this project (the venv in `.venv/` was created by uv).

Enrichment (`src/data_enrichment.py`) calls a **local Ollama server** — it must be running (`OLLAMA_BASE_URL`, default `http://localhost:11434`) with the configured model (`OLLAMA_MODEL`, default `qwen3:4b-instruct-2507-q4_K_M`) pulled for enrichment commands/`run --once`/`run --loop` to work. The unit tests mock `requests.post`/`requests.get` via `pytest-mock` and neutralize `tenacity`'s real backoff sleeps (`tests/conftest.py`), so `uv run pytest` does not require Ollama or network access.

### Frontend (`web/`) — Node + npm

```
cd web
npm install
npm run dev        # Vite dev server
npm run build       # tsc -b && vite build
npm run lint         # oxlint
npm run preview      # preview production build
```

There is no frontend test runner configured.

## Architecture

### Data pipeline (root)

`src/pipeline.py` orchestrates three stages against a shared SQLite connection (`src/db.py`, schema in `src/schema.sql`, default path `data/pipeline.db`), each independently callable:

1. **Fetch** (`run_fetch_stage`) — `src/gdelt_fetch.py`'s `fetch_articles()` builds params from `Settings` (`GDELT_QUERY`, `GDELT_TIMESPAN`, `n_news`) and calls `fetch_gdelt()`, which retries 429/5xx/connection errors with `tenacity` exponential backoff+jitter (up to `GDELT_MAX_RETRY_ATTEMPTS`, default 8) — GDELT's servers are frequently overloaded, so this is deliberately generous; a genuine 4xx fails fast without retrying. Results are inserted into the `articles` table via `db.insert_fetched_articles()`, deduped on `url` (`UNIQUE` constraint + `INSERT OR IGNORE`) — `fetched_at` is assigned once, the first time a URL is seen, and never touched again by overlapping fetch windows.
2. **Enrich** (`run_enrich_stage`) — pulls pending/retryable-failed rows via `db.get_unenriched()` and calls `src/data_enrichment.py`'s `enrich_article()` per row (unchanged single-article function), recording success/failure via `db.mark_enriched()`/`db.mark_enrichment_failed()`. `enrich_article()` fetches and extracts the article's full body text with `trafilatura` (`fetch_article_text()`, falls back to title/metadata only if the page can't be fetched), then sends it to a local Ollama model with a JSON-schema-constrained response (`format=` in the Ollama `/api/chat` call, derived from the `EnrichedArticle` pydantic model). Both `fetch_article_text()` and `_call_ollama()` retry connection/timeout errors (not permanent errors like 404s or malformed responses) via `tenacity`. The system/user prompts live in `src/prompts.py`. Output fields: `is_ai_related` + `ai_relevance_confidence` (relevance filter), and — only when AI-related — `title_ar`, `topic`/`topic_ar`, `entities` (name + type), `summary_en`/`summary_ar`, `mena_relevance`/`mena_relevance_ar`, `ihorizons_relevance`/`ihorizons_relevance_ar` (both HIGH/MEDIUM/LOW/NONE), and `narration_en`/`narration_ar` (short ticker-style narration). `EnrichedArticle`'s `_check_conditional_fields` validator enforces that every enrichment field is populated when `is_ai_related=True` and null when `False` — see the comments in that file for why fields are required-but-nullable (not optional) in the JSON schema (keeps a small model from closing the object early).
3. **Export** (`run_export_stage`) — rewrites the *entire* exportable window (enriched articles fetched within `EXPORT_LOOKBACK_HOURS`, default 1 week — kept generous since GDELT can go days without a successful fetch on a throttled IP; too tight a window lets the export silently age out to empty during an outage) to `EXPORT_OUTPUT_PATH` (default `web/public/data/enriched_data.jsonl`) on every run, atomically (temp file + `os.replace`), flattening each row's raw columns + `fetched_at` + the `enrichment_json` blob into one JSON object per line — the same shape `web/src/data/types.ts`'s `RawArticle` expects, plus the new `fetched_at` field. It rewrites the full window rather than appending because the frontend re-fetches and merges this file wholesale on each poll. `run_config_export_stage` (also called every cycle) writes a small sibling `pipeline_config.json` (default `web/public/data/pipeline_config.json`) exposing `REVEAL_MIN/MAX_INTERVAL_SECONDS` as milliseconds — this is how the frontend's reveal cadence is tuned from `src/settings.py` without a frontend rebuild.

`run_pipeline()` isolates fetch-stage failures: if `run_fetch_stage` raises after exhausting its retries (GDELT is an unauthenticated public API and does get rate-limited/overloaded in practice), the exception is caught and logged, `fetched` is reported as `0`, and the cycle still proceeds to enrich whatever's already pending and re-export the current snapshot — a bad GDELT window shouldn't stall enrichment/export of already-fetched articles. GDELT's `HEADERS` also send a browser-like `User-Agent` (not a custom one identifying this client) since GDELT rate-limits non-browser UAs even at low volume.

`src/cli.py` (`uv run python -m src.cli run --once|--loop`) drives `run_pipeline()`: `--once` runs a single cycle and exits; `--loop` wires an APScheduler `BlockingScheduler` with one interval job (`PIPELINE_INTERVAL_MINUTES`, default 15 — matches GDELT's real update cadence) and handles `SIGINT`/`SIGTERM` for a clean shutdown. A raised job (e.g. an unrecovered fetch failure making it past `run_pipeline`'s own handling, or an `EVENT_JOB_ERROR`) doesn't crash the scheduler — APScheduler logs it and the next interval still fires on schedule.

- `src/settings.py` — pydantic-settings `Settings` object loaded from `.env`: GDELT fetch/retry config (`BASE_URL`, `n_news`, `GDELT_QUERY`, `GDELT_TIMESPAN`, `GDELT_MAX_RETRY_ATTEMPTS`, ...), Ollama/enrichment tuning (`OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_TEMPERATURE`/`OLLAMA_SEED` for deterministic output, `OLLAMA_NUM_PREDICT`/`OLLAMA_NUM_CTX`, retry knobs), pipeline/persistence config (`DB_PATH`, `PIPELINE_INTERVAL_MINUTES`, `ENRICH_BATCH_LIMIT`/`ENRICH_MAX_ATTEMPTS`, `EXPORT_LOOKBACK_HOURS`/`EXPORT_OUTPUT_PATH`), and frontend playback tuning (`REVEAL_MIN/MAX_INTERVAL_SECONDS`, `FRONTEND_CONFIG_OUTPUT_PATH`). Also wires up logging via `src/logger.py` (console + rotating `logs/error.log`) as an import side effect.
- The backend deliberately does **not** compute a local-calendar-day cutoff for "today" — it has no reliable notion of the viewer's timezone, so it just keeps a generous UTC rolling window. The frontend (see below) is the sole owner of "what counts as today."
- `notebook.ipynb` and `data/news_data.jsonl`/`data/enriched_data.jsonl`/`data/enriched_data.processed` are historical artifacts from before the SQLite pipeline existed — left untouched, not read by any current code path (`data/pipeline.db` starts empty; there is no auto-backfill from the old flat files).
- The enriched output shape is exactly what `web/src/data/types.ts`'s `RawArticle` expects — keep both in sync if the GDELT query, prompt output fields, or `EnrichedArticle` schema change.

### Frontend (`web/`)

Data flow: `web/src/data/newsSource.ts` (`StaticJsonlNewsSource`, reads `/data/enriched_data.jsonl`) → `normalizeArticle()` converts each already-enriched `RawArticle` into a `NewsItem` (parses GDELT's `seendate` format, parses the new `fetched_at` into `fetchedAt: Date`, resolves `sourcecountry` to lat/lng + ISO2 via `web/src/data/countryCentroids.ts`) → `web/src/hooks/useNewsFeed.ts` owns all playback state. `GdeltLiveNewsSource` is a documented-but-unimplemented placeholder in `newsSource.ts` for swapping the static snapshot for a live fetch later — only `NewsSource.load()` would need to change. `web/src/data/dateUtils.ts` centralizes "local calendar day" logic (`localDateKey`/`isLocalToday`) shared by `topicSnapshotStore.ts` and `useNewsFeed.ts`. `web/src/data/config.ts` centralizes the frontend's own default reveal cadence and the background poll cadence (`POLL_INTERVAL_MS`), each overridable at build time via `VITE_*` env vars. `web/src/data/pipelineConfig.ts` (`loadRevealTiming()`) fetches `/data/pipeline_config.json` — the backend-exported reveal interval (`src/settings.py` `REVEAL_MIN/MAX_INTERVAL_SECONDS`) — falling back to `config.ts`'s defaults if the file is missing or unparseable; this is the mechanism for tuning reveal cadence from the Python side without a frontend rebuild.

`useNewsFeed` is the central piece of frontend state, and does three distinct things:
- **Playback**: on initial load, builds a `playbackQueueRef` via `selectPlaybackQueue()` — prefers today-local (`isLocalToday`) items sorted by `fetchedAt` ascending, but falls back to the full loaded set if none are "today" (so playback/the `stats.totalRevealed` counter never freezes just because the pipeline hasn't produced anything new in a while) — then on a randomized interval (from `loadRevealTiming()`, ~9-14s by default) "reveals" the next item in that queue (a separate `cursor` ref, not tied to `allItems`'s order), accumulating a bounded `history` (ticker), a running per-country `points` map (globe/map markers — tracks per-country dominant topic and top MENA/iHorizons relevance tier), and `stats` (`totalRevealed`, `loopsCompleted`). Non-AI-related items (`isAiRelated: false`) still cycle through `history` but are excluded from `points`/`stats`/`current`. On reaching the end of the queue, it re-runs `selectPlaybackQueue()` (self-correcting across a midnight rollover in a long-lived open tab) before looping back to the start.
- **Polling**: a separate `setInterval` effect (`POLL_INTERVAL_MS`) re-fetches the static snapshot, diffs against a `knownUrlsRef` set of already-seen URLs (`pickNewArticles()` in `newsSource.ts`), and splices any new today-eligible items onto the end of `playbackQueueRef` — mutating the ref directly (not React state) so it never restarts the reveal-scheduling effect or skips the ticker ahead. New items are also appended to `allItems` state so corpus insights include them.
- **Corpus insights** (`computeCorpusInsights`): a one-shot aggregate over *all* loaded items (not just revealed ones) — topic/relevance distributions, top organizations/models/technologies by entity frequency, bilingual coverage %, and day-over-day topic evolution. The evolution comparison reads/writes `web/src/data/topicSnapshotStore.ts`, which snapshots today's topic counts into `localStorage` (keyed by local date, capped at 2 entries) so tomorrow's load can diff against it.

Component tree (`App.tsx`), all driven by the single `useNewsFeed()` call: `Header` (iHorizons logo from `web/public/logos/`, 2D/3D toggle, live clock, `HeaderStats` — just the running `Stories` count now) + `MapView` (switches between `Globe3D` and `Map2D` by `ViewMode`) + two overlay columns each pairing an `InsightsPanel` (auto-rotating KPI cards, pauses on hover, card renderers defined in `insightCards.tsx` and split into `GROUP_A_CARDS`/`GROUP_B_CARDS`) with a story panel — `ActiveStoryPanel` (English, left) and `ArabicStoryPanel` (Arabic/RTL mirror, right) both rendering the same `current` item — + `Ticker` (recent history, all items). `web/src/data/taxonomy.ts` centralizes topic/entity-type/relevance label and color maps (including an `_AR` Arabic label variant) shared across these components — update it, not individual components, when adding a topic/entity type or changing the palette.
