import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from jsonschema import Draft202012Validator

SCHEMA_DIR = Path(__file__).parent / "schemas"
STALE_AFTER = timedelta(seconds=30)  # позиція старша за 30 с = stale (EZW-28)


class ValidationFailed(Exception):
    """Дані не пройшли перевірку. EZW-42 перетворить це на 422 VALIDATION_FAILED."""

    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


def _load_validator(name: str) -> Draft202012Validator:
    schema = json.loads((SCHEMA_DIR / name).read_text(encoding="utf-8-sig"))
    return Draft202012Validator(schema)


_gps_validator = _load_validator("gps.schema.json")
_schedule_validator = _load_validator("schedule.schema.json")


def _schema_errors(validator: Draft202012Validator, data) -> list[str]:
    errors = sorted(validator.iter_errors(data), key=lambda e: [str(p) for p in e.absolute_path])
    return [
        f"{'/'.join(str(p) for p in e.absolute_path) or '<root>'}: {e.message}"
        for e in errors
    ]


def _parse_aware(value: str) -> datetime:
    """Час обов'язково з часовим поясом, інакше помилка."""
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("немає часового поясу")
    return parsed


def validate_gps(record: dict, now: datetime | None = None) -> dict:
    errors = _schema_errors(_gps_validator, record)
    if errors:
        raise ValidationFailed(errors)
    try:
        observed_at = _parse_aware(record["observed_at"])
    except ValueError as exc:
        raise ValidationFailed([f"observed_at: {exc}"])
    now = now or datetime.now(timezone.utc)
    return {
        "vehicle_id": record["vehicle_id"],
        "observed_at": observed_at,
        "lat": record["lat"],
        "lon": record["lon"],
        "stale": now - observed_at > STALE_AFTER,
    }


def classify_gps_batch(records: list[dict], now: datetime | None = None) -> list[str]:
    """Статус кожного запису. Дублем вважається друга поява (vehicle_id, observed_at)."""
    seen = set()
    statuses = []
    for record in records:
        try:
            result = validate_gps(record, now)
        except ValidationFailed:
            statuses.append("422_VALIDATION_FAILED")
            continue
        key = (result["vehicle_id"], result["observed_at"])
        if key in seen:
            statuses.append("duplicate_rejected")
            continue
        seen.add(key)
        statuses.append("accepted_stale" if result["stale"] else "accepted")
    return statuses


def validate_schedule(doc: dict) -> None:
    errors = _schema_errors(_schedule_validator, doc)
    if errors:
        raise ValidationFailed(errors)

    orders = [stop["stop_order"] for stop in doc["stops"]]
    duplicates = sorted({order for order in orders if orders.count(order) > 1})
    if duplicates:
        errors.append(f"stop_order повторюється: {duplicates}")

    for stop in doc["stops"]:
        try:
            arrival = _parse_aware(stop["arrival_at"])
            departure = _parse_aware(stop["departure_at"])
        except ValueError as exc:
            errors.append(f"{stop['name']}: {exc}")
            continue
        if departure < arrival:
            errors.append(f"{stop['name']}: відправлення раніше за прибуття")

    if errors:
        raise ValidationFailed(errors)