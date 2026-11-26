import os

os.environ.setdefault("DB_PASSWORD", "test-password")

import pytest

from app.validation import ValidationFailed, validate_gps, validate_schedule

GOOD = {"vehicle_id": "BUS-01", "observed_at": "2026-11-25T12:00:00+02:00", "lat": 49.84, "lon": 24.0}


def fail(record):
    with pytest.raises(ValidationFailed) as info:
        validate_gps(record)
    return info.value


def test_out_of_range_has_safe_detail_without_value():
    exc = fail({**GOOD, "lat": 95})
    assert exc.details == [{"path": "lat", "message": "значення більше допустимого"}]
    assert "95" in exc.errors[0]  # докладний рядок сире значення містить, у API він не йде
    assert "95" not in str(exc.details)


def test_missing_field_points_to_field():
    record = {k: v for k, v in GOOD.items() if k != "lon"}
    assert fail(record).details == [{"path": "lon", "message": "обов'язкове поле відсутнє"}]


def test_wrong_type_detail():
    assert fail({**GOOD, "lat": "north"}).details == [{"path": "lat", "message": "неправильний тип значення"}]


def test_time_without_timezone_detail():
    exc = fail({**GOOD, "observed_at": "2026-11-25T12:00:00"})
    assert exc.details == [{"path": "observed_at", "message": "неправильний формат часу або немає часового поясу"}]


def test_schedule_details_for_order_and_time(monkeypatch):
    import app.validation as validation

    monkeypatch.setattr(validation, "_schema_issues", lambda validator, data: ([], []))
    doc = {"stops": [
        {"name": "A", "stop_order": 1, "arrival_at": "2026-11-25T09:00:00+02:00", "departure_at": "2026-11-25T09:01:00+02:00"},
        {"name": "B", "stop_order": 1, "arrival_at": "2026-11-25T09:10:00+02:00", "departure_at": "2026-11-25T09:05:00+02:00"},
    ]}
    with pytest.raises(ValidationFailed) as info:
        validate_schedule(doc)
    paths = [d["path"] for d in info.value.details]
    assert paths == ["stops/stop_order", "stops/1/departure_at"]