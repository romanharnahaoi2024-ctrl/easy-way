from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

import app.audit as audit_module
from app.audit import (
    NO_ROLE_PERMISSION, OK, VALIDATION_FAILED, add_audit_event,
)
from app.auth import get_current_user, get_db
from app.main import app
from app.models import AuditEvent, User

NOW = datetime(2026, 11, 25, 12, 0, tzinfo=timezone.utc)
ALLOWED_KEYS = {"id", "request_id", "occurred_at", "outcome", "reason_code", "user_id", "dataset"}


def make_event(id=1, request_id=1, outcome="success", reason="OK"):
    return AuditEvent(
        id=id, request_id=request_id, occurred_at=NOW,
        outcome=outcome, reason_code=reason,
    )


class FakeAuditQuery:
    """Імітує ланцюжок query(...).outerjoin().filter()...all()."""

    def __init__(self, rows):
        self.rows = list(rows)
        self.filter_calls = 0

    def outerjoin(self, *args, **kwargs):
        return self

    def filter(self, *args, **kwargs):
        self.filter_calls += 1
        return self

    def order_by(self, *args, **kwargs):
        return self

    def offset(self, n):
        self.rows = self.rows[n:]
        return self

    def limit(self, n):
        self.rows = self.rows[:n]
        return self

    def all(self):
        return self.rows


class FakeDB:
    def __init__(self, rows=()):
        self.q = FakeAuditQuery(rows)
        self.added = []
        self.commits = 0

    def query(self, *entities):
        return self.q

    def add(self, item):
        self.added.append(item)

    def commit(self):
        self.commits += 1


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def setup(monkeypatch, db, roles):
    user = User(id=1, email="u@example.com", password_hash="h", is_active=True)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db
    monkeypatch.setattr(audit_module, "get_user_roles", lambda u, d: list(roles))


# --- доступ ---

def test_audit_requires_token(client):
    assert client.get("/audit").status_code == 401


@pytest.mark.parametrize("role", ["consumer", "carrier"])
def test_other_roles_get_403(client, monkeypatch, role):
    setup(monkeypatch, FakeDB(), roles=(role,))
    assert client.get("/audit").status_code == 403


@pytest.mark.parametrize("role", ["admin", "auditor"])
def test_admin_and_auditor_get_200(client, monkeypatch, role):
    rows = [(make_event(), 5, "gps-demo")]
    setup(monkeypatch, FakeDB(rows), roles=(role,))
    response = client.get("/audit")
    assert response.status_code == 200
    item = response.json()[0]
    assert item["request_id"] == 1
    assert item["user_id"] == 5
    assert item["dataset"] == "gps-demo"


# --- вміст відповіді ---

def test_response_has_only_allowed_fields_no_secrets(client, monkeypatch):
    rows = [(make_event(), 5, "gps-demo")]
    setup(monkeypatch, FakeDB(rows), roles=("admin",))
    response = client.get("/audit")
    for item in response.json():
        assert set(item) == ALLOWED_KEYS
    assert "password" not in response.text.lower()


def test_event_without_request_has_null_user_and_dataset(client, monkeypatch):
    rows = [(make_event(request_id=None, outcome="denied", reason="NO_ROLE_PERMISSION"), None, None)]
    setup(monkeypatch, FakeDB(rows), roles=("auditor",))
    item = client.get("/audit").json()[0]
    assert item["request_id"] is None
    assert item["user_id"] is None
    assert item["dataset"] is None


# --- фільтри і пагінація ---

def test_filters_are_applied(client, monkeypatch):
    db = FakeDB([(make_event(), 5, "gps-demo")])
    setup(monkeypatch, db, roles=("admin",))
    client.get("/audit?reason_code=OK&outcome=success&request_id=1")
    assert db.q.filter_calls == 3


def test_limit_and_offset(client, monkeypatch):
    rows = [(make_event(id=i), 5, "gps-demo") for i in range(1, 6)]
    setup(monkeypatch, FakeDB(rows), roles=("admin",))
    response = client.get("/audit?limit=2&offset=1")
    assert [e["id"] for e in response.json()] == [2, 3]


def test_invalid_limit_is_422(client, monkeypatch):
    setup(monkeypatch, FakeDB(), roles=("admin",))
    assert client.get("/audit?limit=0").status_code == 422


# --- add_audit_event ---

def test_add_audit_event_adds_without_commit():
    db = FakeDB()
    event = add_audit_event(db, 7, "invalid", VALIDATION_FAILED, NOW)
    assert db.added == [event]
    assert db.commits == 0
    assert event.request_id == 7
    assert event.reason_code == VALIDATION_FAILED
    assert event.occurred_at == NOW


def test_add_audit_event_rejects_unknown_reason():
    with pytest.raises(ValueError):
        add_audit_event(FakeDB(), 1, "success", "SOMETHING_ELSE", NOW)