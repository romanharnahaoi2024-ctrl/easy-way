"""Ідемпотентне наповнення демонстраційними даними Easy Way (EZW-39)."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import json

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import (
    Consent, Dataset, DatasetPermission, GpsPosition, Role, Route, RouteStop,
    Stop, StopTime, Trip, User, UserRole, Vehicle,
)

DEMO_DATA = {
    "route": {"code": "M1", "direction": "Вокзал → Парк", "name": "Маршрут M1"},
    "stops": [
        {"name": "Вокзал", "lat": 49.8408, "lon": 23.9931, "order": 1},
        {"name": "Площа", "lat": 49.8417, "lon": 24.0220, "order": 2},
        {"name": "Парк", "lat": 49.8309, "lon": 24.0269, "order": 3},
    ],
    "trip": {"starts_at_local": "09:00", "stop_times": {"Вокзал": "09:00", "Площа": "09:07", "Парк": "09:15"}},
    "vehicle": {"fleet_code": "BUS-01"},
    "gps_positions": [
        {"near": "Вокзал", "lat": 49.8408, "lon": 23.9931, "age_seconds": 20},
        {"near": "Площа", "lat": 49.8417, "lon": 24.0220, "age_seconds": 5},
    ],
}


def get_or_create(session: Session, model, **values):
    instance = session.query(model).filter_by(**values).first()
    if instance is None:
        instance = model(**values)
        session.add(instance)
        session.flush()
    return instance


def build_gps_positions(now: datetime, vehicle_id: int, trip_id: int, lat_override: float | None = None):
    """Створює два GPS-записи. lat_override призначений для негативного тесту."""
    return [
        GpsPosition(
            vehicle_id=vehicle_id,
            trip_id=trip_id,
            observed_at=now - timedelta(seconds=item["age_seconds"]),
            lat=Decimal(str(lat_override if lat_override is not None else item["lat"])),
            lon=Decimal(str(item["lon"])),
        )
        for item in DEMO_DATA["gps_positions"]
    ]


def seed_database(session: Session) -> dict:
    route_data = DEMO_DATA["route"]
    route = get_or_create(
        session,
        Route,
        code=route_data["code"],
        direction=route_data["direction"],
        name=route_data["name"],
    )

    route_stops = {}
    for stop_data in DEMO_DATA["stops"]:
        stop = get_or_create(
            session,
            Stop,
            name=stop_data["name"],
            lat=Decimal(str(stop_data["lat"])),
            lon=Decimal(str(stop_data["lon"])),
        )
        stop.lat = Decimal(str(stop_data["lat"]))
        stop.lon = Decimal(str(stop_data["lon"]))
        route_stop = session.query(RouteStop).filter_by(route_id=route.id, stop_id=stop.id).first()
        if route_stop is None:
            route_stop = RouteStop(route_id=route.id, stop_id=stop.id, stop_order=stop_data["order"])
            session.add(route_stop)
            session.flush()
        else:
            route_stop.stop_order = stop_data["order"]
        route_stops[stop.name] = route_stop

    now = datetime.now(timezone.utc)
    trip_hour, trip_minute = map(int, DEMO_DATA["trip"]["starts_at_local"].split(":"))
    starts_at = now.replace(hour=trip_hour, minute=trip_minute, second=0, microsecond=0)
    trip = session.query(Trip).filter_by(route_id=route.id, service_date=now.date(), starts_at=starts_at).first()
    if trip is None:
        trip = Trip(route_id=route.id, service_date=now.date(), starts_at=starts_at)
        session.add(trip)
        session.flush()

    for stop_name, time_text in DEMO_DATA["trip"]["stop_times"].items():
        route_stop = route_stops[stop_name]
        hour, minute = map(int, time_text.split(":"))
        stop_time = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        existing = session.query(StopTime).filter_by(trip_id=trip.id, route_stop_id=route_stop.id).first()
        if existing is None:
            session.add(StopTime(
                trip_id=trip.id,
                route_stop_id=route_stop.id,
                route_id=route.id,
                arrival_at=stop_time,
                departure_at=stop_time,
            ))
        else:
            existing.arrival_at = stop_time
            existing.departure_at = stop_time

    vehicle = get_or_create(session, Vehicle, fleet_code=DEMO_DATA["vehicle"]["fleet_code"])
    session.query(GpsPosition).filter_by(vehicle_id=vehicle.id).delete(synchronize_session=False)
    for position in build_gps_positions(now, vehicle.id, trip.id):
        session.add(position)

    for role_code in ("carrier", "consumer", "admin", "auditor"):
        get_or_create(session, Role, code=role_code)

    dataset = session.query(Dataset).filter_by(code="gps-demo").first()
    if dataset is None:
        dataset = Dataset(code="gps-demo", kind="gps", schema_version="1.0", requires_consent=True)
        session.add(dataset)
        session.flush()
    else:
        dataset.kind = "gps"
        dataset.schema_version = "1.0"
        dataset.requires_consent = True

    consumer = get_or_create(session, Role, code="consumer")
    permission = session.query(DatasetPermission).filter_by(role_id=consumer.id, dataset_id=dataset.id, action="read").first()
    if permission is None:
        session.add(DatasetPermission(role_id=consumer.id, dataset_id=dataset.id, action="read"))

    allowed = get_or_create(
        session,
        User,
        email="demo-allowed",
        password_hash="!demo-not-for-auth",
        is_active=True,
    )
    allowed.password_hash = "!demo-not-for-auth"
    allowed.is_active = True
    if session.query(UserRole).filter_by(user_id=allowed.id, role_id=consumer.id).first() is None:
        session.add(UserRole(user_id=allowed.id, role_id=consumer.id))

    active_consent = session.query(Consent).filter_by(user_id=allowed.id, dataset_id=dataset.id, revoked_at=None).first()
    if active_consent is None:
        session.add(Consent(
            user_id=allowed.id,
            dataset_id=dataset.id,
            granted_at=now,
            valid_until=now + timedelta(days=365),
            revoked_at=None,
        ))

    no_consent = get_or_create(
        session,
        User,
        email="demo-no-consent",
        password_hash="!demo-not-for-auth",
        is_active=True,
    )
    no_consent.password_hash = "!demo-not-for-auth"
    no_consent.is_active = True
    if session.query(UserRole).filter_by(user_id=no_consent.id, role_id=consumer.id).first() is None:
        session.add(UserRole(user_id=no_consent.id, role_id=consumer.id))

    session.commit()
    return {"route": route.code, "vehicle": vehicle.fleet_code, "dataset": dataset.code}


def main() -> None:
    session = SessionLocal()
    try:
        print(json.dumps(seed_database(session), ensure_ascii=False))
    finally:
        session.close()


if __name__ == "__main__":
    main()
