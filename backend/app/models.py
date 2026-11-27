from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, Date, ForeignKey, ForeignKeyConstraint,
    Integer, Numeric, String, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import DateTime

from app.db import Base


class Route(Base):
    __tablename__ = "routes"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32))
    direction: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(128))
    __table_args__ = (UniqueConstraint("code", "direction", name="uq_routes_code_direction"),)


class Stop(Base):
    __tablename__ = "stops"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    lat: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    lon: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    __table_args__ = (
        CheckConstraint("lat >= -90 AND lat <= 90", name="ck_stops_lat"),
        CheckConstraint("lon >= -180 AND lon <= 180", name="ck_stops_lon"),
    )


class RouteStop(Base):
    __tablename__ = "route_stops"
    id: Mapped[int] = mapped_column(primary_key=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"))
    stop_id: Mapped[int] = mapped_column(ForeignKey("stops.id"))
    stop_order: Mapped[int] = mapped_column(Integer)
    __table_args__ = (
        UniqueConstraint("route_id", "stop_order", name="uq_route_stops_route_order"),
        UniqueConstraint("id", "route_id", name="uq_route_stops_id_route"),
        CheckConstraint("stop_order > 0", name="ck_route_stops_stop_order"),
    )


class Trip(Base):
    __tablename__ = "trips"
    id: Mapped[int] = mapped_column(primary_key=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"))
    service_date: Mapped[date] = mapped_column(Date)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    __table_args__ = (UniqueConstraint("id", "route_id", name="uq_trips_id_route"),)


class StopTime(Base):
    __tablename__ = "stop_times"
    trip_id: Mapped[int] = mapped_column(primary_key=True)
    route_stop_id: Mapped[int] = mapped_column(primary_key=True)
    route_id: Mapped[int] = mapped_column(primary_key=True)
    arrival_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    departure_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        ForeignKeyConstraint(["trip_id", "route_id"], ["trips.id", "trips.route_id"]),
        ForeignKeyConstraint(["route_stop_id", "route_id"], ["route_stops.id", "route_stops.route_id"]),
        CheckConstraint("departure_at >= arrival_at", name="ck_stop_times_departure"),
    )


class Vehicle(Base):
    __tablename__ = "vehicles"
    id: Mapped[int] = mapped_column(primary_key=True)
    fleet_code: Mapped[str] = mapped_column(String(32), unique=True)


class GpsPosition(Base):
    __tablename__ = "gps_positions"
    id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"))
    trip_id: Mapped[int | None] = mapped_column(ForeignKey("trips.id"), nullable=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    lat: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    lon: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    __table_args__ = (
        UniqueConstraint("vehicle_id", "observed_at", name="uq_gps_vehicle_observed"),
        CheckConstraint("lat >= -90 AND lat <= 90", name="ck_gps_lat"),
        CheckConstraint("lon >= -180 AND lon <= 180", name="ck_gps_lon"),
    )


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    failed_login_count: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Role(Base):
    __tablename__ = "roles"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)


class UserRole(Base):
    __tablename__ = "user_roles"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), primary_key=True)


class Dataset(Base):
    __tablename__ = "datasets"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True)
    kind: Mapped[str] = mapped_column(String(32))
    schema_version: Mapped[str] = mapped_column(String(32))
    requires_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    title: Mapped[str | None] = mapped_column(String(128), nullable=True)
    classification: Mapped[str | None] = mapped_column(String(32), nullable=True)
    owner: Mapped[str | None] = mapped_column(String(128), nullable=True)
    description: Mapped[str | None] = mapped_column(String(512), nullable=True)
    retention_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    __table_args__ = (
        CheckConstraint("retention_days IS NULL OR retention_days > 0", name="ck_datasets_retention_days"),
    )


class DatasetPermission(Base):
    __tablename__ = "dataset_permissions"
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), primary_key=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id"), primary_key=True)
    action: Mapped[str] = mapped_column(String(32), primary_key=True)


class Consent(Base):
    __tablename__ = "consents"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id"))
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    valid_until: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ExchangeRequest(Base):
    __tablename__ = "exchange_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id"))
    action: Mapped[str] = mapped_column(String(32))
    state: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int | None] = mapped_column(ForeignKey("exchange_requests.id"), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    outcome: Mapped[str] = mapped_column(String(32))
    reason_code: Mapped[str] = mapped_column(String(32))
