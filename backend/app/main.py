"""Easy Way API."""
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from sqlalchemy import text

from app.auth import create_access_token, get_current_user, get_db, get_user_roles, verify_password
from app.config import settings
from app.db import engine
from app.models import AuditEvent, User

app = FastAPI(title="Easy Way API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginUser(BaseModel):
    id: int
    email: str
    roles: list[str]


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: LoginUser


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
    record_login_event(db, "success", "OK")
    db.commit()

    return LoginResponse(
        access_token=create_access_token(user),
        expires_in=settings.jwt_ttl_seconds,
        user=LoginUser(id=user.id, email=user.email, roles=roles),
    )


@app.get("/auth/me")
def auth_me(user: User = Depends(get_current_user), db=Depends(get_db)):
    return LoginUser(id=user.id, email=user.email, roles=get_user_roles(user, db)).model_dump()


@app.get("/health")
def health():
    """Перевіряє доступність API та підключення до PostgreSQL."""
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="db unavailable") from exc
    return {"status": "ok", "database": "ok"}
