import json
import logging
import os
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from src import db
from src.data_enrichment import enrich_article
from src.gdelt_fetch import fetch_articles
from src.settings import settings

logger = logging.getLogger(__name__)

_EXPORT_RAW_COLUMNS = (
    "url", "url_mobile", "title", "seendate", "socialimage",
    "domain", "language", "sourcecountry", "fetched_at",
)


@dataclass
class EnrichStageResult:
    attempted: int
    succeeded: int
    failed: int


@dataclass
class PipelineResult:
    fetched: int
    enrich: EnrichStageResult
    exported: int


def run_fetch_stage(conn: sqlite3.Connection) -> int:
    logger.info("Fetch stage: querying GDELT...")
    articles = fetch_articles()
    inserted = db.insert_fetched_articles(conn, articles)
    logger.info("Fetch stage: %s article(s) fetched, %s new", len(articles), inserted)
    return inserted


def run_enrich_stage(conn: sqlite3.Connection) -> EnrichStageResult:
    rows = db.get_unenriched(
        conn,
        max_attempts=settings.ENRICH_MAX_ATTEMPTS,
        limit=settings.ENRICH_BATCH_LIMIT or None,
    )
    if not rows:
        logger.info("Enrich stage: nothing to enrich")
        return EnrichStageResult(attempted=0, succeeded=0, failed=0)

    logger.info("Enrich stage: enriching %s article(s)...", len(rows))
    succeeded = failed = 0
    for i, row in enumerate(rows, start=1):
        article = dict(row)
        title = (article.get("title") or "<untitled>")[:80]
        logger.info("Enrich stage: [%s/%s] %s", i, len(rows), title)
        result = enrich_article(article)
        if result is None:
            db.mark_enrichment_failed(conn, article["url"])
            failed += 1
        else:
            db.mark_enriched(conn, article["url"], result)
            succeeded += 1
    logger.info("Enrich stage: %s attempted, %s succeeded, %s failed", len(rows), succeeded, failed)
    return EnrichStageResult(attempted=len(rows), succeeded=succeeded, failed=failed)


def run_export_stage(conn: sqlite3.Connection, output_path: Path | None = None) -> int:
    """Rewrites the full exportable window (last EXPORT_LOOKBACK_HOURS) to `output_path`.

    Always rewrites the entire window rather than appending, since the frontend re-fetches and
    merges this file wholesale on each poll — it must always represent the complete current set.
    """
    output_path = Path(output_path) if output_path else Path(settings.EXPORT_OUTPUT_PATH)
    since = (datetime.now(timezone.utc) - timedelta(hours=settings.EXPORT_LOOKBACK_HOURS)).isoformat()
    rows = db.get_articles_for_export(conn, since_utc=since)
    newly_exported_urls = [row["url"] for row in db.get_unexported(conn)]

    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = output_path.with_suffix(output_path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as f:
        for row in rows:
            record = {col: row[col] for col in _EXPORT_RAW_COLUMNS}
            record.update(json.loads(row["enrichment_json"]))
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    os.replace(tmp_path, output_path)

    db.mark_exported(conn, newly_exported_urls, exported_at=datetime.now(timezone.utc).isoformat())
    logger.info(
        "Export stage: %s article(s) written to %s (%s newly exported)",
        len(rows), output_path, len(newly_exported_urls),
    )
    return len(rows)


def run_config_export_stage(output_path: Path | None = None) -> None:
    """Exports frontend-facing runtime config (currently just reveal cadence) as a JSON sidecar.

    Lets `REVEAL_MIN/MAX_INTERVAL_SECONDS` be tuned from `src/settings.py` without a frontend
    rebuild - the frontend fetches this file at load and falls back to its own defaults if it's
    missing or unparseable.
    """
    output_path = Path(output_path) if output_path else Path(settings.FRONTEND_CONFIG_OUTPUT_PATH)
    config = {
        "reveal_min_interval_ms": round(settings.REVEAL_MIN_INTERVAL_SECONDS * 1000),
        "reveal_max_interval_ms": round(settings.REVEAL_MAX_INTERVAL_SECONDS * 1000),
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = output_path.with_suffix(output_path.suffix + ".tmp")
    tmp_path.write_text(json.dumps(config, indent=2), encoding="utf-8")
    os.replace(tmp_path, output_path)


def run_pipeline(conn: sqlite3.Connection | None = None) -> PipelineResult:
    started_at = datetime.now(timezone.utc)
    logger.info("=== Pipeline cycle starting ===")
    own_conn = conn is None
    if own_conn:
        conn = db.get_connection()
        db.init_db(conn)
    try:
        try:
            fetched = run_fetch_stage(conn)
        except Exception as exc:
            # GDELT is a flaky, unauthenticated public API - a fetch failure after exhausting
            # retries shouldn't stop this cycle from enriching whatever's already pending or
            # re-exporting the current snapshot. The next scheduled cycle will try fetching again.
            logger.error("Fetch stage failed, continuing cycle without new articles: %s", exc)
            fetched = 0
        enrich_result = run_enrich_stage(conn)
        exported = run_export_stage(conn)
        run_config_export_stage()
        result = PipelineResult(fetched=fetched, enrich=enrich_result, exported=exported)
        elapsed = (datetime.now(timezone.utc) - started_at).total_seconds()
        logger.info(
            "=== Pipeline cycle complete in %.1fs: %s new, %s enriched (%s failed), %s exported ===",
            elapsed, result.fetched, result.enrich.succeeded, result.enrich.failed, result.exported,
        )
        return result
    finally:
        if own_conn:
            conn.close()
