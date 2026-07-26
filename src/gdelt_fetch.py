import logging
from typing import Any

import requests
from tenacity import Retrying, retry_if_exception_type, stop_after_attempt, wait_exponential_jitter

from src.settings import settings

logger = logging.getLogger(__name__)

HEADERS = {
    # GDELT started rate-limiting/rejecting requests that don't look like a real browser (see
    # https://github.com/alex9smith/gdelt-doc-api/issues/22) - a bot-like UA gets 429'd even at
    # low request volume, so this mimics a real browser rather than identifying our own client.
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
}

RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


class GdeltRetryableError(Exception):
    """Raised for GDELT responses (429/5xx) that are worth retrying."""


def build_params() -> dict[str, Any]:
    return {
        "query": settings.GDELT_QUERY,
        "mode": "ArtList",
        "format": "json",
        "maxrecords": settings.n_news,
        "sort": "DateDesc",
        "timespan": settings.GDELT_TIMESPAN,
    }


def _fetch_once(params: dict[str, Any]) -> dict[str, Any]:
    response = requests.get(
        settings.BASE_URL,
        params=params,
        headers=HEADERS,
        timeout=settings.GDELT_TIMEOUT_SECONDS,
    )
    if response.status_code == 200:
        try:
            return response.json()
        except ValueError as exc:
            # GDELT sometimes returns 200 with an empty/truncated body when overloaded - treat
            # an unparseable "success" response as retryable rather than a hard failure.
            raise GdeltRetryableError(f"GDELT returned 200 with an unparseable body: {exc}") from exc
    if response.status_code in RETRYABLE_STATUS_CODES:
        raise GdeltRetryableError(f"GDELT returned {response.status_code}")
    response.raise_for_status()
    return response.json()


def fetch_gdelt(params: dict[str, Any]) -> dict[str, Any]:
    """Fetches from GDELT, retrying with exponential backoff+jitter on 429/5xx/connection errors.

    Any other non-200 response (e.g. a malformed query) fails fast without retrying.
    """
    retryer = Retrying(
        retry=retry_if_exception_type((GdeltRetryableError, requests.ConnectionError, requests.Timeout)),
        wait=wait_exponential_jitter(initial=settings.GDELT_RETRY_BASE_SECONDS, max=settings.GDELT_RETRY_MAX_SECONDS),
        stop=stop_after_attempt(settings.GDELT_MAX_RETRY_ATTEMPTS),
        reraise=True,
    )
    return retryer(_fetch_once, params)


def fetch_articles() -> list[dict[str, Any]]:
    """Fetches from GDELT using Settings-derived params, returns the raw `articles` list."""
    payload = fetch_gdelt(build_params())
    return payload.get("articles", [])
