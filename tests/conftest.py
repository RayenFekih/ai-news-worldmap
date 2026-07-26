import pytest


@pytest.fixture(autouse=True)
def _no_real_sleep(monkeypatch):
    """Neutralizes tenacity's real backoff sleeps so retry-decorated code under test runs at full speed."""
    monkeypatch.setattr("tenacity.nap.time.sleep", lambda *_: None)
