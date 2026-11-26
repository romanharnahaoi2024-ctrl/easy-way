import os

os.environ.setdefault("DB_PASSWORD", "test-password")

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

import app.exchange as exchange_module
import app.exchange_service as svc
from app.auth import get_current_user, get_db
from app.main import app
from app.models import AuditEvent, Dataset, ExchangeRequest, User

DATASET = Dataset(id=1, code="gps-demo", kind="gps", schema_version="1.0", requires_consent=True)
GOOD_ROWS = [
    {"vehicle_id": "BUS-01", "observed_at": "2026-11-25T12:00:00+00:00", "lat": 49.84, "lon": 23.99},
    {"vehicle_id": "BUS-02", "observed_at": "2026-11-25T12:00:05+00:00", "lat": 49.83, "lon": 24.02},
]
URL = "/exchange/requests"
BODY = {"dataset_code": "gps-demo", "action": "read"}


class FakeDB:
    def __init__(self):
        self.added = []
        self.flushes = 0
        self.commits = 0

    def add(self, item):
        self.added.append(item)

    def flush(self):
        self.flushes += 1
        for item in self.added:
            if isinstance(item, ExchangeRequest) and item.id is None:
                item.id = 100

    def commit(self):
        self.commits += 1

    def requests(self):
        return [i for i in self.added if isinstance(i, ExchangeRequest)]

    def audits(self):
        return [i for i in self.added if isinstance(i, AuditEvent)]


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def setup(monkeypatch, db, *, dataset=DATASET, allowed=True, consent="OK", rows=None, user_id=1):
    user = User(id=user_id, email="u@example.com", password_hash="h", is_active=True)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db
    monkeypatch.setattr(svc, "find_dataset", lambda d, code: dataset if dataset and code == dataset.code else None)
    monkeypatch.setattr(svc, "has_dataset_permission", lambda u, ds, action, d: allowed)
    monkeypatch.setattr(svc, "check_consent", lambda d, uid, did, now: consent)
    monkeypatch.setattr(svc, "read_source", lambda d, ds: GOOD_ROWS if rows is None else rows)


def test_requires_token(client):
    response = client.post(URL, json=BODY)
    assert response.status_code == 401
    assert response.json()["reason_code"] == "UNAUTHENTICATED"
    assert response.json()["request_id"] is None


def test_success_returns_data_and_writes_audit_in_one_commit(client, monkeypatch):
    db = FakeDB()
    setup(monkeypatch, db)
    response = client.post(URL, json=BODY)
    assert response.status_code == 200
    body = response.json()
    assert body["request_id"] == 100
    assert body["state"] == "approved"
    assert body["dataset_code"] == "gps-demo"
    assert body["total"] == 2 and len(body["records"]) == 2
    assert body["masked_fields"] == []
    assert db.flushes == 1 and db.commits == 1
    req = db.requests()[0]
    assert req.state == "approved" and req.finished_at is not None
    audit = db.audits()[0]
    assert (audit.request_id, audit.outcome, audit.reason_code) == (100, "approved", "OK")


def test_no_role_permission_is_403_with_audit(client, monkeypatch):
    db = FakeDB()
    setup(monkeypatch, db, allowed=False)
    response = client.post(URL, json=BODY)
    assert response.status_code == 403
    body = response.json()
    assert body["reason_code"] == "NO_ROLE_PERMISSION"
    assert body["request_id"] == 100
    assert "records" not in body
    assert db.requests()[0].state == "denied"
    audit = db.audits()[0]
    assert (audit.outcome, audit.reason_code) == ("denied", "NO_ROLE_PERMISSION")
    assert db.commits == 1


@pytest.mark.parametrize("verdict", ["NO_CONSENT", "CONSENT_REVOKED"])
def test_consent_problems_are_403_with_reason(client, monkeypatch, verdict):
    db = FakeDB()
    setup(monkeypatch, db, consent=verdict)
    response = client.post(URL, json=BODY)
    assert response.status_code == 403
    assert response.json()["reason_code"] == verdict
    assert response.json()["request_id"] == 100
    assert db.audits()[0].reason_code == verdict
    assert db.requests()[0].state == "denied"


def test_consent_not_checked_when_not_required(client, monkeypatch):
    dataset = Dataset(id=2, code="open", kind="gps", schema_version="1.0", requires_consent=False)
    db = FakeDB()
    setup(monkeypatch, db, dataset=dataset)

    def boom(*args, **kwargs):
        raise AssertionError("consent must not be checked")

    monkeypatch.setattr(svc, "check_consent", boom)
    assert client.post(URL, json={"dataset_code": "open"}).status_code == 200


def test_invalid_data_is_422_without_raw_values(client, monkeypatch):
    bad = [{"vehicle_id": "BUS-01", "observed_at": "2026-11-25T12:00:00+00:00", "lat": 95, "lon": 23.99}]
    db = FakeDB()
    setup(monkeypatch, db, rows=GOOD_ROWS + bad)
    response = client.post(URL, json=BODY)
    assert response.status_code == 422
    body = response.json()
    assert body["reason_code"] == "VALIDATION_FAILED"
    assert body["request_id"] == 100
    assert body["errors"] == [{"row": 2, "path": "lat", "message": "значення більше допустимого"}]
    assert "95" not in response.text
    assert "records" not in body
    assert db.requests()[0].state == "invalid"
    audit = db.audits()[0]
    assert (audit.outcome, audit.reason_code) == ("invalid", "VALIDATION_FAILED")


def test_missing_field_is_422_with_field_path(client, monkeypatch):
    bad = [{"vehicle_id": "BUS-01", "observed_at": "2026-11-25T12:00:00+00:00", "lon": 1}]
    setup(monkeypatch, FakeDB(), rows=bad)
    response = client.post(URL, json=BODY)
    assert response.json()["errors"] == [{"row": 0, "path": "lat", "message": "обов'язкове поле відсутнє"}]


def test_unknown_dataset_is_403_without_request(client, monkeypatch):
    db = FakeDB()
    setup(monkeypatch, db)
    response = client.post(URL, json={"dataset_code": "missing"})
    assert response.status_code == 403
    assert response.json()["reason_code"] == "NO_ROLE_PERMISSION"
    assert response.json()["request_id"] is None
    assert db.requests() == []
    assert db.audits()[0].request_id is None


def test_unsupported_kind_is_501_without_request(client, monkeypatch):
    db = FakeDB()
    dataset = Dataset(id=3, code="sched", kind="schedule", schema_version="1.0", requires_consent=False)
    setup(monkeypatch, db, dataset=dataset)
    assert client.post(URL, json={"dataset_code": "sched"}).status_code == 501
    assert db.requests() == [] and db.commits == 0


def test_audit_event_holds_only_codes(client, monkeypatch):
    db = FakeDB()
    setup(monkeypatch, db)
    client.post(URL, json=BODY)
    audit = db.audits()[0]
    values = {k: v for k, v in vars(audit).items() if not k.startswith("_")}
    assert set(values) == {"request_id", "occurred_at", "outcome", "reason_code"}


# --- перегляд запитів ---

NOW = datetime(2026, 11, 25, 12, 0, tzinfo=timezone.utc)
VIEW = {
    "request_id": 7, "dataset_code": "gps-demo", "action": "read", "state": "denied",
    "reason_code": "NO_CONSENT", "created_at": NOW, "finished_at": NOW,
}


def setup_views(monkeypatch, found, roles=("consumer",), user_id=1):
    user = User(id=user_id, email="u@example.com", password_hash="h", is_active=True)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: FakeDB()
    monkeypatch.setattr(exchange_module, "load_request_view", lambda db, rid: found)
    monkeypatch.setattr(exchange_module, "get_user_roles", lambda u, d: list(roles))
    monkeypatch.setattr(exchange_module, "list_requests_of_user", lambda db, uid, limit: [VIEW])


def test_author_sees_own_request(client, monkeypatch):
    setup_views(monkeypatch, (1, VIEW))
    response = client.get("/exchange/requests/7")
    assert response.status_code == 200
    assert response.json()["reason_code"] == "NO_CONSENT"
    assert response.json()["state"] == "denied"


def test_other_user_gets_403(client, monkeypatch):
    setup_views(monkeypatch, (2, VIEW))
    response = client.get("/exchange/requests/7")
    assert response.status_code == 403
    assert response.json()["reason_code"] == "NO_ROLE_PERMISSION"


def test_admin_sees_foreign_request(client, monkeypatch):
    setup_views(monkeypatch, (2, VIEW), roles=("admin",))
    assert client.get("/exchange/requests/7").status_code == 200


def test_unknown_request_is_404(client, monkeypatch):
    setup_views(monkeypatch, None)
    assert client.get("/exchange/requests/999").status_code == 404


def test_list_mine(client, monkeypatch):
    setup_views(monkeypatch, None)
    response = client.get("/exchange/requests?mine=true")
    assert response.status_code == 200
    assert response.json()[0]["request_id"] == 7