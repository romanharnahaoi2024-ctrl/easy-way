import os

os.environ.setdefault("DB_PASSWORD", "test-password")

import jwt
import pytest

from fastapi.testclient import TestClient

import app.main as main_module
from app.auth import create_access_token, get_current_user, get_db, hash_password, verify_password
from app.config import settings
from app.main import app, primary_role
from app.models import User

client = TestClient(app)


def test_password_hash_is_argon2_and_verifies():
    hashed = hash_password("easyway2026")
    assert hashed != "easyway2026"
    assert verify_password("easyway2026", hashed)
    assert not verify_password("wrong-password", hashed)


def test_access_token_contains_user_and_expiration():
    user = User(id=42, email="demo-allowed", password_hash="hash", is_active=True)
    token = create_access_token(user)
    payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    assert payload["sub"] == "42"
    assert payload["email"] == "demo-allowed"
    assert payload["exp"] > payload["iat"]


def test_missing_token_returns_401():
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_invalid_token_returns_401():
    response = client.get("/auth/me", headers={"Authorization": "Bearer invalid-token"})
    assert response.status_code == 401


def test_401_body_has_reason_code_and_null_request_id():
    body = client.get("/auth/me").json()
    assert body["detail"] == "missing token"
    assert body["reason_code"] == "UNAUTHENTICATED"
    assert body["request_id"] is None


@pytest.mark.parametrize(
    "roles, expected",
    [
        (["consumer"], "consumer"),
        (["consumer", "admin"], "admin"),
        (["carrier", "auditor"], "auditor"),
        ([], None),
    ],
)
def test_primary_role_priority(roles, expected):
    assert primary_role(roles) == expected


def test_auth_me_matches_contract_shape(monkeypatch):
    user = User(id=5, email="demo.admin@easyway.lviv.ua", password_hash="h", is_active=True)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(main_module, "get_user_roles", lambda u, d: ["consumer", "admin"])
    try:
        body = client.get("/auth/me").json()
    finally:
        app.dependency_overrides.clear()
    assert body == {
        "id": 5, "email": "demo.admin@easyway.lviv.ua", "full_name": None,
        "role": "admin", "organization": None, "roles": ["consumer", "admin"],
    }
    assert "password" not in str(body).lower()