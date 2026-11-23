"""Initial Easy Way database schema

Revision ID: 20261122_0001
Revises:
"""
from alembic import op
import sqlalchemy as sa

revision = "20261122_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("routes", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("code", sa.String(32), nullable=False), sa.Column("direction", sa.String(32), nullable=False), sa.Column("name", sa.String(128), nullable=False), sa.UniqueConstraint("code", "direction", name="uq_routes_code_direction"))
    op.create_table("stops", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("name", sa.String(128), nullable=False), sa.Column("lat", sa.Numeric(9, 6), nullable=False), sa.Column("lon", sa.Numeric(9, 6), nullable=False), sa.CheckConstraint("lat >= -90 AND lat <= 90", name="ck_stops_lat"), sa.CheckConstraint("lon >= -180 AND lon <= 180", name="ck_stops_lon"))
    op.create_table("route_stops", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("route_id", sa.Integer(), sa.ForeignKey("routes.id"), nullable=False), sa.Column("stop_id", sa.Integer(), sa.ForeignKey("stops.id"), nullable=False), sa.Column("stop_order", sa.Integer(), nullable=False), sa.UniqueConstraint("route_id", "stop_order", name="uq_route_stops_route_order"), sa.UniqueConstraint("id", "route_id", name="uq_route_stops_id_route"), sa.CheckConstraint("stop_order > 0", name="ck_route_stops_stop_order"))
    op.create_table("trips", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("route_id", sa.Integer(), sa.ForeignKey("routes.id"), nullable=False), sa.Column("service_date", sa.Date(), nullable=False), sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False), sa.UniqueConstraint("id", "route_id", name="uq_trips_id_route"))
    op.create_table("stop_times", sa.Column("trip_id", sa.Integer(), nullable=False), sa.Column("route_stop_id", sa.Integer(), nullable=False), sa.Column("route_id", sa.Integer(), nullable=False), sa.Column("arrival_at", sa.DateTime(timezone=True), nullable=False), sa.Column("departure_at", sa.DateTime(timezone=True), nullable=False), sa.ForeignKeyConstraint(["trip_id", "route_id"], ["trips.id", "trips.route_id"]), sa.ForeignKeyConstraint(["route_stop_id", "route_id"], ["route_stops.id", "route_stops.route_id"]), sa.PrimaryKeyConstraint("trip_id", "route_stop_id"), sa.CheckConstraint("departure_at >= arrival_at", name="ck_stop_times_departure"))
    op.create_table("vehicles", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("fleet_code", sa.String(32), nullable=False), sa.UniqueConstraint("fleet_code", name="uq_vehicles_fleet_code"))
    op.create_table("gps_positions", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("vehicle_id", sa.Integer(), sa.ForeignKey("vehicles.id"), nullable=False), sa.Column("trip_id", sa.Integer(), sa.ForeignKey("trips.id"), nullable=True), sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False), sa.Column("lat", sa.Numeric(9, 6), nullable=False), sa.Column("lon", sa.Numeric(9, 6), nullable=False), sa.UniqueConstraint("vehicle_id", "observed_at", name="uq_gps_vehicle_observed"), sa.CheckConstraint("lat >= -90 AND lat <= 90", name="ck_gps_lat"), sa.CheckConstraint("lon >= -180 AND lon <= 180", name="ck_gps_lon"))
    op.create_table("users", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("email", sa.String(255), nullable=False), sa.Column("password_hash", sa.String(255), nullable=False), sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()), sa.UniqueConstraint("email", name="uq_users_email"))
    op.create_table("roles", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("code", sa.String(32), nullable=False), sa.UniqueConstraint("code", name="uq_roles_code"))
    op.create_table("user_roles", sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False), sa.Column("role_id", sa.Integer(), sa.ForeignKey("roles.id"), nullable=False), sa.PrimaryKeyConstraint("user_id", "role_id"))
    op.create_table("datasets", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("code", sa.String(64), nullable=False), sa.Column("kind", sa.String(32), nullable=False), sa.Column("schema_version", sa.String(32), nullable=False), sa.Column("requires_consent", sa.Boolean(), nullable=False, server_default=sa.false()), sa.UniqueConstraint("code", name="uq_datasets_code"))
    op.create_table("dataset_permissions", sa.Column("role_id", sa.Integer(), sa.ForeignKey("roles.id"), nullable=False), sa.Column("dataset_id", sa.Integer(), sa.ForeignKey("datasets.id"), nullable=False), sa.Column("action", sa.String(32), nullable=False), sa.PrimaryKeyConstraint("role_id", "dataset_id", "action"))
    op.create_table("consents", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False), sa.Column("dataset_id", sa.Integer(), sa.ForeignKey("datasets.id"), nullable=False), sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False), sa.Column("valid_until", sa.DateTime(timezone=True), nullable=False), sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table("exchange_requests", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False), sa.Column("dataset_id", sa.Integer(), sa.ForeignKey("datasets.id"), nullable=False), sa.Column("action", sa.String(32), nullable=False), sa.Column("state", sa.String(32), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table("audit_events", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("request_id", sa.Integer(), sa.ForeignKey("exchange_requests.id"), nullable=False), sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False), sa.Column("outcome", sa.String(32), nullable=False), sa.Column("reason_code", sa.String(32), nullable=False))


def downgrade() -> None:
    for table in ("audit_events", "exchange_requests", "consents", "dataset_permissions", "datasets", "user_roles", "roles", "users", "gps_positions", "vehicles", "stop_times", "trips", "route_stops", "stops", "routes"):
        op.drop_table(table)
