"""Сервіс обміну (UC-06, EZW-42): запит, права, згода, читання, валідація, аудит.

Усе, що змінює БД, збирається в одну транзакцію: один commit у кінці.
Відповідь із даними віддається лише після успішного commit.
"""
from datetime import datetime

from sqlalchemy.orm import Session

from app.audit import (
    NO_ROLE_PERMISSION, OK, OUTCOME_APPROVED, OUTCOME_DENIED, OUTCOME_INVALID,
    VALIDATION_FAILED, add_audit_event,
)
from app.auth import has_dataset_permission
from app.consent import check_consent
from app.errors import ApiError
from app.models import (
    AuditEvent, Dataset, ExchangeRequest, GpsPosition, User, Vehicle,
)
from app.validation import ValidationFailed, validate_gps

STATE_PENDING = "pending"
STATE_APPROVED = "approved"
STATE_DENIED = "denied"
STATE_INVALID = "invalid"

SUPPORTED_KINDS = frozenset({"gps"})
SOURCE_LIMIT = 1000


# --- доступ до БД винесений у малі функції, тести підміняють їх ---

def find_dataset(db: Session, code: str) -> Dataset | None:
    return db.query(Dataset).filter(Dataset.code == code).first()


def read_source(db: Session, dataset: Dataset) -> list[dict]:
    """Крок 5: читання даних набору з джерела (для gps це gps_positions у БД).

    vehicle_id у відповіді дорівнює fleet_code. Тест підміняє цю функцію,
    щоб подати «зіпсовані» дані (у БД lat=95 неможлива через CHECK).
    """
    rows = (
        db.query(GpsPosition.observed_at, GpsPosition.lat, GpsPosition.lon, Vehicle.fleet_code)
        .select_from(GpsPosition)
        .join(Vehicle, Vehicle.id == GpsPosition.vehicle_id)
        .order_by(GpsPosition.observed_at.desc())
        .limit(SOURCE_LIMIT)
        .all()
    )
    return [
        {
            "vehicle_id": fleet_code,
            "observed_at": observed_at.isoformat(),
            "lat": float(lat),
            "lon": float(lon),
        }
        for observed_at, lat, lon, fleet_code in rows
    ]


def load_request_view(db: Session, request_id: int) -> tuple[int, dict] | None:
    """(id власника, відповідь) або None."""
    row = (
        db.query(ExchangeRequest, Dataset.code)
        .select_from(ExchangeRequest)
        .join(Dataset, Dataset.id == ExchangeRequest.dataset_id)
        .filter(ExchangeRequest.id == request_id)
        .first()
    )
    if row is None:
        return None
    req, dataset_code = row
    reason = (
        db.query(AuditEvent.reason_code)
        .filter(AuditEvent.request_id == request_id)
        .order_by(AuditEvent.id.desc())
        .first()
    )
    return req.user_id, _view(req, dataset_code, reason[0] if reason else None)


def list_requests_of_user(db: Session, user_id: int, limit: int) -> list[dict]:
    rows = (
        db.query(ExchangeRequest, Dataset.code, AuditEvent.reason_code)
        .select_from(ExchangeRequest)
        .join(Dataset, Dataset.id == ExchangeRequest.dataset_id)
        .outerjoin(AuditEvent, AuditEvent.request_id == ExchangeRequest.id)
        .filter(ExchangeRequest.user_id == user_id)
        .order_by(ExchangeRequest.created_at.desc(), ExchangeRequest.id.desc())
        .limit(limit)
        .all()
    )
    return [_view(req, code, reason) for req, code, reason in rows]


def _view(req: ExchangeRequest, dataset_code: str, reason_code: str | None) -> dict:
    return {
        "request_id": req.id,
        "dataset_code": dataset_code,
        "action": req.action,
        "state": req.state,
        "reason_code": reason_code,
        "created_at": req.created_at,
        "finished_at": req.finished_at,
    }


# --- UC-06 ---

def _finish(db: Session, req: ExchangeRequest, state: str, outcome: str, reason: str, now: datetime) -> None:
    req.state = state
    req.finished_at = now
    add_audit_event(db, req.id, outcome, reason, now)
    db.commit()


def _deny(db: Session, req: ExchangeRequest, reason: str, detail: str, now: datetime):
    _finish(db, req, STATE_DENIED, OUTCOME_DENIED, reason, now)
    raise ApiError(403, detail, reason, req.id)


def run_exchange(
    db: Session, user: User, dataset_code: str, action: str, now: datetime
) -> tuple[ExchangeRequest, list[dict]]:
    dataset = find_dataset(db, dataset_code)
    if dataset is None:
        # Запит створити не можна (dataset_id обов'язковий), аудит без request_id.
        add_audit_event(db, None, OUTCOME_DENIED, NO_ROLE_PERMISSION, now)
        db.commit()
        raise ApiError(403, "permission denied", NO_ROLE_PERMISSION, None)

    if dataset.kind not in SUPPORTED_KINDS:
        raise ApiError(501, "dataset kind is not supported yet")

    req = ExchangeRequest(
        user_id=user.id, dataset_id=dataset.id, action=action,
        state=STATE_PENDING, created_at=now,
    )
    db.add(req)
    db.flush()  # потрібен request_id; commit буде один, у кінці

    if not has_dataset_permission(user, dataset, action, db):
        _deny(db, req, NO_ROLE_PERMISSION, "permission denied", now)

    if dataset.requires_consent:
        verdict = check_consent(db, user.id, dataset.id, now)
        if verdict != OK:
            _deny(db, req, verdict, "no valid consent", now)

    rows = read_source(db, dataset)
    records: list[dict] = []
    issues: list[dict] = []
    failed = False
    for index, row in enumerate(rows):
        try:
            item = validate_gps(row, now)
        except ValidationFailed as exc:
            failed = True
            issues.extend({"row": index, **detail} for detail in exc.details)
            continue
        records.append({
            "vehicle_id": item["vehicle_id"],
            "observed_at": item["observed_at"].isoformat(),
            "lat": item["lat"],
            "lon": item["lon"],
            "stale": item["stale"],
        })

    if failed:
        _finish(db, req, STATE_INVALID, OUTCOME_INVALID, VALIDATION_FAILED, now)
        raise ApiError(422, "validation failed", VALIDATION_FAILED, req.id, errors=issues)

    _finish(db, req, STATE_APPROVED, OUTCOME_APPROVED, OK, now)
    return req, records