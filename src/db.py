import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from src.data_enrichment import EnrichedArticle
from src.settings import settings

_SCHEMA_PATH = Path(__file__).parent / "schema.sql"

_RAW_COLUMNS = (
    "url", "url_mobile", "title", "seendate", "socialimage",
    "domain", "language", "sourcecountry",
)


def get_connection(db_path: str | None = None) -> sqlite3.Connection:
    path = db_path or settings.DB_PATH
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(_SCHEMA_PATH.read_text(encoding="utf-8"))
    conn.commit()


def insert_fetched_articles(conn: sqlite3.Connection, articles: list[dict[str, Any]]) -> int:
    """Inserts newly-seen articles (deduped on `url`), assigning `fetched_at` once. Returns count of new rows."""
    fetched_at = datetime.now(timezone.utc).isoformat()
    inserted = 0
    for article in articles:
        cursor = conn.execute(
            """
            INSERT OR IGNORE INTO articles
                (url, url_mobile, title, seendate, socialimage, domain, language, sourcecountry, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (*(article.get(col) for col in _RAW_COLUMNS), fetched_at),
        )
        inserted += cursor.rowcount
    conn.commit()
    return inserted


def get_unenriched(
    conn: sqlite3.Connection,
    max_attempts: int | None = None,
    limit: int | None = None,
) -> list[sqlite3.Row]:
    conditions = ["enrichment_status = 'pending'"]
    params: list[Any] = []
    if max_attempts is not None:
        conditions.append("(enrichment_status = 'failed' AND enrichment_attempts < ?)")
        params.append(max_attempts)

    query = f"SELECT * FROM articles WHERE {' OR '.join(conditions)} ORDER BY fetched_at ASC"
    if limit:
        query += " LIMIT ?"
        params.append(limit)
    return conn.execute(query, params).fetchall()


def mark_enriched(conn: sqlite3.Connection, url: str, enriched: EnrichedArticle) -> None:
    conn.execute(
        """
        UPDATE articles
        SET enrichment_status = 'enriched', enriched_at = ?, enrichment_json = ?
        WHERE url = ?
        """,
        (datetime.now(timezone.utc).isoformat(), enriched.model_dump_json(), url),
    )
    conn.commit()


def mark_enrichment_failed(conn: sqlite3.Connection, url: str) -> None:
    conn.execute(
        """
        UPDATE articles
        SET enrichment_status = 'failed', enrichment_attempts = enrichment_attempts + 1
        WHERE url = ?
        """,
        (url,),
    )
    conn.commit()


def get_articles_for_export(conn: sqlite3.Connection, since_utc: str) -> list[sqlite3.Row]:
    return conn.execute(
        """
        SELECT * FROM articles
        WHERE enrichment_status = 'enriched' AND fetched_at >= ?
        ORDER BY fetched_at ASC
        """,
        (since_utc,),
    ).fetchall()


def get_unexported(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM articles WHERE enrichment_status = 'enriched' AND exported_at IS NULL"
    ).fetchall()


def mark_exported(conn: sqlite3.Connection, urls: list[str], exported_at: str) -> None:
    if not urls:
        return
    conn.executemany(
        "UPDATE articles SET exported_at = ? WHERE url = ? AND exported_at IS NULL",
        [(exported_at, url) for url in urls],
    )
    conn.commit()
