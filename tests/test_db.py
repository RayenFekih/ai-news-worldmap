import sqlite3

import pytest

from src import db
from src.data_enrichment import EnrichedArticle

RAW_ARTICLE = {
    "url": "https://example.com/article-1",
    "url_mobile": "",
    "title": "Some AI headline",
    "seendate": "20260722T090000Z",
    "socialimage": "",
    "domain": "example.com",
    "language": "English",
    "sourcecountry": "United States",
}


def _not_ai_related() -> EnrichedArticle:
    return EnrichedArticle(
        is_ai_related=False,
        ai_relevance_confidence=0.05,
        rejection_reason="Not primarily about artificial intelligence.",
        title_ar=None,
        topic=None,
        topic_ar=None,
        entities=None,
        summary_en=None,
        summary_ar=None,
        mena_relevance=None,
        mena_relevance_ar=None,
        ihorizons_relevance=None,
        ihorizons_relevance_ar=None,
        narration_ar=None,
        narration_en=None,
    )


@pytest.fixture
def conn():
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    db.init_db(connection)
    yield connection
    connection.close()


def test_init_db_is_idempotent(conn):
    db.init_db(conn)  # second call should not raise
    db.init_db(conn)


def test_insert_fetched_articles_dedups_on_url(conn):
    inserted_first = db.insert_fetched_articles(conn, [RAW_ARTICLE])
    inserted_second = db.insert_fetched_articles(conn, [RAW_ARTICLE])

    assert inserted_first == 1
    assert inserted_second == 0

    row = conn.execute("SELECT * FROM articles WHERE url = ?", (RAW_ARTICLE["url"],)).fetchone()
    assert row["enrichment_status"] == "pending"
    assert row["fetched_at"] is not None


def test_insert_fetched_articles_preserves_original_fetched_at(conn):
    db.insert_fetched_articles(conn, [RAW_ARTICLE])
    first_fetched_at = conn.execute(
        "SELECT fetched_at FROM articles WHERE url = ?", (RAW_ARTICLE["url"],)
    ).fetchone()["fetched_at"]

    db.insert_fetched_articles(conn, [RAW_ARTICLE])
    second_fetched_at = conn.execute(
        "SELECT fetched_at FROM articles WHERE url = ?", (RAW_ARTICLE["url"],)
    ).fetchone()["fetched_at"]

    assert first_fetched_at == second_fetched_at


def test_get_unenriched_returns_pending_rows(conn):
    db.insert_fetched_articles(conn, [RAW_ARTICLE])

    rows = db.get_unenriched(conn)

    assert len(rows) == 1
    assert rows[0]["url"] == RAW_ARTICLE["url"]


def test_get_unenriched_respects_max_attempts_for_failed_rows(conn):
    db.insert_fetched_articles(conn, [RAW_ARTICLE])
    db.mark_enrichment_failed(conn, RAW_ARTICLE["url"])
    db.mark_enrichment_failed(conn, RAW_ARTICLE["url"])
    db.mark_enrichment_failed(conn, RAW_ARTICLE["url"])

    assert db.get_unenriched(conn, max_attempts=3) == []
    assert len(db.get_unenriched(conn, max_attempts=5)) == 1


def test_mark_enriched_sets_status_and_json(conn):
    db.insert_fetched_articles(conn, [RAW_ARTICLE])
    enriched = _not_ai_related()

    db.mark_enriched(conn, RAW_ARTICLE["url"], enriched)

    row = conn.execute("SELECT * FROM articles WHERE url = ?", (RAW_ARTICLE["url"],)).fetchone()
    assert row["enrichment_status"] == "enriched"
    assert row["enriched_at"] is not None
    assert row["enrichment_json"] == enriched.model_dump_json()
    assert db.get_unenriched(conn) == []


def test_mark_enrichment_failed_increments_attempts(conn):
    db.insert_fetched_articles(conn, [RAW_ARTICLE])

    db.mark_enrichment_failed(conn, RAW_ARTICLE["url"])
    db.mark_enrichment_failed(conn, RAW_ARTICLE["url"])

    row = conn.execute("SELECT * FROM articles WHERE url = ?", (RAW_ARTICLE["url"],)).fetchone()
    assert row["enrichment_status"] == "failed"
    assert row["enrichment_attempts"] == 2


def test_get_articles_for_export_filters_by_status_and_window(conn):
    db.insert_fetched_articles(conn, [RAW_ARTICLE])
    db.mark_enriched(conn, RAW_ARTICLE["url"], _not_ai_related())

    assert len(db.get_articles_for_export(conn, since_utc="1970-01-01T00:00:00+00:00")) == 1
    assert db.get_articles_for_export(conn, since_utc="2999-01-01T00:00:00+00:00") == []


def test_get_unexported_and_mark_exported(conn):
    db.insert_fetched_articles(conn, [RAW_ARTICLE])
    db.mark_enriched(conn, RAW_ARTICLE["url"], _not_ai_related())

    unexported = db.get_unexported(conn)
    assert len(unexported) == 1

    db.mark_exported(conn, [RAW_ARTICLE["url"]], exported_at="2026-07-22T10:00:00+00:00")

    assert db.get_unexported(conn) == []
    row = conn.execute("SELECT exported_at FROM articles WHERE url = ?", (RAW_ARTICLE["url"],)).fetchone()
    assert row["exported_at"] == "2026-07-22T10:00:00+00:00"


def test_mark_exported_never_overwrites_first_export_time(conn):
    db.insert_fetched_articles(conn, [RAW_ARTICLE])
    db.mark_enriched(conn, RAW_ARTICLE["url"], _not_ai_related())
    db.mark_exported(conn, [RAW_ARTICLE["url"]], exported_at="2026-07-22T10:00:00+00:00")

    db.mark_exported(conn, [RAW_ARTICLE["url"]], exported_at="2026-07-22T11:00:00+00:00")

    row = conn.execute("SELECT exported_at FROM articles WHERE url = ?", (RAW_ARTICLE["url"],)).fetchone()
    assert row["exported_at"] == "2026-07-22T10:00:00+00:00"
