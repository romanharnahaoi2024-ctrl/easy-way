"""Публічні дані транспорту та каталог наборів (EZW-42): /routes, /positions/latest, /datasets."""
from fastapi import APIRouter, Depends
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_db
from app.models import Dataset, GpsPosition, Route, RouteStop, Stop, Trip, User, Vehicle

router = APIRouter(tags=["public-data"])


def fetch_routes(db: Session) -> tuple[list, list]:
    routes = db.query(Route).order_by(Route.code, Route.direction).all()
    stop_rows = (
        db.query(RouteStop.route_id, RouteStop.stop_order, Stop.id, Stop.name, Stop.lat, Stop.lon)
        .select_from(RouteStop)
        .join(Stop, Stop.id == RouteStop.stop_id)
        .order_by(RouteStop.route_id, RouteStop.stop_order)
        .all()
    )
    return routes, stop_rows


def build_routes(routes: list, stop_rows: list) -> list[dict]:
    stops_by_route: dict[int, list[dict]] = {}
    for route_id, order, stop_id, name, lat, lon in stop_rows:
        stops_by_route.setdefault(route_id, []).append(
            {"id": stop_id, "name": name, "lat": float(lat), "lon": float(lon), "order": order}
        )
    return [
        {
            "code": route.code,
            "direction": route.direction,
            "name": route.name,
            "stops": stops_by_route.get(route.id, []),
        }
        for route in routes
    ]


def fetch_latest_positions(db: Session) -> list[tuple]:
    """Остання позиція кожного транспортного засобу."""
    latest = (
        db.query(GpsPosition.vehicle_id, func.max(GpsPosition.observed_at).label("max_observed"))
        .group_by(GpsPosition.vehicle_id)
        .subquery()
    )
    return (
        db.query(Vehicle.fleet_code, Route.code, GpsPosition.lat, GpsPosition.lon, GpsPosition.observed_at)
        .select_from(GpsPosition)
        .join(latest, and_(
            GpsPosition.vehicle_id == latest.c.vehicle_id,
            GpsPosition.observed_at == latest.c.max_observed,
        ))
        .join(Vehicle, Vehicle.id == GpsPosition.vehicle_id)
        .outerjoin(Trip, Trip.id == GpsPosition.trip_id)
        .outerjoin(Route, Route.id == Trip.route_id)
        .order_by(Vehicle.fleet_code)
        .all()
    )


def fetch_datasets(db: Session) -> list[Dataset]:
    return db.query(Dataset).order_by(Dataset.code).all()


@router.get("/routes")
def list_routes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    routes, stop_rows = fetch_routes(db)
    return build_routes(routes, stop_rows)


@router.get("/positions/latest")
def latest_positions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [
        {
            "fleet_code": fleet_code,
            "route_code": route_code,
            "lat": float(lat),
            "lon": float(lon),
            "observed_at": observed_at,
        }
        for fleet_code, route_code, lat, lon, observed_at in fetch_latest_positions(db)
    ]


@router.get("/datasets")
def list_datasets(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Лише метадані; доступ до даних перевіряє POST /exchange/requests."""
    return [
        {
            "code": item.code,
            "kind": item.kind,
            "schema_version": item.schema_version,
            "requires_consent": item.requires_consent,
        }
        for item in fetch_datasets(db)
    ]