import json
from datetime import datetime
from pathlib import Path

import pytest

from app.validation import (
    ValidationFailed,
    classify_gps_batch,
    validate_gps,
    validate_schedule,
)

TEST_DATA = Path(__file__).resolve().parents[2] / "test-data"
# Фіксований "зараз": D-01 старший на 20 с, D-02 на 5 с, D-07 на 100 с
NOW = datetime.fromisoformat("2026-11-23T09:00:40+02:00")


def load(name: str):
    return json.loads((TEST_DATA / name).read_text(encoding="utf-8-sig"))


def test_gps_cases_d01_d07():
    cases = load("gps_cases.json")
    statuses = classify_gps_batch(cases, NOW)
    for case, status in zip(cases, statuses):
        assert status == case["expected"], case["id"]


def test_gps_lat_95_fails():
    record = {"vehicle_id": "BUS-01", "observed_at": "2026-11-23T09:00:40+02:00", "lat": 95, "lon": 23.9931}
    with pytest.raises(ValidationFailed):
        validate_gps(record, NOW)


def test_gps_without_timezone_fails():
    record = {"vehicle_id": "BUS-01", "observed_at": "2026-11-23T09:00:40", "lat": 49.8, "lon": 23.9}
    with pytest.raises(ValidationFailed):
        validate_gps(record, NOW)


def test_gps_stale_flag():
    old = {"vehicle_id": "BUS-01", "observed_at": "2026-11-23T08:59:00+02:00", "lat": 49.8, "lon": 23.9}
    fresh = {"vehicle_id": "BUS-01", "observed_at": "2026-11-23T09:00:20+02:00", "lat": 49.8, "lon": 23.9}
    assert validate_gps(old, NOW)["stale"] is True
    assert validate_gps(fresh, NOW)["stale"] is False


def test_schedule_valid_passes():
    validate_schedule(load("schedule_valid.json"))


def test_schedule_d08_duplicate_stop_order_fails():
    with pytest.raises(ValidationFailed) as exc:
        validate_schedule(load("schedule_invalid_stop_order.json"))
    assert "stop_order" in str(exc.value)


def test_schedule_departure_before_arrival_fails():
    doc = load("schedule_valid.json")
    doc["stops"][0]["departure_at"] = "2026-11-23T08:59:00+02:00"
    with pytest.raises(ValidationFailed):
        validate_schedule(doc)