import os

os.environ.setdefault("DB_PASSWORD", "test-password")

from datetime import datetime, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

import app.public_data as pd
from app.auth import get_current_user, get_db
from app.main import app
from app.models import Dataset, Route, User

NOW = datetime(2026, 11, 25, 12, 0, tzinfo=timezone.utc)


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def login_as_anyone():
    user = User(id=1, email="u@example.com", password_hash="h", is_active=True)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: object()


@pytest.mark.parametrize("path", ["/routes", "/positions/latest", "/datasets"])
def test_requires_token(client, path):
    response = client.get(path)
    assert response.status_code == 401
    assert response.json()["reason_code"] == "UNAUTHENTICATED"


def test_build_routes_orders_stops_and_converts_numbers():
    route = Route(id=1, code="M1", direction="A-B", name="Маршрут M1")
    rows = [
        (1, 1, 10, "Вокзал", Decimal("49.840800"), Decimal("23.993100")),
        (1, 2, 11, "Площа", Decimal("49.841700"), Decimal("24.022000")),
    ]
    result = pd.build_routes([route, Route(id=2, code="M2", direction="B-A", name="M2")], rows)
    assert result[0] == {
        "code": "M1", "direction": "A-B", "name": "Маршрут M1",
        "stops": [
            {"id": 10, "name": "Вокзал", "lat": 49.8408, "lon": 23.9931, "order": 1},
            {"id": 11, "name": "Площа", "lat": 49.8417, "lon": 24.022, "order": 2},
        ],
    }
    assert result[1]["stops"] == []


def test_routes_endpoint(client, monkeypatch):
    login_as_anyone()
    monkeypatch.setattr(pd, "fetch_routes", lambda db: ([Route(id=1, code="M1", direction="A-B", name="M1")], []))
    response = client.get("/routes")
    assert response.status_code == 200
    assert response.json() == [{"code": "M1", "direction": "A-B", "name": "M1", "stops": []}]


def test_latest_positions_endpoint(client, monkeypatch):
    login_as_anyone()
    monkeypatch.setattr(
        pd, "fetch_latest_positions",
        lambda db: [("BUS-01", "M1", Decimal("49.84"), Decimal("24.0"), NOW), ("BUS-02", None, Decimal("1"), Decimal("2"), NOW)],
    )
    items = client.get("/positions/latest").json()
    observed = items[0].pop("observed_at")
    assert datetime.fromisoformat(observed.replace("Z", "+00:00")) == NOW
    assert items[0] == {"fleet_code": "BUS-01", "route_code": "M1", "lat": 49.84, "lon": 24.0}
    assert items[1]["route_code"] is None


def test_datasets_endpoint_returns_only_metadata(client, monkeypatch):
    login_as_anyone()
    monkeypatch.setattr(
        pd, "fetch_datasets",
        lambda db: [Dataset(id=1, code="gps-demo", kind="gps", schema_version="1.0", requires_consent=True)],
    )
    assert client.get("/datasets").json() == [
        {"code": "gps-demo", "kind": "gps", "schema_version": "1.0", "requires_consent": True,
         "title": None, "classification": None, "owner": None, "description": None}
    ]