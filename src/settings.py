from logging.config import dictConfig

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

from src.logger import LOGGING_CONFIG

# Setting up logging format and configuration for all scripts
dictConfig(LOGGING_CONFIG)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", extra="ignore", env_file_encoding="utf-8"
    )

    # Plain HTTP, not HTTPS: GDELT serves this endpoint over both, and on some networks HTTPS to
    # this host's IP hangs at the TCP level (blocked/filtered) while plain HTTP works fine.
    # Override via .env if your network needs https instead.
    BASE_URL: str = "http://api.gdeltproject.org/api/v2/doc/doc"
    n_news: int = Field(default=200, description="Numbers of News to pull from the GDELT server.")

    OLLAMA_BASE_URL: str = Field(default="http://localhost:11434", description="Base URL of the local Ollama server.")
    OLLAMA_MODEL: str = Field(default="qwen3:4b-instruct-2507-q4_K_M", description="Ollama model tag used for article enrichment.")
    OLLAMA_TIMEOUT_SECONDS: int = Field(default=120, description="Request timeout (seconds) for Ollama enrichment calls.")
    OLLAMA_TEMPERATURE: float = Field(default=0.0, description="Sampling temperature for deterministic enrichment output.")
    OLLAMA_SEED: int = Field(default=42, description="Fixed seed for deterministic enrichment output.")
    OLLAMA_NUM_PREDICT: int = Field(default=1500, description="Max tokens to generate; bounds runaway generation.")
    OLLAMA_NUM_CTX: int = Field(default=8192, description="Context window size; needs headroom for full article text.")
    ARTICLE_FETCH_TIMEOUT_SECONDS: int = Field(default=20, description="Timeout for fetching an article's full HTML.")
    ARTICLE_FETCH_MAX_CHARS: int = Field(default=6000, description="Max characters of extracted article text sent to the model.")

    # GDELT fetch
    GDELT_QUERY: str = Field(
        default=(
            '("artificial intelligence" OR "generative AI" OR '
            '"large language model" OR OpenAI OR Anthropic OR Gemini OR '
            'DeepMind OR Mistral OR Qwen)'
        ),
        description="GDELT DOC 2.0 query string.",
    )
    GDELT_TIMESPAN: str = Field(
        default="500min",
        description="GDELT lookback window per fetch; kept wider than PIPELINE_INTERVAL_MINUTES for safety overlap — dedup on `url` handles the overlap.",
    )
    GDELT_TIMEOUT_SECONDS: int = Field(default=60, description="Per-request timeout for the GDELT API call.")
    GDELT_MAX_RETRY_ATTEMPTS: int = Field(default=5, description="Max tenacity attempts for fetch_gdelt.")
    GDELT_RETRY_BASE_SECONDS: float = Field(default=5.0, description="Base wait for exponential backoff+jitter between GDELT retries.")
    GDELT_RETRY_MAX_SECONDS: float = Field(default=120.0, description="Cap on a single GDELT retry wait interval.")

    # Enrichment retry tuning
    OLLAMA_RETRY_MAX_ATTEMPTS: int = Field(default=3, description="Max attempts for a single Ollama call on connection/timeout errors.")
    OLLAMA_RETRY_WAIT_SECONDS: float = Field(default=2.0, description="Base wait for Ollama retry backoff.")
    ARTICLE_FETCH_RETRY_MAX_ATTEMPTS: int = Field(default=2, description="Max attempts to fetch an article's HTML on connection/timeout errors.")
    ARTICLE_FETCH_RETRY_WAIT_SECONDS: float = Field(default=2.0, description="Fixed wait between article-fetch retry attempts.")

    # Pipeline / persistence / scheduling
    DB_PATH: str = Field(default="data/pipeline.db", description="SQLite database file path.")
    PIPELINE_INTERVAL_MINUTES: int = Field(default=60, description="Interval between fetch-enrich-export cycles in --loop mode; matches GDELT's real update cadence.")
    ENRICH_BATCH_LIMIT: int = Field(default=0, description="Max unenriched articles processed per pipeline run; 0 = no limit.")
    ENRICH_MAX_ATTEMPTS: int = Field(default=3, description="Max enrichment attempts before a row is left permanently 'failed'.")
    EXPORT_LOOKBACK_HOURS: int = Field(default=168, description="Only enriched articles fetched within this window are written to the export JSONL. Kept generous (1 week) since GDELT is an unauthenticated public API that can go days without a successful fetch on a rate-limited/throttled IP - a tight window would otherwise let the export age out to empty during an extended upstream outage.")
    EXPORT_OUTPUT_PATH: str = Field(default="web/public/data/enriched_data.jsonl", description="Destination JSONL file consumed by the frontend.")

    # Frontend playback tuning (exported to a small JSON sidecar, see pipeline.run_config_export_stage)
    REVEAL_MIN_INTERVAL_SECONDS: float = Field(default=15.0, description="Minimum seconds between article reveals in the frontend ticker.")
    REVEAL_MAX_INTERVAL_SECONDS: float = Field(default=30.0, description="Maximum seconds between article reveals in the frontend ticker.")
    FRONTEND_CONFIG_OUTPUT_PATH: str = Field(default="web/public/data/pipeline_config.json", description="Destination JSON file for frontend-facing runtime config (reveal interval, etc.).")

settings = Settings()
