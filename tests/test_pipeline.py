import json
import sqlite3

import pytest

from src import db, pipeline
from src.data_enrichment import EnrichedArticle

RAW_ARTICLES = [
    {
        "url": "https://example.com/article-1",
        "url_mobile": "",
        "title": "AI headline one",
        "seendate": "20260722T090000Z",
        "socialimage": "",
        "domain": "example.com",
        "language": "English",
        "sourcecountry": "United States",
    },
    {
        "url": "https://example.com/article-2",
        "url_mobile": "",
        "title": "AI headline two",
        "seendate": "20260722T091500Z",
        "socialimage": "",
        "domain": "example.com",
        "language": "English",
        "sourcecountry": "United States",
    },
]


def _enriched(is_ai_related: bool) -> EnrichedArticle:
    if not is_ai_related:
        return EnrichedArticle(
            is_ai_related=False, ai_relevance_confidence=0.05,
            rejection_reason="Not primarily about AI.", title_ar=None, topic=None,
            topic_ar=None, entities=None, summary_en=None, summary_ar=None,
            mena_relevance=None, mena_relevance_ar=None, ihorizons_relevance=None,
            ihorizons_relevance_ar=None, narration_ar=None, narration_en=None,
        )
    return EnrichedArticle(
        is_ai_related=True, ai_relevance_confidence=0.9, rejection_reason=None,
        title_ar="عنوان", topic="AI_MODELS", topic_ar="نماذج", entities=[],
        summary_en="summary", summary_ar="ملخص", mena_relevance="LOW",
        mena_relevance_ar="منخفض", ihorizons_relevance="MEDIUM",
        ihorizons_relevance_ar="متوسط", narration_ar="سرد", narration_en="narration",
    )


@pytest.fixture
def conn():
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    db.init_db(connection)
    yield connection
    connection.close()


def test_run_fetch_stage_inserts_new_articles(conn, mocker):
    mocker.patch("src.pipeline.fetch_articles", return_value=RAW_ARTICLES)

    inserted = pipeline.run_fetch_stage(conn)

    assert inserted == 2
    assert len(db.get_unenriched(conn)) == 2


def test_run_enrich_stage_splits_success_and_failure(conn, mocker):
    db.insert_fetched_articles(conn, RAW_ARTICLES)
    mocker.patch(
        "src.pipeline.enrich_article",
        side_effect=[_enriched(is_ai_related=True), None],
    )

    result = pipeline.run_enrich_stage(conn)

    assert result.attempted == 2
    assert result.succeeded == 1
    assert result.failed == 1
    assert len(db.get_unenriched(conn)) == 0  # failed row still excluded (attempts < default max, but no max passed here means only pending)

    statuses = {row["url"]: row["enrichment_status"] for row in conn.execute("SELECT url, enrichment_status FROM articles")}
    assert statuses[RAW_ARTICLES[0]["url"]] == "enriched"
    assert statuses[RAW_ARTICLES[1]["url"]] == "failed"


def test_run_export_stage_writes_merged_jsonl(conn, mocker, tmp_path):
    db.insert_fetched_articles(conn, RAW_ARTICLES[:1])
    db.mark_enriched(conn, RAW_ARTICLES[0]["url"], _enriched(is_ai_related=True))
    output_path = tmp_path / "enriched_data.jsonl"

    count = pipeline.run_export_stage(conn, output_path=output_path)

    assert count == 1
    lines = output_path.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 1
    record = json.loads(lines[0])
    assert record["url"] == RAW_ARTICLES[0]["url"]
    assert record["title"] == RAW_ARTICLES[0]["title"]
    assert "fetched_at" in record
    assert record["is_ai_related"] is True
    assert record["topic"] == "AI_MODELS"

    row = conn.execute(
        "SELECT exported_at FROM articles WHERE url = ?", (RAW_ARTICLES[0]["url"],)
    ).fetchone()
    assert row["exported_at"] is not None


def test_run_export_stage_excludes_unenriched_articles(conn, tmp_path):
    db.insert_fetched_articles(conn, RAW_ARTICLES)  # nothing enriched yet
    output_path = tmp_path / "enriched_data.jsonl"

    count = pipeline.run_export_stage(conn, output_path=output_path)

    assert count == 0
    assert output_path.read_text(encoding="utf-8") == ""


def test_run_config_export_stage_writes_reveal_interval(mocker, tmp_path):
    mocker.patch("src.pipeline.settings.REVEAL_MIN_INTERVAL_SECONDS", 5.0)
    mocker.patch("src.pipeline.settings.REVEAL_MAX_INTERVAL_SECONDS", 8.0)
    output_path = tmp_path / "pipeline_config.json"

    pipeline.run_config_export_stage(output_path=output_path)

    config = json.loads(output_path.read_text(encoding="utf-8"))
    assert config == {"reveal_min_interval_ms": 5000, "reveal_max_interval_ms": 8000}


def test_run_pipeline_calls_stages_in_order(conn, mocker, tmp_path):
    mocker.patch("src.pipeline.settings.FRONTEND_CONFIG_OUTPUT_PATH", str(tmp_path / "config.json"))
    call_order = []
    mocker.patch("src.pipeline.run_fetch_stage", side_effect=lambda c: call_order.append("fetch") or 3)
    mocker.patch(
        "src.pipeline.run_enrich_stage",
        side_effect=lambda c: call_order.append("enrich") or pipeline.EnrichStageResult(3, 2, 1),
    )
    mocker.patch("src.pipeline.run_export_stage", side_effect=lambda c: call_order.append("export") or 2)

    result = pipeline.run_pipeline(conn=conn)

    assert call_order == ["fetch", "enrich", "export"]
    assert result.fetched == 3
    assert result.enrich.succeeded == 2
    assert result.exported == 2


def test_run_pipeline_continues_enrich_and_export_when_fetch_stage_fails(conn, mocker, tmp_path):
    mocker.patch("src.pipeline.settings.FRONTEND_CONFIG_OUTPUT_PATH", str(tmp_path / "config.json"))
    db.insert_fetched_articles(conn, RAW_ARTICLES[:1])
    db.mark_enriched(conn, RAW_ARTICLES[0]["url"], _enriched(is_ai_related=True))

    mocker.patch("src.pipeline.run_fetch_stage", side_effect=RuntimeError("GDELT exhausted retries"))
    export_spy = mocker.patch(
        "src.pipeline.run_export_stage", side_effect=lambda c: 1,
    )

    result = pipeline.run_pipeline(conn=conn)

    assert result.fetched == 0
    export_spy.assert_called_once()


def test_run_pipeline_opens_and_closes_own_connection_when_none_given(mocker, tmp_path):
    db_path = tmp_path / "pipeline.db"
    export_path = tmp_path / "export.jsonl"
    mocker.patch("src.pipeline.settings.DB_PATH", str(db_path))
    mocker.patch("src.pipeline.settings.EXPORT_OUTPUT_PATH", str(export_path))
    mocker.patch("src.pipeline.settings.FRONTEND_CONFIG_OUTPUT_PATH", str(tmp_path / "config.json"))
    mocker.patch("src.pipeline.fetch_articles", return_value=[])

    result = pipeline.run_pipeline()

    assert result.fetched == 0
    assert db_path.exists()
    assert export_path.exists()
