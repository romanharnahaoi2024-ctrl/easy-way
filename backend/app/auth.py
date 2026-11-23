from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models import AuditEvent, Dataset, DatasetPermission, Role, User, UserRole

password_hash = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return password_hash.verify(password, hashed)


def create_access_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=settings.jwt_ttl_seconds)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token") from exc


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing token")
    payload = decode_access_token(credentials.credentials)
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="inactive or unknown user")
    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="account locked")
    return user


def get_user_roles(user: User, db: Session) -> list[str]:
    return [
        role_code
        for role_code, in db.query(Role.code)
        .join(UserRole, UserRole.role_id == Role.id)
        .filter(UserRole.user_id == user.id)
        .all()
    ]


def record_rbac_event(db: Session, outcome: str, reason_code: str) -> None:
    db.add(AuditEvent(
        request_id=None,
        occurred_at=datetime.now(timezone.utc),
        outcome=outcome,
        reason_code=reason_code,
    ))


def require_dataset_permission(
    user: User,
    dataset_code: str,
    action: str,
    db: Session,
) -> None:
    dataset = db.query(Dataset).filter(Dataset.code == dataset_code).first()
    if dataset is None:
        record_rbac_event(db, "denied", "NO_ROLE_PERMISSION")
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="permission denied",
        )

    allowed = (
        db.query(DatasetPermission.role_id)
        .join(UserRole, UserRole.role_id == DatasetPermission.role_id)
        .filter(
            UserRole.user_id == user.id,
            DatasetPermission.dataset_id == dataset.id,
            DatasetPermission.action == action,
        )
        .first()
    )

    if allowed is None:
        record_rbac_event(db, "denied", "NO_ROLE_PERMISSION")
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="permission denied",
        )

    record_rbac_event(db, "success", "OK")
    db.commit()
