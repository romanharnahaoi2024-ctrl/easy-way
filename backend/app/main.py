"""Easy Way API."""
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from sqlalchemy import text

from app import audit
from app.auth import (
    create_access_token,
    get_current_user,
    get_db,
    get_user_roles,
    require_dataset_permission,
    verify_password,
)
from app.config import settings
from app.consent import router as consents_router
from app.db import engine
from app.errors import register_error_handlers
from app.exchange import router as exchange_router
from app.models import AuditEvent, User
from app.public_data import router as public_data_router

app = FastAPI(title="Easy Way API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
register_error_handlers(app)

app.include_router(consents_router)
app.include_router(audit.router)
app.include_router(exchange_router)
app.include_router(public_data_router)

# Головна роль для поля role (контракт з П5): за пріоритетом.
ROLE_PRIORITY = ("admin", "auditor", "carrier", "consumer")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginUser(BaseModel):
    id: int
    email: str
    # ПРИПУЩЕННЯ: у моделі User немає full_name і organization, тому віддаємо null.
    full_name: str | None = None
    role: str | None = None
    organization: str | None = None
    roles: list[str]


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: LoginUser


def primary_role(roles: list[str]) -> str | None:
    for code in ROLE_PRIORITY:
        if code in roles:
            return code
    return roles[0] if roles else None


def build_login_user(user: User, roles: list[str]) -> LoginUser:
    return LoginUser(id=user.id, email=user.email, role=primary_role(roles), roles=roles)


def record_login_event(db, outcome: str, reason_code: str) -> None:
    db.add(AuditEvent(
        request_id=None,
        occurred_at=datetime.now(timezone.utc),
        outcome=outcome,
        reason_code=reason_code,
    ))


@app.post("/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest, db=Depends(get_db)):
    user = db.query(User).filter(User.email == str(payload.email)).first()
    now = datetime.now(timezone.utc)

    if user is None:
        record_login_event(db, "denied", "UNAUTHENTICATED")
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials")

    if user.locked_until and user.locked_until > now:
        record_login_event(db, "denied", "UNAUTHENTICATED")
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="account locked")

    if not user.is_active or not verify_password(payload.password, user.password_hash):
        user.failed_login_count += 1
        if user.failed_login_count >= 5:
            user.locked_until = now + timedelta(minutes=15)
        record_login_event(db, "denied", "UNAUTHENTICATED")
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials")

    user.failed_login_count = 0
    user.locked_until = None
    roles = get_user_roles(user, db)
    record_login_event(db, "approved", "OK")
    db.commit()

    return LoginResponse(
        access_token=create_access_token(user),
        expires_in=settings.jwt_ttl_seconds,
        user=build_login_user(user, roles),
    )


@app.get("/auth/me", response_model=LoginUser)
def auth_me(user: User = Depends(get_current_user), db=Depends(get_db)):
    return build_login_user(user, get_user_roles(user, db))


@app.get("/health")
def health():
    """Перевіряє доступність API та підключення до PostgreSQL."""
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="db unavailable") from exc
    return {"status": "ok", "database": "ok"}


@app.get("/datasets/{dataset_code}")
def read_dataset(
    dataset_code: str,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    require_dataset_permission(user, dataset_code, "read", db)
    return {"dataset": dataset_code, "data": "authorized"}