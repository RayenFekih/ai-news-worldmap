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

settings = Settings()
