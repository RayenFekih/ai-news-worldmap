import json
import logging
from enum import Enum
from typing import Any

import requests
import trafilatura
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from src.data_sync import HEADERS
from src.prompts import SYSTEM_PROMPT, build_user_prompt
from src.settings import settings

logger = logging.getLogger(__name__)

_MIN_EXTRACTED_CHARS = 200


class Topic(str, Enum):
    AI_MODELS = "AI_MODELS"
    AI_AGENTS = "AI_AGENTS"
    COMPUTER_VISION = "COMPUTER_VISION"
    ROBOTICS = "ROBOTICS"
    ENTERPRISE_AI = "ENTERPRISE_AI"
    AI_RESEARCH = "AI_RESEARCH"
    AI_INFRASTRUCTURE = "AI_INFRASTRUCTURE"
    AI_REGULATION = "AI_REGULATION"
    AI_INVESTMENT = "AI_INVESTMENT"
    OTHER = "OTHER"


class EntityType(str, Enum):
    ORGANIZATION = "ORGANIZATION"
    MODEL = "MODEL"
    PRODUCT = "PRODUCT"
    PERSON = "PERSON"
    RESEARCH_LAB = "RESEARCH_LAB"
    UNIVERSITY = "UNIVERSITY"
    COUNTRY = "COUNTRY"
    TECHNOLOGY = "TECHNOLOGY"


class RelevanceLevel(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    NONE = "NONE"


class Entity(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(max_length=100)
    type: EntityType


class EnrichedArticle(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # No `= None` defaults below: every key must still be *required* in the JSON Schema handed to
    # Ollama (nullable value, mandatory key) so the model can't close the object early by omitting
    # fields — with a default, Pydantic drops the key from the schema's `required` list and a small
    # model under greedy decoding will happily stop after the first few properties.
    is_ai_related: bool
    ai_relevance_confidence: float = Field(ge=0.0, le=1.0)
    rejection_reason: str | None = Field(max_length=200)

    title_ar: str | None = Field(max_length=300)
    topic: Topic | None
    topic_ar: str | None = Field(max_length=60)
    entities: list[Entity] | None = Field(max_length=10)
    summary_en: str | None = Field(max_length=400)
    summary_ar: str | None = Field(max_length=400)
    mena_relevance: RelevanceLevel | None
    mena_relevance_ar: str | None = Field(max_length=200)
    ihorizons_relevance: RelevanceLevel | None
    ihorizons_relevance_ar: str | None = Field(max_length=200)
    narration_ar: str | None = Field(max_length=300)
    narration_en: str | None = Field(max_length=300)

    @model_validator(mode="after")
    def _check_conditional_fields(self) -> "EnrichedArticle":
        enrichment_fields = (
            "title_ar", "topic", "topic_ar", "entities", "summary_en", "summary_ar",
            "mena_relevance", "mena_relevance_ar", "ihorizons_relevance",
            "ihorizons_relevance_ar", "narration_ar", "narration_en",
        )
        if self.is_ai_related:
            missing = [f for f in enrichment_fields if getattr(self, f) is None]
            if missing:
                raise ValueError(f"is_ai_related=True but missing fields: {missing}")
        else:
            if self.rejection_reason is None:
                raise ValueError("is_ai_related=False requires rejection_reason")
            # The model sometimes reasonably emits a "no relevance" enum value or an empty entity
            # list instead of a bare null for a rejected article — treat those as unset too, then
            # canonicalize to None so downstream consumers see one consistent rejected-article shape.
            neutral = {"entities": [], "mena_relevance": RelevanceLevel.NONE, "ihorizons_relevance": RelevanceLevel.NONE}
            populated = []
            for f in enrichment_fields:
                value = getattr(self, f)
                if value is None:
                    continue
                if f in neutral and value == neutral[f]:
                    setattr(self, f, None)
                    continue
                populated.append(f)
            if populated:
                raise ValueError(f"is_ai_related=False but enrichment fields set: {populated}")
        return self


_RESPONSE_SCHEMA: dict[str, Any] = EnrichedArticle.model_json_schema()


def fetch_article_text(url: str) -> str | None:
    """Fetch the article at `url` and extract readable body text, or None on any failure."""
    if not url:
        return None
    try:
        response = requests.get(url, headers=HEADERS, timeout=settings.ARTICLE_FETCH_TIMEOUT_SECONDS)
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Could not fetch article %s: %s", url, exc)
        return None

    text = trafilatura.extract(response.text, favor_recall=True)
    if not text or len(text) < _MIN_EXTRACTED_CHARS:
        logger.warning("Could not extract usable article text from %s", url)
        return None

    return text[: settings.ARTICLE_FETCH_MAX_CHARS]


def _call_ollama(messages: list[dict[str, str]]) -> dict[str, Any]:
    response = requests.post(
        f"{settings.OLLAMA_BASE_URL}/api/chat",
        json={
            "model": settings.OLLAMA_MODEL,
            "messages": messages,
            "format": _RESPONSE_SCHEMA,
            "options": {
                "temperature": settings.OLLAMA_TEMPERATURE,
                "seed": settings.OLLAMA_SEED,
                "top_p": 1.0,
                "repeat_penalty": 1.15,
                "num_predict": settings.OLLAMA_NUM_PREDICT,
                "num_ctx": settings.OLLAMA_NUM_CTX,
            },
            "stream": False,
        },
        timeout=settings.OLLAMA_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.json()


def enrich_article(article: dict[str, Any]) -> EnrichedArticle | None:
    body = fetch_article_text(article.get("url", ""))
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": build_user_prompt(article, body)},
    ]
    try:
        raw = _call_ollama(messages)
        content = raw["message"]["content"]
        parsed = json.loads(content)
        return EnrichedArticle.model_validate(parsed)
    except (requests.RequestException, KeyError, json.JSONDecodeError, ValidationError) as exc:
        logger.error("Enrichment failed for %s: %s", article.get("url", "<unknown>"), exc)
        return None


if __name__ == "__main__":
    import pathlib

    path = pathlib.Path("data/news_data.jsonl")
    if not path.exists():
        print("data/news_data.jsonl not found — run the fetch pipeline first.")
    else:
        with path.open(encoding="utf-8") as f:
            sample = json.loads(f.readline())
        print(f"Enriching sample article: {sample.get('title')!r}\n")
        result = enrich_article(sample)
        if result is None:
            print("Enrichment failed — see logs above.")
        else:
            print(result.model_dump_json(indent=2))
