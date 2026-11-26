import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from jsonschema import Draft202012Validator

SCHEMA_DIR = Path(__file__).parent / "schemas"
STALE_AFTER = timedelta(seconds=30)  # позиція старша за 30 с = stale (EZW-28)

# Безпечні тексти для відповіді 422: без сирих значень із даних (контракт з П5).
# Повідомлення jsonschema (e.message) містять сире значення, тому в API вони не йдуть.
SAFE_MESSAGES = {
    "required": "обов'язкове поле відсутнє",
    "type": "неправильний тип значення",
    "minimum": "значення менше допустимого",
    "maximum": "значення більше допустимого",
    "exclusiveMinimum": "значення менше допустимого",
    "exclusiveMaximum": "значення більше допустимого",
    "minLength": "значення занадто коротке",
    "maxLength": "значення занадто довге",
    "minItems": "замало елементів",
    "maxItems": "забагато елементів",
    "pattern": "неправильний формат значення",
    "format": "неправильний формат значення",
    "enum": "значення не з дозволеного переліку",
    "additionalProperties": "зайве поле",
}
DEFAULT_SAFE_MESSAGE = "значення не відповідає схемі"
BAD_TIME_MESSAGE = "неправильний формат часу або немає часового поясу"


class ValidationFailed(Exception):
    """Дані не пройшли перевірку. EZW-42 перетворює це на 422 VALIDATION_FAILED.

    errors: докладні рядки (можуть містити сирі значення, лише для логів і тестів).
    details: безпечні помилки [{"path", "message"}], саме їх можна віддавати клієнту.
    """

    def __init__(self, errors: list[str], details: list[dict] | None = None):
        super().__init__("; ".join(errors))
        self.errors = errors
        self.details = details or []


def _load_validator(name: str) -> Draft202012Validator:
    schema = json.loads((SCHEMA_DIR / name).read_text(encoding="utf-8-sig"))
    return Draft202012Validator(schema)


_gps_validator = _load_validator("gps.schema.json")
_schedule_validator = _load_validator("schedule.schema.json")


def _path(error) -> str:
    return "/".join(str(p) for p in error.absolute_path)


def _safe_details(error) -> list[dict]:
    base = _path(error)
    if error.validator == "required" and isinstance(error.instance, dict):
        missing = [name for name in error.validator_value if name not in error.instance]
        return [
            {"path": "/".join(p for p in (base, name) if p), "message": SAFE_MESSAGES["required"]}
            for name in missing
        ]
    return [{"path": base, "message": SAFE_MESSAGES.get(error.validator, DEFAULT_SAFE_MESSAGE)}]


def _schema_issues(validator: Draft202012Validator, data) -> tuple[list[str], list[dict]]:
    errors = sorted(validator.iter_errors(data), key=lambda e: [str(p) for p in e.absolute_path])
    messages = [f"{_path(e) or '<root>'}: {e.message}" for e in errors]
    details: list[dict] = []
    for e in errors:
        details.extend(_safe_details(e))
    return messages, details


def _schema_errors(validator: Draft202012Validator, data) -> list[str]:
    return _schema_issues(validator, data)[0]


def _parse_aware(value: str) -> datetime:
    """Час обов'язково з часовим поясом, інакше помилка."""
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("немає часового поясу")
    return parsed


def validate_gps(record: dict, now: datetime | None = None) -> dict:
    errors, details = _schema_issues(_gps_validator, record)
    if errors:
        raise ValidationFailed(errors, details)
    try:
        observed_at = _parse_aware(record["observed_at"])
    except ValueError as exc:
        raise ValidationFailed(
            [f"observed_at: {exc}"],
            [{"path": "observed_at", "message": BAD_TIME_MESSAGE}],
        )
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
    errors, details = _schema_issues(_schedule_validator, doc)
    if errors:
        raise ValidationFailed(errors, details)

    orders = [stop["stop_order"] for stop in doc["stops"]]
    duplicates = sorted({order for order in orders if orders.count(order) > 1})
    if duplicates:
        errors.append(f"stop_order повторюється: {duplicates}")
        details.append({"path": "stops/stop_order", "message": "stop_order повторюється"})

    for index, stop in enumerate(doc["stops"]):
        try:
            arrival = _parse_aware(stop["arrival_at"])
            departure = _parse_aware(stop["departure_at"])
        except ValueError as exc:
            errors.append(f"{stop['name']}: {exc}")
            details.append({"path": f"stops/{index}", "message": BAD_TIME_MESSAGE})
            continue
        if departure < arrival:
            errors.append(f"{stop['name']}: відправлення раніше за прибуття")
            details.append({"path": f"stops/{index}/departure_at", "message": "відправлення раніше за прибуття"})

    if errors:
        raise ValidationFailed(errors, details)