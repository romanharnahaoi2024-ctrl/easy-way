"""Демо-користувачі інших ролей для скриншотів і спільного прогону (EZW-42/EZW-54).

Викликається з seed.main() після seed_database(). Ідемпотентна.
Матриця прав: admin може читати gps-demo лише за чинної згоди, тому адміну даємо і згоду.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.auth import hash_password
from app.models import Consent, Dataset, DatasetPermission, Role, User, UserRole

DEMO_ROLE_USERS = (
    ("demo.admin@easyway.lviv.ua", "admin"),
    ("demo.auditor@easyway.lviv.ua", "auditor"),
    ("demo.carrier@easyway.lviv.ua", "carrier"),
)


def seed_role_users(session: Session, demo_password: str) -> list[str]:
    dataset = session.query(Dataset).filter_by(code="gps-demo").first()
    if dataset is None:
        raise RuntimeError("спочатку seed_database(): набір gps-demo не знайдено")

    now = datetime.now(timezone.utc)
    emails = []
    for email, role_code in DEMO_ROLE_USERS:
        role = session.query(Role).filter_by(code=role_code).first()
        if role is None:
            role = Role(code=role_code)
            session.add(role)
            session.flush()

        user = session.query(User).filter_by(email=email).first()
        if user is None:
            user = User(email=email, password_hash=hash_password(demo_password), is_active=True)
            session.add(user)
            session.flush()
        else:
            user.password_hash = hash_password(demo_password)
            user.is_active = True

        if session.query(UserRole).filter_by(user_id=user.id, role_id=role.id).first() is None:
            session.add(UserRole(user_id=user.id, role_id=role.id))

        if role_code == "admin":
            if session.query(DatasetPermission).filter_by(
                role_id=role.id, dataset_id=dataset.id, action="read"
            ).first() is None:
                session.add(DatasetPermission(role_id=role.id, dataset_id=dataset.id, action="read"))
            if session.query(Consent).filter_by(
                user_id=user.id, dataset_id=dataset.id, revoked_at=None
            ).first() is None:
                session.add(Consent(
                    user_id=user.id, dataset_id=dataset.id,
                    granted_at=now, valid_until=now + timedelta(days=365), revoked_at=None,
                ))
        emails.append(email)

    session.commit()
    return emails