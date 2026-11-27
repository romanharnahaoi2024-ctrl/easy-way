import os

os.environ.setdefault("DB_PASSWORD", "test-password")

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class FakeConnection:
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def execute(self, statement):
        return None


def test_health_returns_ok_when_database_is_available(monkeypatch):
    monkeypatch.setattr("app.main.engine.connect", lambda: FakeConnection())
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_health_returns_503_when_database_is_unavailable(monkeypatch):
    def unavailable():
        raise RuntimeError("database unavailable")

    monkeypatch.setattr("app.main.engine.connect", unavailable)
    response = client.get("/health")
    assert response.status_code == 503


def test_cors_allows_frontend_origin(monkeypatch):
    monkeypatch.setattr("app.main.engine.connect", lambda: FakeConnection())
    response = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
