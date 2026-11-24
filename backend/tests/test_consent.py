from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import app.consent as consent_module
from app.auth import get_current_user, get_db
from app.consent import CONSENT_REVOKED, NO_CONSENT, OK, evaluate_consent
from app.main import app
from app.models import Consent, Dataset, User

NOW = datetime(2026, 11, 25, 12, 0, tzinfo=timezone.utc)
HOUR = timedelta(hours=1)


def make_consent(**kw):
    data = dict(
        id=1, user_id=1, dataset_id=1,
        granted_at=NOW - HOUR, valid_until=NOW + HOUR, revoked_at=None,
    )
    data.update(kw)
    return Consent(**data)


# --- чиста логіка чинності, без БД ---

def test_active_consent_is_ok():
    assert evaluate_consent([make_consent()], NOW) == OK


def test_no_consents_is_no_consent():
    assert evaluate_consent([], NOW) == NO_CONSENT


def test_expired_consent_is_no_consent():
    c = make_consent(valid_until=NOW - timedelta(minutes=1))
    assert evaluate_consent([c], NOW) == NO_CONSENT


def test_valid_until_boundary_is_exclusive():
    assert evaluate_consent([make_consent(valid_until=NOW)], NOW) == NO_CONSENT


def test_not_yet_granted_is_no_consent():
    c = make_consent(granted_at=NOW + HOUR, valid_until=NOW + 2 * HOUR)
    assert evaluate_consent([c], NOW) == NO_CONSENT


def test_revoked_consent_is_consent_revoked():
    c = make_consent(revoked_at=NOW - timedelta(minutes=5))
    assert evaluate_consent([c], NOW) == CONSENT_REVOKED


def test_new_grant_after_revoke_is_ok():
    old = make_consent(id=1, revoked_at=NOW - timedelta(minutes=5))
    new = make_consent(id=2, granted_at=NOW - timedelta(minutes=1))
    assert evaluate_consent([old, new], NOW) == OK


# --- ендпоінти на фейковій БД ---

class FakeQuery:
    def __init__(self, dataset):
        self.dataset = dataset

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self.dataset


class FakeDB:
    def __init__(self, dataset=None, consents=(), users=()):
        self.dataset = dataset
        self.consents = {c.id: c for c in consents}
        self.users = {u.id: u for u in users}
        self.added = []
        self.commits = 0

    def query(self, entity):
        return FakeQuery(self.dataset)

    def get(self, model, pk):
        if model is Consent:
            return self.consents.get(pk)
        if model is Dataset:
            return self.dataset
        if model is User:
            return self.users.get(pk)
        return None

    def add(self, item):
        self.added.append(item)

    def commit(self):
        self.commits += 1

    def refresh(self, item):
        if item.id is None:
            item.id = 100


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def setup(monkeypatch, db, user_id=1, roles=("consumer",)):
    user = User(id=user_id, email="u@example.com", password_hash="h", is_active=True)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db
    monkeypatch.setattr(consent_module, "get_user_roles", lambda u, d: list(roles))


def dataset():
    return Dataset(id=1, code="gps-demo", kind="gps", schema_version="1.0", requires_consent=True)


def future_iso():
    return (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()


def test_grant_requires_token(client):
    response = client.post("/consents", json={"dataset_code": "gps-demo", "valid_until": future_iso()})
    assert response.status_code == 401


def test_consumer_grants_own_consent(client, monkeypatch):
    db = FakeDB(dataset=dataset())
    setup(monkeypatch, db)
    response = client.post("/consents", json={"dataset_code": "gps-demo", "valid_until": future_iso()})
    assert response.status_code == 201
    assert response.json()["user_id"] == 1
    assert response.json()["revoked_at"] is None
    assert db.commits == 1


def test_auditor_cannot_grant(client, monkeypatch):
    setup(monkeypatch, FakeDB(dataset=dataset()), roles=("auditor",))
    response = client.post("/consents", json={"dataset_code": "gps-demo", "valid_until": future_iso()})
    assert response.status_code == 403


def test_consumer_cannot_grant_for_other_user(client, monkeypatch):
    setup(monkeypatch, FakeDB(dataset=dataset()))
    response = client.post(
        "/consents",
        json={"dataset_code": "gps-demo", "valid_until": future_iso(), "user_id": 2},
    )
    assert response.status_code == 403


def test_grant_with_past_valid_until_is_422(client, monkeypatch):
    setup(monkeypatch, FakeDB(dataset=dataset()))
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    response = client.post("/consents", json={"dataset_code": "gps-demo", "valid_until": past})
    assert response.status_code == 422


def test_grant_unknown_dataset_is_404(client, monkeypatch):
    setup(monkeypatch, FakeDB(dataset=None))
    response = client.post("/consents", json={"dataset_code": "missing", "valid_until": future_iso()})
    assert response.status_code == 404


def test_revoke_sets_revoked_at_and_keeps_record(client, monkeypatch):
    consent = make_consent(
        granted_at=datetime.now(timezone.utc) - HOUR,
        valid_until=datetime.now(timezone.utc) + HOUR,
    )
    db = FakeDB(dataset=dataset(), consents=[consent])
    setup(monkeypatch, db)
    response = client.delete("/consents/1")
    assert response.status_code == 200
    assert consent.revoked_at is not None
    assert 1 in db.consents  # запис не видалено
    assert evaluate_consent([consent], datetime.now(timezone.utc)) == CONSENT_REVOKED


def test_revoke_twice_keeps_first_revoked_at(client, monkeypatch):
    first = NOW - timedelta(minutes=5)
    consent = make_consent(revoked_at=first)
    db = FakeDB(dataset=dataset(), consents=[consent])
    setup(monkeypatch, db)
    response = client.delete("/consents/1")
    assert response.status_code == 200
    assert consent.revoked_at == first
    assert db.commits == 0


def test_cannot_revoke_foreign_consent(client, monkeypatch):
    consent = make_consent(user_id=2)
    setup(monkeypatch, FakeDB(dataset=dataset(), consents=[consent]), user_id=1)
    response = client.delete("/consents/1")
    assert response.status_code == 403
    assert consent.revoked_at is None


def test_admin_can_revoke_foreign_consent(client, monkeypatch):
    consent = make_consent(user_id=2)
    setup(monkeypatch, FakeDB(dataset=dataset(), consents=[consent]), user_id=1, roles=("admin",))
    response = client.delete("/consents/1")
    assert response.status_code == 200
    assert consent.revoked_at is not None


def test_revoke_unknown_consent_is_404(client, monkeypatch):
    setup(monkeypatch, FakeDB(dataset=dataset()))
    assert client.delete("/consents/999").status_code == 404