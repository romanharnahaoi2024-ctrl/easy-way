from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.seed import build_gps_positions, DEMO_DATA


def test_demo_gps_positions_are_relative_to_now():
    now = datetime(2026, 11, 23, 9, 30, tzinfo=timezone.utc)
    positions = build_gps_positions(now, vehicle_id=1, trip_id=1)

    assert len(positions) == 2
    assert positions[0].observed_at == now - timedelta(seconds=20)
    assert positions[1].observed_at == now - timedelta(seconds=5)
    assert positions[0].lat == Decimal("49.8408")
    assert positions[1].lat == Decimal("49.8417")


def test_lat_override_supports_negative_validation_case():
    now = datetime(2026, 11, 23, 9, 30, tzinfo=timezone.utc)
    positions = build_gps_positions(now, vehicle_id=1, trip_id=1, lat_override=95)

    assert all(position.lat == Decimal("95") for position in positions)


def test_demo_route_data_matches_specification():
    assert DEMO_DATA["route"]["code"] == "M1"
    assert [(stop["name"], stop["order"]) for stop in DEMO_DATA["stops"]] == [
        ("Вокзал", 1),
        ("Площа", 2),
        ("Парк", 3),
    ]
    assert DEMO_DATA["vehicle"]["fleet_code"] == "BUS-01"
