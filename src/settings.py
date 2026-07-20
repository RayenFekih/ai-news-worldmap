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

    BASE_URL: str = "https://api.gdeltproject.org/api/v2/doc/doc"
    n_news: int = Field(default=50, description="Numbers of News to pull from the GDELT server.")

    OLLAMA_BASE_URL: str = Field(default="http://localhost:11434", description="Base URL of the local Ollama server.")
    OLLAMA_MODEL: str = Field(default="qwen3:4b-instruct-2507-q4_K_M", description="Ollama model tag used for article enrichment.")
    OLLAMA_TIMEOUT_SECONDS: int = Field(default=120, description="Request timeout (seconds) for Ollama enrichment calls.")
    OLLAMA_TEMPERATURE: float = Field(default=0.0, description="Sampling temperature for deterministic enrichment output.")
    OLLAMA_SEED: int = Field(default=42, description="Fixed seed for deterministic enrichment output.")
    OLLAMA_NUM_PREDICT: int = Field(default=1500, description="Max tokens to generate; bounds runaway generation.")
    OLLAMA_NUM_CTX: int = Field(default=8192, description="Context window size; needs headroom for full article text.")
    ARTICLE_FETCH_TIMEOUT_SECONDS: int = Field(default=20, description="Timeout for fetching an article's full HTML.")
    ARTICLE_FETCH_MAX_CHARS: int = Field(default=6000, description="Max characters of extracted article text sent to the model.")

settings = Settings()
