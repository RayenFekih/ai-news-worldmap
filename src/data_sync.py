import time
from typing import Any

import pandas as pd
import requests
from src.settings import settings


HEADERS = {
    "User-Agent": "ai-news-worldmap/0.1 contact=rayen.fekih6@gmail.com",
}

query = (
    '("artificial intelligence" OR "generative AI" OR '
    '"large language model" OR OpenAI OR Anthropic OR Gemini OR '
    'DeepMind OR Mistral OR Qwen)'
)

params = {
    "query": query,
    "mode": "ArtList",
    "format": "json",
    "maxrecords": settings.n_news,
    "sort": "DateDesc",
    "timespan": "6h",
}


def fetch_gdelt(
    params: dict[str, Any],
    max_attempts: int = 4,
) -> dict[str, Any]:
    for attempt in range(max_attempts):
        response = requests.get(
            settings.BASE_URL,
            params=params,
            headers=HEADERS,
            timeout=60,
        )

        if response.status_code == 200:
            return response.json()

        if response.status_code == 429:
            wait_seconds = max(5, 5 * (attempt + 1))
            print(f"Rate limited. Retrying in {wait_seconds} seconds...")
            time.sleep(wait_seconds)
            continue

        response.raise_for_status()

    raise RuntimeError(
        f"GDELT remained rate limited after {max_attempts} attempts."
    )