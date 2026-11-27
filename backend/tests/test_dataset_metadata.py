"""EZW-46: GET /datasets returns catalog metadata."""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import public_data
from app.auth import get_current_user, get_db
from app.main import app


@pytest.fixture
def client(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1)
    app.dependency_overrides[get_db] = lambda: None
    yield TestClient(app)
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_db, None)


def _dataset(**extra):
    base = dict(code="gps-demo", kind="gps", schema_version="1.0", requires_consent=True,
                title=None, classification=None, owner=None, description=None)
    base.update(extra)
    return SimpleNamespace(**base)


def test_datasets_return_metadata(client, monkeypatch):
    item = _dataset(title="GPS positions", classification="personal",
                    owner="Demo carrier", description="Demo GPS feed")
    monkeypatch.setattr(public_data, "fetch_datasets", lambda db: [item])
    response = client.get("/datasets")
    assert response.status_code == 200
    body = response.json()[0]
    assert body["code"] == "gps-demo"
    assert body["title"] == "GPS positions"
    assert body["classification"] == "personal"
    assert body["owner"] == "Demo carrier"
    assert body["description"] == "Demo GPS feed"


def test_datasets_metadata_may_be_null(client, monkeypatch):
    monkeypatch.setattr(public_data, "fetch_datasets", lambda db: [_dataset()])
    response = client.get("/datasets")
    assert response.status_code == 200
    body = response.json()[0]
    assert body["title"] is None
    assert body["classification"] is None
    assert body["requires_consent"] is True


def test_datasets_require_token():
    response = TestClient(app).get("/datasets")
    assert response.status_code == 401
