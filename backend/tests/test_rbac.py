import os

os.environ.setdefault("DB_PASSWORD", "test-password")

from fastapi import HTTPException

from app.auth import require_dataset_permission
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


def test_rbac_allows_matching_role_dataset_and_action():
    dataset = Dataset(id=1, code="gps-demo", kind="gps", schema_version="1.0", requires_consent=True)
    db = FakeDB(dataset=dataset, allowed=True)
    user = User(id=1, email="consumer@example.com", password_hash="hash", is_active=True)

    require_dataset_permission(user, "gps-demo", "read", db)

    assert db.commits == 1
    assert isinstance(db.added[-1], AuditEvent)
    assert db.added[-1].reason_code == "OK"


def test_rbac_denies_by_default_without_data():
    dataset = Dataset(id=1, code="gps-demo", kind="gps", schema_version="1.0", requires_consent=True)
    db = FakeDB(dataset=dataset, allowed=False)
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


def test_rbac_unknown_dataset_is_default_deny():
    db = FakeDB(dataset=None, allowed=False)
    user = User(id=3, email="unknown@example.com", password_hash="hash", is_active=True)

    try:
        require_dataset_permission(user, "missing", "read", db)
        assert False, "unknown dataset denial was expected"
    except HTTPException as exc:
        assert exc.status_code == 403

    assert db.added[-1].reason_code == "NO_ROLE_PERMISSION"
