CREATE TABLE IF NOT EXISTS articles (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    url                 TEXT NOT NULL UNIQUE,
    url_mobile          TEXT,
    title               TEXT,
    seendate            TEXT,
    socialimage         TEXT,
    domain              TEXT,
    language            TEXT,
    sourcecountry       TEXT,
    fetched_at          TEXT NOT NULL,
    enrichment_status   TEXT NOT NULL DEFAULT 'pending' CHECK (enrichment_status IN ('pending', 'enriched', 'failed')),
    enrichment_attempts INTEGER NOT NULL DEFAULT 0,
    enriched_at         TEXT,
    enrichment_json     TEXT,
    exported_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_articles_enrichment_status ON articles (enrichment_status);
CREATE INDEX IF NOT EXISTS idx_articles_exported_at ON articles (exported_at);
CREATE INDEX IF NOT EXISTS idx_articles_fetched_at ON articles (fetched_at);
