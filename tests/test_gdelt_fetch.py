import requests

from src.gdelt_fetch import build_params, fetch_articles, fetch_gdelt

SAMPLE_PAYLOAD = {"articles": [{"url": "https://example.com/a", "title": "AI story"}]}


def _mock_response(mocker, status_code, json_data=None):
    response = mocker.Mock()
    response.status_code = status_code
    response.json.return_value = json_data if json_data is not None else {}
    if status_code >= 400:
        response.raise_for_status.side_effect = requests.exceptions.HTTPError(f"{status_code} error")
    else:
        response.raise_for_status.return_value = None
    return response


def _mock_unparseable_200_response(mocker):
    response = mocker.Mock()
    response.status_code = 200
    response.json.side_effect = requests.exceptions.JSONDecodeError("Expecting value", "", 0)
    response.raise_for_status.return_value = None
    return response


def test_build_params_reflects_settings(monkeypatch):
    monkeypatch.setattr("src.gdelt_fetch.settings.GDELT_QUERY", "OpenAI")
    monkeypatch.setattr("src.gdelt_fetch.settings.GDELT_TIMESPAN", "30min")
    monkeypatch.setattr("src.gdelt_fetch.settings.n_news", 25)

    params = build_params()

    assert params["query"] == "OpenAI"
    assert params["timespan"] == "30min"
    assert params["maxrecords"] == 25
    assert params["mode"] == "ArtList"
    assert params["sort"] == "DateDesc"


def test_fetch_gdelt_succeeds_on_first_try(mocker):
    mock_get = mocker.patch(
        "src.gdelt_fetch.requests.get", return_value=_mock_response(mocker, 200, SAMPLE_PAYLOAD)
    )

    result = fetch_gdelt({"query": "AI"})

    assert result == SAMPLE_PAYLOAD
    assert mock_get.call_count == 1


def test_fetch_gdelt_retries_on_429_then_succeeds(mocker):
    mock_get = mocker.patch(
        "src.gdelt_fetch.requests.get",
        side_effect=[_mock_response(mocker, 429), _mock_response(mocker, 200, SAMPLE_PAYLOAD)],
    )

    result = fetch_gdelt({"query": "AI"})

    assert result == SAMPLE_PAYLOAD
    assert mock_get.call_count == 2


def test_fetch_gdelt_retries_on_connection_error_then_succeeds(mocker):
    mock_get = mocker.patch(
        "src.gdelt_fetch.requests.get",
        side_effect=[requests.exceptions.ConnectionError("refused"), _mock_response(mocker, 200, SAMPLE_PAYLOAD)],
    )

    result = fetch_gdelt({"query": "AI"})

    assert result == SAMPLE_PAYLOAD
    assert mock_get.call_count == 2


def test_fetch_gdelt_retries_on_unparseable_200_body_then_succeeds(mocker):
    mock_get = mocker.patch(
        "src.gdelt_fetch.requests.get",
        side_effect=[_mock_unparseable_200_response(mocker), _mock_response(mocker, 200, SAMPLE_PAYLOAD)],
    )

    result = fetch_gdelt({"query": "AI"})

    assert result == SAMPLE_PAYLOAD
    assert mock_get.call_count == 2


def test_fetch_gdelt_raises_after_exhausting_retries(mocker, monkeypatch):
    monkeypatch.setattr("src.gdelt_fetch.settings.GDELT_MAX_RETRY_ATTEMPTS", 2)
    mock_get = mocker.patch(
        "src.gdelt_fetch.requests.get",
        return_value=_mock_response(mocker, 429),
    )

    try:
        fetch_gdelt({"query": "AI"})
        assert False, "expected fetch_gdelt to raise"
    except Exception:
        pass

    assert mock_get.call_count == 2


def test_fetch_gdelt_fails_fast_on_non_retryable_status(mocker):
    mock_get = mocker.patch(
        "src.gdelt_fetch.requests.get", return_value=_mock_response(mocker, 404)
    )

    try:
        fetch_gdelt({"query": "AI"})
        assert False, "expected fetch_gdelt to raise"
    except requests.exceptions.HTTPError:
        pass

    assert mock_get.call_count == 1


def test_fetch_articles_returns_articles_list(mocker):
    mocker.patch("src.gdelt_fetch.requests.get", return_value=_mock_response(mocker, 200, SAMPLE_PAYLOAD))

    articles = fetch_articles()

    assert articles == SAMPLE_PAYLOAD["articles"]


def test_fetch_articles_returns_empty_list_when_missing(mocker):
    mocker.patch("src.gdelt_fetch.requests.get", return_value=_mock_response(mocker, 200, {}))

    assert fetch_articles() == []
