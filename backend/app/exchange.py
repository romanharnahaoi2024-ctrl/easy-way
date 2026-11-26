"""Ендпоінти обміну (EZW-42): POST/GET /exchange/requests."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_db, get_user_roles
from app.errors import ApiError
from app.exchange_service import (
    list_requests_of_user, load_request_view, run_exchange,
)
from app.models import User

router = APIRouter(prefix="/exchange", tags=["exchange"])


class ExchangeRequestIn(BaseModel):
    dataset_code: str
    action: str = Field("read", max_length=32)
    # Поля нижче приймаються, але в UC-06 поки не використовуються.
    purpose: str | None = None
    period_from: str | None = None
    period_to: str | None = None


class ExchangeResponse(BaseModel):
    request_id: int
    state: str
    dataset_code: str
    records: list[dict]
    total: int
    masked_fields: list[str] = []


@router.post("/requests", response_model=ExchangeResponse)
def create_request(
    payload: ExchangeRequestIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    req, records = run_exchange(
        db, user, payload.dataset_code, payload.action, datetime.now(timezone.utc)
    )
    return ExchangeResponse(
        request_id=req.id,
        state=req.state,
        dataset_code=payload.dataset_code,
        records=records,
        total=len(records),
        masked_fields=[],
    )


@router.get("/requests")
def list_my_requests(
    mine: bool = True,  # приймається для контракту; повертаються лише власні запити
    limit: int = Query(100, ge=1, le=500),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list_requests_of_user(db, user.id, limit)


@router.get("/requests/{request_id}")
def get_request(
    request_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    found = load_request_view(db, request_id)
    if found is None:
        raise ApiError(404, "request not found")
    owner_id, view = found
    if owner_id != user.id and "admin" not in get_user_roles(user, db):
        raise ApiError(403, "permission denied")
    return view