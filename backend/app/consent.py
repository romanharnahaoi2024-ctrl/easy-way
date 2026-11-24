"""Модуль згоди (EZW-43)."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_db, get_user_roles
from app.models import Consent, Dataset, User

OK = "OK"
NO_CONSENT = "NO_CONSENT"
CONSENT_REVOKED = "CONSENT_REVOKED"

# ПРИПУЩЕННЯ (відкрите питання 4): пасажир керує власною згодою
CONSENT_ROLES = {"consumer", "carrier", "admin"}


def is_active(consent: Consent, now: datetime) -> bool:
    """Чинна: не відкликана і granted_at <= now < valid_until."""
    return consent.revoked_at is None and consent.granted_at <= now < consent.valid_until


def evaluate_consent(consents: list[Consent], now: datetime) -> str:
    """Повертає OK, NO_CONSENT або CONSENT_REVOKED. now завжди параметром."""
    if any(is_active(c, now) for c in consents):
        return OK
    started = [c for c in consents if c.granted_at <= now]
    if started:
        latest = max(started, key=lambda c: c.granted_at)
        if latest.revoked_at is not None:
            return CONSENT_REVOKED
    return NO_CONSENT


def check_consent(db: Session, user_id: int, dataset_id: int, now: datetime) -> str:
    """Для EZW-42: перевірка згоди користувача на набір."""
    rows = (
        db.query(Consent)
        .filter(Consent.user_id == user_id, Consent.dataset_id == dataset_id)
        .all()
    )
    return evaluate_consent(rows, now)


router = APIRouter(prefix="/consents", tags=["consents"])


class ConsentCreate(BaseModel):
    dataset_code: str
    valid_until: datetime
    user_id: int | None = None  # лише для admin


class ConsentOut(BaseModel):
    id: int
    user_id: int
    dataset_code: str
    granted_at: datetime
    valid_until: datetime
    revoked_at: datetime | None


def _to_out(consent: Consent, dataset_code: str) -> ConsentOut:
    return ConsentOut(
        id=consent.id,
        user_id=consent.user_id,
        dataset_code=dataset_code,
        granted_at=consent.granted_at,
        valid_until=consent.valid_until,
        revoked_at=consent.revoked_at,
    )


def _require_consent_role(roles: list[str]) -> None:
    if not CONSENT_ROLES.intersection(roles):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="permission denied")


@router.post("", response_model=ConsentOut, status_code=status.HTTP_201_CREATED)
def grant_consent(
    payload: ConsentCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    roles = get_user_roles(user, db)
    _require_consent_role(roles)

    target_id = payload.user_id if payload.user_id is not None else user.id
    if target_id != user.id and "admin" not in roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="permission denied")

    now = datetime.now(timezone.utc)
    if payload.valid_until.tzinfo is None or payload.valid_until <= now:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="valid_until must be a future datetime with timezone",
        )

    dataset = db.query(Dataset).filter(Dataset.code == payload.dataset_code).first()
    if dataset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="dataset not found")
    if target_id != user.id and db.get(User, target_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")

    consent = Consent(
        user_id=target_id,
        dataset_id=dataset.id,
        granted_at=now,
        valid_until=payload.valid_until,
        revoked_at=None,
    )
    db.add(consent)
    db.commit()
    db.refresh(consent)
    return _to_out(consent, dataset.code)


@router.delete("/{consent_id}", response_model=ConsentOut)
def revoke_consent(
    consent_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    roles = get_user_roles(user, db)
    _require_consent_role(roles)

    consent = db.get(Consent, consent_id)
    if consent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="consent not found")
    if consent.user_id != user.id and "admin" not in roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="permission denied")

    # Запис не видаляється: історія лише додається. Повторне відкликання нічого не змінює.
    if consent.revoked_at is None:
        consent.revoked_at = datetime.now(timezone.utc)
        db.commit()

    dataset = db.get(Dataset, consent.dataset_id)
    return _to_out(consent, dataset.code if dataset else "")