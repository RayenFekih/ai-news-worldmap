import json

import pytest
import requests

from src.data_enrichment import EnrichedArticle, enrich_article, fetch_article_text

SAMPLE_ARTICLE = {
    "url": "https://indianexpress.com/article/technology/artificial-intelligence/openai-gpt-5-6-sol-ai-users-missing-files-10787913/",
    "url_mobile": "",
    "title": "OpenAI GPT-5.6 Sol users report missing files, deleted databases",
    "seendate": "20260715T124500Z",
    "socialimage": "",
    "domain": "indianexpress.com",
    "language": "English",
    "sourcecountry": "India",
}

AI_RELATED_RESPONSE = {
    "is_ai_related": True,
    "ai_relevance_confidence": 0.97,
    "rejection_reason": None,
    "title_ar": "مستخدمو OpenAI GPT-5.6 يبلغون عن فقدان ملفات وحذف قواعد بيانات",
    "topic": "AI_MODELS",
    "topic_ar": "نماذج الذكاء الاصطناعي",
    "entities": [{"name": "OpenAI", "type": "ORGANIZATION"}],
    "summary_en": "Users of OpenAI's GPT-5.6 report missing files and deleted databases.",
    "summary_ar": "أبلغ مستخدمو GPT-5.6 من OpenAI عن فقدان ملفات وحذف قواعد بيانات.",
    "mena_relevance": "LOW",
    "mena_relevance_ar": "الخبر عالمي ولا يخص منطقة الشرق الأوسط وشمال أفريقيا مباشرة.",
    "ihorizons_relevance": "MEDIUM",
    "ihorizons_relevance_ar": "قد يهم عملاء المؤسسات الذين يعتمدون على أدوات OpenAI.",
    "narration_ar": "مستخدمو نموذج GPT-5.6 من OpenAI يبلغون عن مشاكل في فقدان بياناتهم.",
    "narration_en": "OpenAI's GPT-5.6 users are reporting data loss issues.",
}

NOT_AI_RELATED_RESPONSE = {
    "is_ai_related": False,
    "ai_relevance_confidence": 0.98,
    "rejection_reason": "Not primarily about artificial intelligence.",
    "title_ar": None,
    "topic": None,
    "topic_ar": None,
    # A real model reasonably emits "no relevance" enums / an empty list instead of bare nulls here
    # for a rejected article — the validator should treat these as unset and canonicalize to None.
    "entities": [],
    "summary_en": None,
    "summary_ar": None,
    "mena_relevance": "NONE",
    "mena_relevance_ar": None,
    "ihorizons_relevance": "NONE",
    "ihorizons_relevance_ar": None,
    "narration_ar": None,
    "narration_en": None,
}


def _mock_ollama_response(mocker, content_dict):
    mock_response = mocker.Mock()
    mock_response.raise_for_status = mocker.Mock()
    mock_response.json.return_value = {
        "message": {"content": json.dumps(content_dict)},
    }
    return mocker.patch("src.data_enrichment.requests.post", return_value=mock_response)


def _mock_fetch_article_text(mocker, return_value="Full article body text for testing purposes."):
    return mocker.patch("src.data_enrichment.fetch_article_text", return_value=return_value)


def test_enrich_article_ai_related_happy_path(mocker):
    _mock_fetch_article_text(mocker)
    _mock_ollama_response(mocker, AI_RELATED_RESPONSE)

    result = enrich_article(SAMPLE_ARTICLE)

    assert isinstance(result, EnrichedArticle)
    assert result.is_ai_related is True
    assert result.topic.value == "AI_MODELS"
    assert result.entities[0].name == "OpenAI"
    assert result.entities[0].type.value == "ORGANIZATION"
    assert result.mena_relevance.value == "LOW"
    assert result.ihorizons_relevance.value == "MEDIUM"


def test_enrich_article_not_ai_related_happy_path(mocker):
    _mock_fetch_article_text(mocker)
    _mock_ollama_response(mocker, NOT_AI_RELATED_RESPONSE)

    result = enrich_article(SAMPLE_ARTICLE)

    assert isinstance(result, EnrichedArticle)
    assert result.is_ai_related is False
    assert result.rejection_reason == "Not primarily about artificial intelligence."
    assert result.topic is None
    assert result.summary_en is None
    assert result.entities is None
    assert result.mena_relevance is None
    assert result.ihorizons_relevance is None


def test_enrich_article_malformed_json_returns_none(mocker):
    _mock_fetch_article_text(mocker)
    mock_response = mocker.Mock()
    mock_response.raise_for_status = mocker.Mock()
    mock_response.json.return_value = {"message": {"content": "{not valid json"}}
    mocker.patch("src.data_enrichment.requests.post", return_value=mock_response)

    assert enrich_article(SAMPLE_ARTICLE) is None


def test_enrich_article_missing_required_field_returns_none(mocker):
    _mock_fetch_article_text(mocker)
    broken_response = dict(AI_RELATED_RESPONSE)
    broken_response["topic"] = None
    _mock_ollama_response(mocker, broken_response)

    assert enrich_article(SAMPLE_ARTICLE) is None


def test_enrich_article_network_error_returns_none(mocker):
    _mock_fetch_article_text(mocker)
    mocker.patch(
        "src.data_enrichment.requests.post",
        side_effect=requests.exceptions.Timeout("timed out"),
    )

    assert enrich_article(SAMPLE_ARTICLE) is None


def test_enrich_article_falls_back_to_metadata_when_fetch_fails(mocker):
    _mock_fetch_article_text(mocker, return_value=None)
    _mock_ollama_response(mocker, AI_RELATED_RESPONSE)

    result = enrich_article(SAMPLE_ARTICLE)

    assert isinstance(result, EnrichedArticle)
    assert result.is_ai_related is True


# --- fetch_article_text ---

_SAMPLE_HTML = """
<html>
<head><title>Test Article</title></head>
<body>
<nav>Home | About | Contact</nav>
<article>
<h1>Test Article Headline</h1>
<p>This is the first paragraph of a test article about artificial intelligence models and
their growing role in enterprise software, written with enough length to clear the minimum
extracted-length threshold used by the fetcher.</p>
<p>This is a second paragraph adding more detail about the same story, discussing adoption
trends across the MENA region and beyond, again padded to comfortably exceed two hundred
characters once extracted by trafilatura.</p>
</article>
<footer>Copyright 2026</footer>
</body>
</html>
"""


def test_fetch_article_text_happy_path(mocker):
    mock_response = mocker.Mock()
    mock_response.raise_for_status = mocker.Mock()
    mock_response.text = _SAMPLE_HTML
    mocker.patch("src.data_enrichment.requests.get", return_value=mock_response)

    text = fetch_article_text("https://example.com/article")

    assert text is not None
    assert "first paragraph" in text
    assert "Home | About | Contact" not in text


def test_fetch_article_text_truncates_to_max_chars(mocker, monkeypatch):
    long_html = "<html><body><article>" + "<p>" + ("word " * 3000) + "</p></article></body></html>"
    mock_response = mocker.Mock()
    mock_response.raise_for_status = mocker.Mock()
    mock_response.text = long_html
    mocker.patch("src.data_enrichment.requests.get", return_value=mock_response)
    monkeypatch.setattr("src.data_enrichment.settings.ARTICLE_FETCH_MAX_CHARS", 100)

    text = fetch_article_text("https://example.com/long-article")

    assert text is not None
    assert len(text) <= 100


def test_fetch_article_text_http_error_returns_none(mocker):
    mocker.patch(
        "src.data_enrichment.requests.get",
        side_effect=requests.exceptions.ConnectionError("refused"),
    )

    assert fetch_article_text("https://example.com/unreachable") is None


def test_fetch_article_text_too_short_extraction_returns_none(mocker):
    mock_response = mocker.Mock()
    mock_response.raise_for_status = mocker.Mock()
    mock_response.text = "<html><body><p>Too short.</p></body></html>"
    mocker.patch("src.data_enrichment.requests.get", return_value=mock_response)

    assert fetch_article_text("https://example.com/stub") is None


def test_fetch_article_text_empty_url_returns_none_without_request(mocker):
    mock_get = mocker.patch("src.data_enrichment.requests.get")

    assert fetch_article_text("") is None
    mock_get.assert_not_called()
