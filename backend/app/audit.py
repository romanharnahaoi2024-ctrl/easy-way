from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_db, get_user_roles
from app.models import AuditEvent, Dataset, ExchangeRequest, User

# Причини з CLAUDE.md
OK = "OK"
UNAUTHENTICATED = "UNAUTHENTICATED"
NO_ROLE_PERMISSION = "NO_ROLE_PERMISSION"
NO_CONSENT = "NO_CONSENT"
CONSENT_REVOKED = "CONSENT_REVOKED"
VALIDATION_FAILED = "VALIDATION_FAILED"
REASON_CODES = frozenset({
    OK, UNAUTHENTICATED, NO_ROLE_PERMISSION,
    NO_CONSENT, CONSENT_REVOKED, VALIDATION_FAILED,
})

# ПРИПУЩЕННЯ: значення outcome не змінюю (success/denied, як у auth.py).
# Узгодження з П5 (success -> approved) буде зміною цих рядків.
OUTCOME_SUCCESS = "success"
OUTCOME_DENIED = "denied"
OUTCOME_INVALID = "invalid"

VIEW_ROLES = frozenset({"admin", "auditor"})  # UC-07

router = APIRouter()


def add_audit_event(
    db: Session,
    request_id: int | None,
    outcome: str,
    reason_code: str,
    now: datetime,
) -> AuditEvent:
    """Додає запис у сесію БЕЗ commit.

    Commit робить викликач, щоб стан запиту й аудит
    збереглися в одній транзакції (UC-06, крок 6).
    Сюди передаються лише коди, без паролів і сирих даних.
    """
    if reason_code not in REASON_CODES:
        raise ValueError(f"unknown reason_code: {reason_code}")
    event = AuditEvent(
        request_id=request_id,
        occurred_at=now,
        outcome=outcome,
        reason_code=reason_code,
    )
    db.add(event)
    return event


@router.get("/audit")
def list_audit(
    reason_code: str | None = None,
    outcome: str | None = None,
    request_id: int | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not VIEW_ROLES.intersection(get_user_roles(user, db)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="permission denied")

    # Користувача і набір беремо через запит; outerjoin, бо request_id може бути NULL
    query = (
        db.query(AuditEvent, ExchangeRequest.user_id, Dataset.code)
        .outerjoin(ExchangeRequest, AuditEvent.request_id == ExchangeRequest.id)
        .outerjoin(Dataset, ExchangeRequest.dataset_id == Dataset.id)
    )
    if reason_code is not None:
        query = query.filter(AuditEvent.reason_code == reason_code)
    if outcome is not None:
        query = query.filter(AuditEvent.outcome == outcome)
    if request_id is not None:
        query = query.filter(AuditEvent.request_id == request_id)

    rows = (
        query.order_by(AuditEvent.occurred_at.desc(), AuditEvent.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [
        {
            "id": event.id,
            "request_id": event.request_id,
            "occurred_at": event.occurred_at,
            "outcome": event.outcome,
            "reason_code": event.reason_code,
            "user_id": user_id,
            "dataset": dataset_code,
        }
        for event, user_id, dataset_code in rows
    ]