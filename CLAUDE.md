# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Two independent parts that share data through a static file, not a live connection:

- **Root (Python)** — fetches AI-related news articles from the [GDELT DOC 2.0 API](https://api.gdeltproject.org/api/v2/doc/doc) and writes them to `data/news_data.jsonl`.
- **`web/` (React + TypeScript + Vite)** — reads a static snapshot of that JSONL from `web/public/data/news_data.jsonl` and animates it as a rotating 3D globe / 2D map with a news ticker, simulating a live feed by revealing one article every ~4.5-7s client-side.

There is currently no automated hand-off between the two: the JSONL produced by the Python side must be manually copied into `web/public/data/news_data.jsonl` for the frontend to pick it up.

## Commands

### Python (root) — uses `uv`, Python >=3.12

```
uv sync --group dev --group test   # install deps + dev/test groups
uv run python main.py               # standalone GDELT fetch demo (prints to stdout)
uv run jupyter notebook notebook.ipynb  # exploratory scratchpad used to (re)generate data/news_data.jsonl
uv run pytest                       # test runner is configured (pytest/pytest-cov/pytest-mock) but no tests exist yet
```

Both `uv.lock` and `poetry.lock` are present, but `pyproject.toml` has `[tool.uv] package = false` — treat `uv` as the authoritative tool for this project (the venv in `.venv/` was created by uv).

### Frontend (`web/`) — Node + npm

```
cd web
npm install
npm run dev        # Vite dev server
npm run build       # tsc -b && vite build
npm run lint         # oxlint
npm run preview      # preview production build
```

## Architecture

### Data pipeline (root)

- `src/settings.py` — pydantic-settings `Settings` object (`BASE_URL`, `n_news`) loaded from `.env`; also wires up logging via `src/logger.py` (console + rotating `logs/error.log`) as an import side effect.
- `src/data_sync.py` — builds the AI-topic GDELT query (OpenAI/Anthropic/Gemini/DeepMind/Mistral/Qwen/"large language model"/etc.), and `fetch_gdelt()` handles GDELT's 429 rate limiting with backoff.
- `main.py` — a minimal standalone fetch script (single hardcoded "OpenAI" query); it does not use `src/data_sync.py`'s query or `settings`, and does not persist output.
- `notebook.ipynb` — the actual place articles get pulled and written to `data/news_data.jsonl` (one raw GDELT article JSON object per line). Treat it as the working pipeline until `main.py`/`src/data_sync.py` are wired together to replace it.
- The `RawArticle` shape written here (`url`, `title`, `seendate`, `domain`, `language`, `sourcecountry`, `socialimage`, ...) is exactly what `web/src/data/types.ts` expects — keep both in sync if the GDELT query/fields change.

### Frontend (`web/`)

Data flow: `web/src/data/newsSource.ts` (`StaticJsonlNewsSource`) fetches `/data/news_data.jsonl` at runtime → `normalizeArticle()` converts each `RawArticle` into a `NewsItem` (parses GDELT's `seendate` format, resolves `sourcecountry` to lat/lng + ISO2 via `web/src/data/countryCentroids.ts`) → `web/src/hooks/useNewsFeed.ts` owns all playback state.

`useNewsFeed` is the central piece of frontend state: it loads all items once, then on a randomized ~4.5-7s interval "reveals" the next item in sequence (looping back to the start), accumulating a bounded `history` (ticker), a running per-country `points` map (globe/map markers), and aggregate `stats` (countries seen, top language, loop count, elapsed time). Everything else in the UI is a pure function of this hook's output.

Component tree (`App.tsx`): `Header` (2D/3D toggle) + `MapView` (switches between `Globe3D` and `Map2D` based on `ViewMode`) + `ActiveStoryPanel` (current item) + `StatsPanel` (aggregate stats) + `Ticker` (recent history), all driven by the single `useNewsFeed()` call in `App.tsx`.

`GdeltLiveNewsSource` is a documented-but-unimplemented placeholder in `newsSource.ts` for swapping the static snapshot for a live GDELT fetch later — the `RawArticle` shape is designed to be identical either way so only `NewsSource.load()` would need to change.
