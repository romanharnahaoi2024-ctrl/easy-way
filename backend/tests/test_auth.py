import os

os.environ.setdefault("DB_PASSWORD", "test-password")

import jwt

from fastapi.testclient import TestClient

from app.auth import create_access_token, hash_password, verify_password
from app.config import settings
from app.main import app
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
