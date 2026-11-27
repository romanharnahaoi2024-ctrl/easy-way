import os

os.environ.setdefault("DB_PASSWORD", "test-password")

from fastapi import HTTPException

from app.auth import has_dataset_permission, require_dataset_permission
from app.models import AuditEvent, Dataset, DatasetPermission, User


class FakeQuery:
    def __init__(self, entity, dataset=None, allowed=False):
        self.entity = entity
        self.dataset = dataset
        self.allowed = allowed

    def filter(self, *args, **kwargs):
        return self

    def join(self, *args, **kwargs):
        return self

    def first(self):
        if self.entity is Dataset:
            return self.dataset
        if self.entity is DatasetPermission.role_id:
            return (1,) if self.allowed else None
        return None


class FakeDB:
    def __init__(self, dataset=None, allowed=False):
        self.dataset = dataset
        self.allowed = allowed
        self.added = []
        self.commits = 0

    def query(self, entity):
        return FakeQuery(entity, self.dataset, self.allowed)

    def add(self, item):
        self.added.append(item)

    def commit(self):
        self.commits += 1


def make_dataset():
    return Dataset(id=1, code="gps-demo", kind="gps", schema_version="1.0", requires_consent=True)


def test_rbac_allows_matching_role_dataset_and_action():
    db = FakeDB(dataset=make_dataset(), allowed=True)
    user = User(id=1, email="consumer@example.com", password_hash="hash", is_active=True)

    require_dataset_permission(user, "gps-demo", "read", db)

    assert db.commits == 1
    assert isinstance(db.added[-1], AuditEvent)
    assert db.added[-1].reason_code == "OK"
    assert db.added[-1].outcome == "approved"


def test_rbac_denies_by_default_without_data():
    db = FakeDB(dataset=make_dataset(), allowed=False)
    user = User(id=2, email="denied@example.com", password_hash="hash", is_active=True)

    try:
        require_dataset_permission(user, "gps-demo", "read", db)
        assert False, "permission denial was expected"
    except HTTPException as exc:
        assert exc.status_code == 403
        assert exc.detail == "permission denied"

    assert db.commits == 1
    assert isinstance(db.added[-1], AuditEvent)
    assert db.added[-1].reason_code == "NO_ROLE_PERMISSION"
    assert db.added[-1].outcome == "denied"


def test_rbac_unknown_dataset_is_default_deny():
    db = FakeDB(dataset=None, allowed=False)
    user = User(id=3, email="unknown@example.com", password_hash="hash", is_active=True)

    try:
        require_dataset_permission(user, "missing", "read", db)
        assert False, "unknown dataset denial was expected"
    except HTTPException as exc:
        assert exc.status_code == 403

    assert db.added[-1].reason_code == "NO_ROLE_PERMISSION"


# --- has_dataset_permission: лише перевірка, без запису і commit (EZW-42) ---

def test_has_permission_true_writes_nothing():
    db = FakeDB(dataset=make_dataset(), allowed=True)
    user = User(id=1, email="c@example.com", password_hash="h", is_active=True)
    assert has_dataset_permission(user, make_dataset(), "read", db) is True
    assert db.added == [] and db.commits == 0


def test_has_permission_false_writes_nothing():
    db = FakeDB(dataset=make_dataset(), allowed=False)
    user = User(id=2, email="d@example.com", password_hash="h", is_active=True)
    assert has_dataset_permission(user, make_dataset(), "read", db) is False
    assert db.added == [] and db.commits == 0